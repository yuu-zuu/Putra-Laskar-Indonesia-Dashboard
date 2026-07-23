# Import histori stock operator ke production

Import ini **bukan** `db:seed`. Command khusus ini boleh dijalankan dengan `NODE_ENV=production`, tetapi default-nya selalu dry-run dan memiliki beberapa guard:

- advisory lock;
- satu transaksi atomik;
- fingerprint payload dan batch tracking;
- idempotency key per bacaan/mutasi;
- target unit harus belum memiliki aktivitas operasional atau layer FIFO;
- actor production wajib ditentukan;
- tanggal bisnis dan timestamp event operasional (`created_at`, `posted_at`, `occurred_at`) dibuat historis;
- waktu eksekusi batch import tetap memakai waktu sebenarnya;
- metadata audit tetap menyatakan `entryMode=HISTORICAL_IMPORT`, sehingga histori terlihat realistis tanpa dipalsukan seolah-olah benar-benar diketik manual pada masa lalu.

## Cakupan payload terlampir

- 1 Maret 2026 sampai 15 Juli 2026.
- 694 baris operasional.
- 712 mutasi stock.
- 677 bacaan meter.
- 52 stock opname.
- Cabang: PBL, SKY, dan RCK.

Tanggal 16–31 Juli tidak dimasukkan. Formula workbook mulai rusak pada 16 Juli karena `Meter Akhir` kosong dan formula menghasilkan penjualan negatif serta stock ratusan ribu liter.

Payload memiliki tujuh warning: enam anomali catatan/transfer dan satu warning struktural untuk stock negatif. Dry-run menampilkannya; apply membutuhkan flag `--acknowledge-source-warnings`. Dari 677 bacaan meter, 552 dapat ditandai `MATCHED` berdasarkan liter × harga jual = setoran, sedangkan 125 tetap `PENDING` karena selisih kas memang ada pada workbook.

## Penanganan stock negatif

Workbook memiliki 18 saldo akhir harian negatif pada SKY/POMPA-BELAKANG, dengan titik terendah -242 L, serta satu kekurangan FIFO intrahari pada SKY/POMPA-DEPAN. Ledger PostgreSQL dapat menyimpan saldo negatif, tetapi `stock_layer.remaining_qty` tidak boleh negatif dan fungsi FIFO aplikasi menolak penjualan tanpa layer yang cukup.

Importer menangani kondisi ini dengan **FIFO deficit bridge** yang eksplisit:

1. saat layer tidak cukup, dibuat layer bridge sementara dengan provenance `HISTORICAL_FIFO_DEFICIT`;
2. penjualan tetap dialokasikan FIFO dan saldo ledger harian tetap mengikuti workbook;
3. penerimaan atau retur berikutnya mengurangi layer baru sebesar deficit yang belum pulih;
4. setiap create/recovery dicatat di tracking dan audit;
5. import gagal bila masih ada deficit pada akhir payload.

Payload ini mengharapkan 11 event bridge dengan total 1.104,070 L dan seluruhnya pulih sebelum 15 Juli 2026. Harga pokok bridge menggunakan cost rule aktif pada tanggal deficit; karena itu cost schedule tetap wajib bila laporan laba harus valid.

## Syarat master data

Sebelum import, production harus sudah memiliki kode berikut. Gunakan akun admin khusus import sebagai `--actor-email`; jangan mengatribusikan data lama kepada operator tertentu karena workbook tidak memuat identitas operator.

| Cabang | Unit stock | Meter |
|---|---|---|
| PBL | POMPA-DEPAN | METER-DEPAN |
| PBL | POMPA-BELAKANG | METER-BELAKANG |
| SKY | POMPA-DEPAN | METER-DEPAN |
| SKY | POMPA-BELAKANG | METER-BELAKANG |
| RCK | POMPA-DEPAN | METER-DEPAN |
| RCK | POMPA-BELAKANG | METER-BELAKANG, hanya diperlukan bila kelak ada bacaan meter |

Assignment meter ke unit stock harus mencakup seluruh periode import. Buat master melalui UI agar nama, kapasitas, dan assignment sesuai production. Importer tidak membuat atau menimpa master data.

## Harga pokok FIFO

