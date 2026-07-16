# Production readiness checklist

Checklist ini adalah release gate, bukan klaim bahwa pengujian independen dapat dilewati.

## Build dan kode

- [ ] Node 24.x dan npm 12 menjalankan `npm ci --include=optional` dari clone bersih.
- [ ] `npm run quality` dan `npm audit --audit-level=high` lulus.
- [ ] Tiga job GitHub Actions lulus pada commit yang akan dideploy.
- [ ] Tidak ada `.env`, credential, dump, workbook pengguna, atau log production dalam commit.
- [ ] Dependency baru memiliki alasan, versi exact, license yang diterima, dan review install script.

## Data

- [ ] Migration direhearsal pada salinan production dan `npm run db:verify` lulus.
- [ ] Endpoint PostgreSQL pooled, TLS, region, connection limit, statement timeout, backup, dan PITR benar.
- [ ] Restore drill berhasil dan RPO/RTO disetujui pemilik bisnis.
- [ ] Production tidak menjalankan `db:seed`; hanya satu admin bootstrap dan data lain kosong.
- [ ] FIFO concurrency, idempotency, correction history, serta audit immutability diuji.

## Security

- [ ] Seluruh invariant startup production lulus dengan `.env.production.example` sebagai acuan.
- [ ] `ALLOWED_WEB_ORIGINS` exact, LAN exception off, cookie `__Host-` Secure, provenance on.
- [ ] Database user aplikasi least-privilege; credential migration terpisah bila provider mendukung.
- [ ] Bucket private, policy prefix minimum, CORS exact, versioning/lifecycle, dan cleanup account diuji.
- [ ] WAF/rate limit edge aktif untuk auth dan pola abuse; native map kosong sampai client resmi tersedia.
- [ ] Review role/branch/ownership, session revocation, last-admin guard, CSP, dan secret scan selesai.
- [ ] Security review/penetration test independen selesai untuk data dan risiko organisasi yang sebenarnya.

## Operasi

- [ ] Function region dekat database; p95/p99, error rate, pool saturation, dan slow query memiliki alert.
- [ ] `/api/health` dan `/api/ready` dimonitor sesuai fungsi masing-masing.
- [ ] Log terstruktur dapat dicari dengan request ID tanpa mengekspos secret kepada pengguna.
- [ ] Runbook incident, owner on-call, maintenance window, rollback, serta status communication tersedia.
- [ ] Vercel preview dilindungi dan menggunakan layanan staging, bukan production.

## UAT

- [ ] Admin/operator/manager/finance/auditor diuji pada branch sendiri dan branch terlarang.
- [ ] Desktop, mobile 320–430 px, keyboard-only, ID/EN/ZH, tiga tema, dan reduced-motion diuji.
- [ ] Avatar, broadcast, grafik hover/touch, XLSX, tutorial, rekonsiliasi, audit, serta penghapusan akun lulus.
- [ ] Angka dashboard direkonsiliasi dengan query ledger dan laporan sumber yang disetujui bisnis.
