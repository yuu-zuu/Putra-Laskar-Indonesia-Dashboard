# Maintenance dan runbook

## Ritme pemeliharaan

| Frekuensi | Pekerjaan |
|---|---|
| Harian | Pantau error rate, latency, pool saturation, storage error, failed/denied audit spike |
| Mingguan | Review akun/sesi aktif, failed reconciliation, object yatim, backup status |
| Bulanan | Dependency/image update, restore sample, index/query review, secret/access review |
| Kuartalan | Full restore drill, role/branch UAT, incident exercise, retention purge terkontrol |
| Sebelum release | Migration rehearsal, quality gate, Vercel preview, smoke/UAT, rollback plan |

## Release aman

1. Tarik backup dan catat versi migration terakhir.
2. Jalankan `npm ci` dan `npm run quality` pada Node 24 LTS yang sama dengan Vercel/Compose.
3. Terapkan migration pada staging copy.
4. Deploy preview; jalankan smoke auth, dashboard, mutation, upload, export.
5. Terapkan migration production dari runner administratif, bukan Function request.
6. Deploy code, pantau request ID/error/pool, lalu selesaikan UAT singkat.

Untuk perubahan schema destruktif, gunakan expand/contract lintas dua release. Jangan mengubah migration yang sudah diterapkan.

## Backup dan restore

Minimum production:

- PostgreSQL point-in-time recovery atau backup harian terenkripsi.
- Retention sesuai kebijakan bisnis/hukum.
- Object storage versioning/lifecycle bila evidence penting.
- Backup configuration/secrets melalui secret manager, bukan repository.

Contoh backup logis manual:

```bash
pg_dump --format=custom --no-owner --file=pli.dump "$DATABASE_URL"
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" pli.dump
```

Restore drill harus memverifikasi jumlah row, login admin uji, saldo stock, audit immutable, dan signed upload pada environment terisolasi.

## Observability

Server log berbentuk JSON dan request memiliki ID. Dashboard operasional minimum:

- request count/status/path;
- p50/p95/p99 latency;
- database connection active/wait;
- query lambat dan deadlock;
- Function timeout/cold start;
- failed/denied audit per action;
- upload presign/upload failure;
- reconciliation pending/escalated age.

Pengguna hanya melihat pesan aman + request ID. Developer menelusuri request ID pada Function log, lalu audit metadata dan database event terkait.

## Incident cepat

### Error 500 meningkat

1. Ambil request ID contoh dan endpoint.
2. Periksa deployment baru, DB connectivity, pool, migration, serta object endpoint.
3. Jika release penyebab, rollback code; jangan rollback migration destruktif tanpa rencana data.
4. Catat timeline dan dampak; publish broadcast jika operasi terganggu.

### Pool/database habis

1. Periksa connection count dan query menggantung.
2. Turunkan concurrency/polling atau `DB_POOL_MAX` per Function jika total instance × pool melebihi limit.
3. Gunakan pooled endpoint dan Function region dekat database.
4. Optimalkan query/index berdasarkan `EXPLAIN (ANALYZE, BUFFERS)` staging.

### Credential object storage bocor

1. Revoke key provider dan buat key baru.
2. Update secret environment lalu redeploy.
3. Audit object access/version, CORS, dan signed URL abuse.
4. Hapus key lama setelah seluruh deployment memakai key baru.

### Registration code tersebar

Rotasi `REGISTRATION_CODE_SECRET`, redeploy API, review akun baru/audit `REGISTER`, lalu nonaktifkan akun tidak sah. Kode window lama langsung tidak valid setelah secret berubah.

## Data cleanup

- Jangan delete `audit_log`, revisions, atau comments; trigger memang menolak.
- Account deletion adalah soft-delete/anonymization.
- Master dinonaktifkan agar foreign key history tetap valid.
- Object avatar lama dapat menjadi yatim setelah pengguna mengganti foto. Tambahkan job lifecycle yang membandingkan prefix terhadap `avatar_object_key` aktif sebelum delete.
- Seed local direset dengan menghapus volume, bukan mengedit ledger.

## Upgrade library dan image

1. Cek npm registry dan release notes resmi.
2. Update exact versions dan lockfile.
3. Review install scripts/optional native bindings.
4. Jalankan audit, quality, Alpine build, preview deploy.
5. Untuk PostgreSQL major/image, ikuti upgrade/backup procedure resmi; jangan cukup mengganti tag terhadap volume production.

Project menghindari SDK besar, tetapi dependensi kecil tetap harus dipantau. `write-excel-file` di-load dinamis agar tidak membebani route awal.

## Menambah fitur

Checklist definition of done:

- contract English dan UI terlokalisasi penuh;
- role/branch/ownership eksplisit;
- transaction/idempotency untuk mutation;
- audit success/failure/denied dan request ID;
- migration/index/retention terdokumentasi;
- tooltip/aria/keyboard/mobile/ketiga tema;
- test domain + integration scenario;
- API, code map, ERD, env, deploy, dan runbook diperbarui bila terdampak.
