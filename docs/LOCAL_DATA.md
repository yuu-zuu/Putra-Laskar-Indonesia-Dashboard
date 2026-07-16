# Dataset local dari workbook

Seed `database/seeds/001_local_workbook.sql` dibuat dari file yang diberikan pengguna:

`Laporan Stock Pangkalan Balai (OLAH)(1)(1).xlsx`

Seed hanya boleh dijalankan dengan `NODE_ENV=development` dan `ALLOW_LOCAL_SEED=true`. Kode menolak seed pada production tanpa pengecualian.

## Cakupan yang diimpor

| Sumber | Cakupan | Hasil |
|---|---|---|
| Sheet `Jan`, `Feb`, `Mar`, `Apr`, `Mei`, `Juni` | 1 Januari–1 Juli 2026 | 320 movement ledger |
| Sheet `Meteran` | 1 Februari–14 Juni 2026 | 268 bacaan meter valid |
| Unit laporan | Pompa Depan, Pompa Belakang | Dua stock unit dan dua meter unit local |

Seluruh 182 hari (364 baris hari/unit) direkonsiliasi ulang terhadap rumus `opening + supply - sales + return + adjustment = closing`; tidak ada discrepancy di atas 0,011 L. Formula `#REF!` pada ringkasan margin sheet Maret tidak digunakan.

## Mapping kolom

| Workbook | Database |
|---|---|
| Stock awal pertama | `inventory_movement.OPENING` |
| Pembelian | `SUPPLY` |
| Penjualan laporan stock | `SALE` dengan delta negatif |
| Retur liter | `SALES_RETURN` |
| Gain/loss positif | `GAIN` |
| Gain/loss negatif | `LOSS` |
| Meter awal/akhir | `sales_meter_reading.meter_start/meter_end` |
| Setor | `cash_deposit_amount` |
| Keterangan | `note` |

Baris meter kosong, reset menjadi nol, atau tanpa meter akhir tidak diimpor. Bacaan nol dengan counter valid tetap diimpor karena merepresentasikan hari tanpa penjualan.

## Nilai yang tidak tersedia di workbook

| Field wajib | Nilai local | Alasan |
|---|---:|---|
| Kapasitas Pompa Depan | 8.000 L | Maksimum teramati dibulatkan ke atas + 1.000 L |
| Kapasitas Pompa Belakang | 6.000 L | Maksimum teramati dibulatkan ke atas + 1.000 L |
| Low-stock threshold | 0 L | Nilai netral; harus dikonfigurasi admin |
| Biaya/harga layer carry-forward | 0 | Sentinel `MIGRATION_UNCOSTED`, bukan harga bisnis |

Saldo terakhir workbook adalah 2.901,540 L depan dan 2.652,750 L belakang. Dua layer `MIGRATION_UNCOSTED` dengan saldo tersebut dibuat agar local workflow berikutnya dapat mengonsumsi FIFO. Karena cost historis tidak ada, profit untuk liter carry-forward belum bermakna. Sebelum memakai data impor untuk keputusan finansial, admin wajib mengganti proses migrasi dengan cost/harga sumber yang tervalidasi.

Bacaan meter impor berstatus `POSTED`; transaksi nonzero tetap `PENDING` karena workbook tidak menyediakan allocation cost/selling yang dapat membentuk expected sales amount. Ini sengaja menjaga data sumber tetap jujur dan memberi ruang audit.

## Menjalankan ulang seed

Runner mencatat nama file seed, sehingga seed tidak dijalankan dua kali pada database yang sama. Karena versi lama pernah memakai data demo, upgrade lokal harus menghapus volume lama agar ledger immutable tidak tercampur:

```bash
podman compose down --volumes --remove-orphans
./scripts/podman-compose.sh up --build
```

Docker:

```bash
docker compose down --volumes --remove-orphans
docker compose up --build
```

Perintah ini menghapus database dan object local. Jangan jalankan pada volume yang berisi data yang ingin dipertahankan.

## Production kosong

Pada production jalankan hanya:

```bash
npm run db:migrate
npm run auth:bootstrap-admin
```

Hasil awal: satu admin (`ADMIN-001`), tanpa cabang, produk, unit stock, meter, transaksi, broadcast, atau log palsu. Admin membuat cabang dari header, lalu produk/unit dari halaman Unit Stock, kemudian pompa/meter dari halaman master pompa.
