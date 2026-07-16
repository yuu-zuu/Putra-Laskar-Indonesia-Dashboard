# CI/CD dan release

## Model yang dipakai

Continuous Integration berjalan di GitHub Actions. Continuous Deployment production memakai Vercel Git Integration, sehingga tidak ada token Vercel di workflow repository. Branch `main` hanya boleh menerima pull request yang sudah lulus semua required checks; Vercel kemudian membangun commit `main` yang sama.

Required checks:

| Job | Isi |
|---|---|
| `Quality gate (Node 24 LTS)` | install lockfile, audit high severity, format, lint, type-check, unit coverage, build |
| `PostgreSQL migration smoke test` | database PostgreSQL 18 kosong, migration dua kali, verifikasi relation/constraint, serta invariant password setelah mutasi role/cabang |
| `Alpine container builds` | build image terkunci, verifikasi non-root user, lalu smoke liveness API/web |

Workflow memakai permission `contents: read`, credential checkout tidak dipertahankan, timeout per job, concurrency cancellation, Node 24.18.0, dan npm 12.0.1. Dependabot memantau npm, GitHub Actions, dan image container setiap minggu.

## Setup GitHub pertama

Setelah `git init`, commit seluruh repository termasuk lockfile dan folder `.github`:

```bash
git add .
git commit -m "chore: production-ready baseline"
git branch -M main
git remote add origin <repository-url>
git push -u origin main
```

Di GitHub, aktifkan branch protection/ruleset untuk `main`:

1. wajib pull request;
2. wajib tiga checks di atas;
3. wajib branch up-to-date sebelum merge;
4. larang force-push dan deletion;
5. batasi bypass ke emergency owner yang terdokumentasi.

Dependency Review dapat ditambahkan untuk repository public atau private dengan GitHub Advanced Security. Workflow default tidak mengaktifkannya agar repository private biasa tidak gagal karena fitur yang tidak tersedia.

## Setup Vercel

1. Import repository dan pilih root repository sebagai Root Directory.
2. Hubungkan Production Branch ke `main`.
3. Set Node.js 24.x dan seluruh variable pada `.env.production.example` untuk Production.
4. Gunakan database/bucket staging serta domain berbeda untuk Preview; jangan memakai data production pada pull request.
5. Aktifkan Deployment Protection untuk preview yang memuat data internal.

`vercel.json` adalah source of truth untuk build web, output, Function catch-all, durasi, cache, dan security headers. Migration/seed tidak berjalan saat build Vercel.

## Urutan release schema

1. Backup dan rehearsal migration pada salinan staging.
2. Untuk perubahan breaking, terapkan pola expand/contract: tambah bentuk kompatibel, deploy kode transisi, backfill, baru hapus bentuk lama pada release berikutnya.
3. Jalankan `npm run db:migrate && npm run db:verify` dari runner administratif dengan environment production lengkap.
4. Merge commit aplikasi yang kompatibel ke `main`.
5. Tunggu deployment Vercel healthy, lalu jalankan smoke test.

Migration menggunakan advisory lock, checksum, dan transaksi per file. Menjalankannya dua kali aman; mengubah file yang pernah diterapkan akan ditolak.

## Rollback

- Kode: gunakan Vercel instant rollback ke deployment sehat sebelumnya.
- Schema: jangan membalik DDL secara spontan. Kembalikan kode yang kompatibel dengan schema baru atau terapkan migration korektif baru.
- Data: restore hanya melalui prosedur PITR/backup yang sudah diuji dan setelah write traffic dihentikan.
- Secret: rotasi di provider dan Vercel, deploy ulang, lalu cabut credential lama.

Catat release SHA, migration terakhir, operator, waktu, hasil smoke test, dan keputusan rollback pada change record.
