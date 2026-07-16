# Testing dan quality gate

## Command standar

```bash
npm ci
npm run format:check
npm run lint
npm run check
npm run test:coverage
npm run build
npm audit
```

`npm run quality` menjalankan format check, lint, type check, test coverage, dan build dalam satu command. Formatter/linter Biome mencakup TypeScript, TSX, CSS, JSON, dan Markdown yang didukung; TypeScript compiler memeriksa API, web, contracts, serta adapter Vercel.

`npm run test:browser-compat` memastikan `crypto.randomUUID` tidak pernah disentuh, lalu mensimulasikan browser tanpa Web Crypto, tanpa AbortController, dan dengan localStorage yang melempar `SecurityError`. Test ini menjadi bagian wajib `npm run quality` dan CI.

Job database CI juga menjalankan `npm run db:verify-account-assignment`. Test tersebut memakai SQL assignment yang sama dengan route admin, mengubah role/cabang di dalam transaksi yang selalu di-rollback, lalu membuktikan hash dan verifikasi password lama tetap identik.

## Coverage

Suite menggunakan test runner bawaan Node dan gate minimum 90% untuk line, function, dan branch pada modul yang diuji. Test domain saat ini mencakup:

| Area | Skenario |
|---|---|
| FIFO | Urutan layer, split allocation, insufficient stock, invalid quantity, weighted cost |
| Password | Hash/verify, password salah, format hash invalid |
| Input akun | Normalisasi email/ID, password exact, kompleksitas dan panjang |
| Registration code | Window aktif, rotasi per jam, kode salah, secret |
| Error | Mapping AppError, retryable, database code, safe public response |
| HTTP router | Static/dynamic route, decode parameter, method discovery, malformed path |
| Validasi | String/object, finite number, scale DB, integer, enum, boolean, tanggal kalender |
| S3 signer | Canonical request, path style, MIME/size, expiry, URL output |
| Formula contracts | Stock closing, meter quantity, variance, gross profit |
| Client provenance | Allowlisted origin, Fetch Metadata, native key valid/salah, local bypass |
| UUID runtime | Format v4, variant, dan keunikan generator `randomBytes` |
| Assignment akun | Statement tidak menyentuh password/email/ID; invariant diverifikasi pada PostgreSQL |

Coverage unit bukan bukti bahwa SQL/Compose/browser benar. Production readiness juga memerlukan integration dan E2E pada environment PostgreSQL/object-storage yang nyata.

Baseline rilis 1.0.0: core API 97,65% line, 92,70% branch, 98,28% function; formula contracts 100% untuk ketiga metrik. Gate dijalankan oleh Node test runner pada setiap pull request.

## Integration test yang wajib sebelum go-live

1. Migration dari database kosong dan dari snapshot versi sebelumnya.
2. Bootstrap menghasilkan tepat satu admin tanpa master/transaksi palsu.
3. Admin membuat branch → product → stock unit → opening layer → meter mapping.
4. Dua posting sale bersamaan pada layer yang sama tidak membuat remaining negatif.
5. Retry idempotency mengembalikan record sama tanpa movement/allocation duplikat.
6. Transfer mengurangi source, menambah destination, dan mempertahankan cost layer.
7. Correction menyimpan revision before/after dan trigger menolak edit revision/audit/comment.
8. Non-admin tidak dapat mengakses branch lain; operator tidak dapat membuat product/branch.
9. Avatar upload menolak MIME/size salah dan URL signed dapat PUT/GET dari origin web.
10. Export XLSX dibuka oleh Excel/LibreOffice dan angka direkonsiliasi dengan query sumber.
11. Admin membuat akun tanpa register; akun dapat login; delete mencabut semua sesi dan last-admin guard tetap aktif.
12. Production menolak origin asing, native key salah, serta request tanpa provenance.

## UAT workbook lokal

Setelah reset volume dan seed:

```sql
SELECT MIN(business_date), MAX(business_date), COUNT(*)
FROM inventory_movement
WHERE source_type='XLSX_IMPORT';

SELECT stock_unit_id, SUM(quantity_delta) AS closing_qty
FROM inventory_movement
WHERE posting_status='POSTED'
GROUP BY stock_unit_id
ORDER BY stock_unit_id;
```

Ekspektasi saldo terakhir: depan `2901.540`, belakang `2652.750`. Jumlah movement workbook `320`; jumlah bacaan meter valid `268`.

## Browser matrix

Gunakan baseline dan fallback pada [COMPATIBILITY.md](COMPATIBILITY.md). Minimum teknis bukan pengganti QA pada browser/perangkat fisik.

- Firefox current, Chromium current, Safari current.
- Desktop 1366×768 dan 1920×1080.
- Mobile portrait 360×800 dan 390×844.
- Keyboard-only: skip link, sidebar, tooltip focus, dialog, tutorial, table scroll.
- Zoom 200%, prefers-reduced-motion, serta kontras ketiga tema.

Periksa khusus: semua role dapat mengganti avatar dan header berubah tanpa logout; spotlight tidak menutupi target; object ID panjang scroll di dalam cell; rentang grafik 7/14/30/60/90 tidak menumpuk label; hover/touch/panah keyboard menampilkan titik grafik yang sama; popup tetap berada di viewport; tooltip rumus dan placeholder pencarian berubah lengkap pada ID/EN/ZH.

Pada viewport 320, 360, 390, dan 430 px, periksa header dua baris, selector cabang, bottom navigation horizontal, modal, seluruh form/action, dashboard cards, report, profil, audit, dan tutorial. Bacaan meter wajib menampilkan kartu mobile atau state loading/error/kosong yang eksplisit. Tombol info panel harus tetap 24 px di pojok kanan atas, bukan melebar mengikuti panel.

Uji tutorial dengan nol, satu, dan dua cabang: nol/satu tidak boleh mengunci tombol Berikutnya, sedangkan dua cabang tetap meminta perubahan nyata. Uji kontrol yang belum tersedia, sidebar toggle yang tersembunyi di mobile, target di bagian atas/tengah/bawah halaman, orientasi portrait, scroll halaman saat spotlight aktif, tombol minimalkan/buka panduan, target touch untuk langkah hover, serta popup/modal dari langkah sebelumnya. Uji pula tombol mata pada login, register, hapus akun, dan pembuatan akun admin. Untuk LAN, buka web/API dari HP memakai IP laptop dan pastikan login, cookie sesi, avatar GET/PUT, serta broadcast berhasil.

## Load dan resilience

- Jalankan load test pada endpoint dashboard polling dengan pool production-equivalent.
- Ukur p95/p99 dan connection saturation; targetkan Function region dekat database.
- Simulasikan object storage timeout, database disconnect, expired session, duplicate request, dan rollback tengah transaksi.
- Uji mutasi role/cabang, larangan menurunkan admin terakhir/role sendiri, alasan audit, pembersihan seluruh prefix storage ketika akun dihapus, serta pembatalan delete bila storage gagal.
- Pastikan error response tetap konsisten dan request ID dapat ditemukan di server log/audit.

## Upgrade dependency

```bash
NPM_CONFIG_CACHE=/tmp/npm-cache npm outdated --workspaces --include-workspace-root
npm view react version
npm view vite version
```

Upgrade satu kelompok kompatibel, regenerasi lockfile dengan npm versi yang disepakati, jalankan quality gate, lalu verifikasi build Alpine dan Vercel preview. Jangan memakai tag `latest` pada image production/local yang perlu reproduktif.
