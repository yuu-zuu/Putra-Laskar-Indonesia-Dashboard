# Container lokal: Docker dan Podman

Compose memakai nama image fully-qualified agar tidak bergantung pada `registries.conf` milik host. Image aplikasi lokal memakai prefix `localhost/`, yang merupakan namespace lokal Podman dan bukan registry internet.

## Versi yang dikunci

Versi ini diverifikasi pada 15 Juli 2026. Tag eksplisit dipakai agar build dapat direproduksi; pembaruan versi dilakukan secara sadar setelah test.

| Komponen | Image |
|---|---|
| Node.js web/API | `docker.io/library/node:24.18.0-alpine3.24` |
| PostgreSQL | `docker.io/library/postgres:18.4-alpine3.24` |
| S3 lokal | `docker.io/chrislusf/seaweedfs:4.39` |
| Image aplikasi | `localhost/putra-laskar-dashboard-*:local` |

Referensi tag: [Node official image](https://hub.docker.com/_/node), [PostgreSQL official image](https://hub.docker.com/_/postgres), dan [SeaweedFS releases](https://github.com/seaweedfs/seaweedfs/releases).

SeaweedFS 4.39 memakai Alpine 3.24 dan menggantikan image MinIO community yang sudah diarsipkan. Mode `weed mini` hanya ditujukan untuk development/local testing; gunakan S3 terkelola atau deployment object-storage yang redundan untuk production.
Compose memberi `S3_BUCKET` ke `weed mini`, sehingga bucket lokal dibuat otomatis. SeaweedFS local menerima origin browser untuk signed URL tanpa cookie agar avatar tetap bekerja ketika dashboard dibuka melalui IP laptop. Bucket production tidak memakai konfigurasi wildcard local ini.

Service API local memakai `NODE_ENV=development` dan `ALLOW_LOCAL_SEED=true` hanya selama startup Compose. Seed berasal dari workbook asli, bukan dataset demo. Image runtime tetap production-built; environment development di sini hanya mengizinkan seed local dan cookie HTTP localhost.

## Menjalankan

Docker:

```bash
docker compose up --build
```

Podman rootless:

```bash
./scripts/podman-compose.sh up --build
```

## Error `short-name did not resolve`

Podman tidak menebak registry untuk nama seperti `postgres:...` atau `minio/minio:...` ketika `registries.conf` tidak menyediakan alias. Compose proyek ini sudah memakai `docker.io/...` untuk image remote dan `localhost/...` untuk image hasil build, jadi tidak perlu mengubah konfigurasi global host.

## Error `crun: sd-bus call ... Input/output error`

Ini terjadi sebelum perintah `RUN npm ci` sempat dieksekusi. `crun` gagal membuat cgroup karena shell desktop menunjuk ke D-Bus session yang bukan bus user systemd. Uji runtime secara terpisah:

```bash
printf '%s\n' "${DBUS_SESSION_BUS_ADDRESS:-<unset>}"
env -u DBUS_SESSION_BUS_ADDRESS \
  podman run --rm docker.io/library/alpine:3.24.1 true
```

Jika uji tersebut berhasil, jalankan Compose melalui script proyek. Alamat bus normal pada Arch dengan systemd biasanya berbentuk `unix:path=/run/user/$(id -u)/bus`, bukan path sementara `/tmp/...` atau `unix:abstract=...`.

Jika uji tetap gagal, periksa sesi user dan runtime host:

```bash
systemctl --user is-system-running
podman info --debug | grep -E 'cgroupManager|cgroupVersion|ociRuntime'
journalctl --user -b -u dbus -u dbus-broker --no-pager -n 100
```

Masalah pada tiga perintah tersebut berada di konfigurasi sesi Arch/Podman, bukan di Dockerfile aplikasi. Jangan beralih ke `sudo podman` tanpa memahami bahwa storage, network, dan ownership container rootful terpisah dari Podman rootless.

## Reset local stack

Hapus container tanpa menghapus data:

```bash
podman compose down --remove-orphans
```

Hapus seluruh database/object lokal hanya jika memang ingin mulai dari nol:

```bash
podman compose down --volumes --remove-orphans
```

Reset volume **wajib satu kali** ketika berpindah dari arsip lama yang memakai `001_demo.sql` ke seed workbook baru. Ledger/audit memang immutable sehingga data demo lama tidak ditimpa diam-diam.
