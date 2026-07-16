# Dokumentasi teknis

Dokumen ini adalah indeks operasional dan arsitektur Putra Laskar Indonesia Dashboard. Mulai dari `ARCHITECTURE.md` untuk memahami sistem, lalu gunakan dokumen spesifik sesuai pekerjaan.

| Dokumen | Isi |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Batas sistem, pola perangkat lunak, alur request, realtime, dan deployment topology |
| [CODE_MAP.md](CODE_MAP.md) | Peta workspace, modul, kelas/fungsi penting, serta arah dependensi kode |
| [DATABASE.md](DATABASE.md) | ERD, tabel relasional, view, indeks, transaksi, FIFO, dan invariannya |
| [API.md](API.md) | Endpoint, role, payload penting, pagination, serta kontrak error |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Seluruh environment variable, scope browser/server, default, dan aturan secret |
| [LOCAL_DATA.md](LOCAL_DATA.md) | Mapping workbook sumber ke seed lokal, cakupan data, nilai yang diinferensikan, dan reset data |
| [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) | Deploy frontend + Node Function, migration, bootstrap admin, database, dan object storage |
| [CONTAINERS.md](CONTAINERS.md) | Docker/Podman Alpine, health check, troubleshooting, dan reset volume |
| [RUN_WINDOWS.md](RUN_WINDOWS.md) | Panduan PowerShell untuk Docker Desktop, Podman Desktop, UI demo, dan full stack |
| [RUN_LAN.md](RUN_LAN.md) | Akses dashboard local dari HP, IP laptop, port firewall, dan kontrol origin privat |
| [COMPATIBILITY.md](COMPATIBILITY.md) | Browser/OS yang didukung, fallback API, batas Symbian/legacy, dan matriks QA perangkat |
| [SECURITY.md](SECURITY.md) | Auth, session, kode registrasi, CSP, upload, audit immutable, dan hardening |
| [TESTING.md](TESTING.md) | Lint, formatter, test, coverage gate, build, audit, serta skenario UAT |
| [MAINTENANCE.md](MAINTENANCE.md) | Upgrade dependency, migration, backup/restore, observability, incident, dan runbook |
| [CI_CD.md](CI_CD.md) | GitHub Actions, branch protection, Vercel Git deployment, release, dan rollback |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Gate build, data, security, operasi, serta UAT sebelum go-live |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | Ringkasan keputusan desain dan status modul |

## Aturan data production

Production hanya menjalankan migration dan bootstrap satu akun admin. `npm run db:seed` memiliki guard dan selalu menolak `NODE_ENV=production`; file workbook hanya untuk local testing. Setelah bootstrap, admin membuat cabang, produk, unit stock, dan pompa/meter melalui UI/API.

## Urutan onboarding operator teknis

1. Siapkan environment sesuai [ENVIRONMENT.md](ENVIRONMENT.md).
2. Jalankan migration, kemudian bootstrap admin.
3. Buat cabang dan produk pertama.
4. Buat unit stock; catat saldo awal beserta biaya dan harga layer FIFO.
5. Buat pompa/meter dan petakan ke unit stock dengan tanggal efektif.
6. Uji posting meter, rekonsiliasi, ekspor, avatar, audit, dan backup sebelum go-live.