Workbook hanya memuat liter, meter, retur, setoran, stock, dan sounding. Workbook tidak memuat harga beli/harga pokok per supply. Karena itu, histori laba FIFO yang benar membutuhkan cost schedule terpisah.

Salin template:

```bash
cp database/imports/stock-operator-costs.example.json \
  database/imports/stock-operator-costs.production.json
```

Isi `unitCost` untuk setiap periode harga pokok. Tambahkan rule baru ketika harga berubah. Rule yang lebih baru dipilih berdasarkan `validFrom`. `stockUnitCode: "*"` berlaku untuk seluruh unit pada cabang.

`unitSellingPrice` biasanya dapat dibiarkan kosong karena payload menginfer harga jual valid dari meter dan setoran. Isi secara eksplisit untuk unit yang belum memiliki transaksi penjualan, terutama RCK/POMPA-BELAKANG.

`--allow-uncosted` hanya untuk migrasi kuantitas darurat. Semua layer tanpa rule akan memakai biaya 0, sehingga laba historis menjadi tidak valid.

## Urutan aman

1. Backup production dan uji restore.
2. Buat clone/staging dari production.
3. Apply patch, jalankan `npm install` bila diperlukan, lalu migration.
4. Pastikan unit target kosong dari mutasi, bacaan, opname, dan layer FIFO.
5. Jalankan dry-run terhadap staging.
6. Verifikasi saldo akhir dan laporan.
7. Baru jalankan apply pada production dalam maintenance window.

Migration:

```bash
npm run db:migrate
npm run db:verify
```

Dry-run dengan cost schedule:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email admin-production@example.com \
  --cost-file database/imports/stock-operator-costs.production.json
```

Dry-run tetap menjalankan seluruh insert dan validasi di dalam transaksi, lalu `ROLLBACK`.

Apply:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email admin-production@example.com \
  --cost-file database/imports/stock-operator-costs.production.json \
  --acknowledge-source-warnings \
  --apply
```

Kuantitas-only, tidak direkomendasikan untuk laporan laba:

```bash
npm run db:import-historical -- \
  --file database/imports/stock-operator-2026-03-to-2026-07-15.json \
  --actor-email admin-production@example.com \
  --allow-uncosted \
  --acknowledge-source-warnings \
  --apply
```

## Kondisi yang membuat importer berhenti

Importer menolak apply bila unit target sudah memiliki mutasi, layer FIFO, bacaan meter, atau opname. Backdating ke unit yang sudah berjalan akan mengubah urutan FIFO dan membuat alokasi transaksi yang lebih baru tidak konsisten. Dalam kondisi tersebut, gunakan clone/staging, ekspor seluruh aktivitas unit, kosongkan hanya pada clone, lalu lakukan full replay kronologis sebelum cutover. Jangan memakai `DELETE` langsung di production tanpa prosedur rekonsiliasi dan backup.

## Verifikasi sesudah apply

```sql
SELECT branch.code, stock.code, SUM(movement.quantity_delta) AS ledger_qty
FROM inventory_movement movement
JOIN branch ON branch.id=movement.branch_id
JOIN stock_unit stock ON stock.id=movement.stock_unit_id
WHERE branch.code IN ('PBL','SKY','RCK')
GROUP BY branch.code, stock.code
ORDER BY branch.code, stock.code;

SELECT branch.code, stock.code, SUM(layer.remaining_qty) AS fifo_qty
FROM stock_layer layer
JOIN stock_unit stock ON stock.id=layer.stock_unit_id
JOIN branch ON branch.id=stock.branch_id
WHERE branch.code IN ('PBL','SKY','RCK')
GROUP BY branch.code, stock.code
ORDER BY branch.code, stock.code;
```

Expected per 15 Juli 2026:

| Cabang/unit | Liter |
|---|---:|
| PBL/POMPA-DEPAN | 226.560 |
| PBL/POMPA-BELAKANG | 3,036.850 |
| SKY/POMPA-DEPAN | 1,598.000 |
| SKY/POMPA-BELAKANG | 1,576.690 |
| RCK/POMPA-DEPAN | 743.000 |
| RCK/POMPA-BELAKANG | 300.000 |
