# Contributing

## Baseline

Gunakan Node 24.x, npm 11/12, dan lockfile yang dikomit. Mulai perubahan dengan:

```bash
npm ci --include=optional
npm run quality
```

## Konvensi arsitektur

- `packages/contracts`: DTO, enum, dan formula murni lintas client/server; tidak mengakses I/O.
- `apps/api/routes`: boundary HTTP, auth/authorization, parsing, dan orkestrasi singkat.
- `apps/api/services`: aturan bisnis/transaksi lintas repository.
- `apps/api/repositories`: query baca yang dapat diuji/dioptimasi terpisah.
- `apps/web/data`: gateway API/mock; komponen tidak membangun URL API sendiri.
- `apps/web/components`: presentational/reusable; page mengatur workflow.
- CSS tetap pada file `.css` terpisah; jangan menambah framework utility untuk satu kasus.

API memakai controlled exception `AppError` sebagai satu strategi konsisten karena stack async TypeScript bekerja paling jelas dengan throw/catch pada boundary. Jangan mengembalikan object error ad-hoc dari route. Error tak dikenal dinormalisasi sekali oleh `handleRequest`, detail hanya masuk log server, dan response selalu memuat code/status/request ID yang aman.

Mutation harus memeriksa origin, sesi, role, branch/ownership, validasi input, idempotency bila relevan, serta menulis audit. Perubahan bisnis dan audit sukses berada dalam transaksi database yang sama. Jangan menahan transaksi terbuka untuk I/O eksternal tanpa timeout dan alasan yang terdokumentasi.

## Database

- Tambah migration `NNN_snake_case.sql`; jangan edit migration/seed yang pernah diterapkan.
- Gunakan parameter query, constraint database untuk invariant, index berdasarkan query nyata, dan lock eksplisit pada FIFO/concurrency.
- Uji dari database kosong, jalankan migration dua kali, lalu `npm run db:verify`.
- Gunakan expand/contract untuk perubahan breaking. Production tidak pernah menjalankan seed local.

## Pull request

Isi template PR, sertakan risiko/rollback, perbarui contracts/docs/env bersama perubahan perilaku, dan tambahkan test untuk bug/regresi. Jangan melemahkan gate coverage hanya agar CI hijau. Verifikasi UI relevan pada desktop, mobile, keyboard, serta tiga locale.
