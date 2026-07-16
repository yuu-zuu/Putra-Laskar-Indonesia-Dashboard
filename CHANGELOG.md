# Changelog

## 1.0.0 — 2026-07-15

- Baseline production-hardening untuk Vercel Node 24 dan PostgreSQL 18.
- Pool lifecycle Fluid Compute, timeout database/S3, strict production configuration, trusted-proxy control, dan session write throttling.
- Error response konsisten, request ID tersanitasi, status 405/503 deterministik, serta API client tahan timeout/response non-JSON.
- Migration advisory lock + checksum, schema verification, overlap constraints, audit search/trend index, dan query tren satu-pass.
- Transaksi mutation memakai satu helper rollback/release, registrasi/login/session/audit bersifat atomik, dan bootstrap admin menolak konflik identitas tanpa privilege escalation diam-diam.
- Validasi kalender/skala numerik mengikuti batas kolom; parser `BIGINT` mempertahankan presisi dan count kecil dicast eksplisit.
- Retry posting memakai advisory lock per idempotency key dan pemeriksaan kapasitas historis diubah dari correlated scan menjadi agregasi window satu-pass.
- Serialized visibility-aware polling, strict CSP yang tetap kompatibel dengan UI dinamis, serta static server Alpine yang diperkeras.
- Build selalu membersihkan output workspace, source map frontend production dimatikan, dan Docker context mengecualikan seluruh varian file environment/data lokal.
- GitHub Actions quality/database/container gates, Dependabot, repository hygiene, deployment runbook, dan production checklist.
- Validasi mutasi role/cabang kini menampilkan error per-field dan menolak alasan kosong sebelum request dikirim.
- Pengguna dapat mengganti password sendiri; admin dapat mereset password akun lain dengan alasan audit. Kedua alur mencabut sesi lama, tidak mencatat password, dan menangani perubahan bersamaan secara aman.
- Validator UUID kini mengikuti domain nilai PostgreSQL dan menerima ID seed deterministik tanpa melonggarkan format kanonis; penempatan akun ke cabang Pangkalan Balai tidak lagi ditolak sebagai cabang tidak valid.
- Client browser sama sekali tidak memakai `crypto.randomUUID()`; request ID ditetapkan API dan transport tidak bergantung pada `AbortSignal.timeout/any`.
- Build memiliki fingerprint `/build-info.json`; quality gate memindai aset production dan menolak rilis bila API browser yang dilarang muncul kembali.
- Request login/API tidak lagi menghasilkan UUID pada perangkat; request ID kini selalu ditetapkan API. Seluruh UUID runtime API memakai `randomBytes`, dan target frontend dikembalikan ke ES2024.
- Mutasi role/cabang memakai satu statement bersama yang tidak menyentuh credential. Unit guard dan regression test PostgreSQL membuktikan password lama tetap valid; login password salah pada akun yang dikenal dicatat sebagai `DENIED` tanpa merekam password.
- Build frontend tetap menargetkan ES2024; storage, clipboard, ResizeObserver, structured clone, tinggi viewport, dan hash demo memiliki fallback terisolasi. Batas dukungan browser/OS didokumentasikan tanpa mengklaim dukungan Symbian/legacy yang tidak realistis.
