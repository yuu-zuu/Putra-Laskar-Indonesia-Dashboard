# Mengakses local dashboard dari ponsel

Web, API, dan object storage sudah bind ke seluruh interface laptop. Bundle web juga mengganti hostname `localhost` dengan hostname/IP yang dipakai membuka halaman. Fitur ini hanya aktif bersama izin origin jaringan privat pada environment local; production tetap memakai allowlist eksplisit.

## 1. Temukan IP laptop

Linux:

```bash
hostname -I
```

Windows PowerShell:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" } |
  Select-Object InterfaceAlias, IPAddress
```

Pilih alamat Wi-Fi/LAN, biasanya berbentuk `192.168.x.x`, `10.x.x.x`, atau `172.16-31.x.x`.

## 2. Jalankan dan buka dari HP

Pastikan laptop dan HP berada pada Wi-Fi yang sama, lalu jalankan:

```bash
podman compose up --build
```

atau pada Windows:

```powershell
docker compose up --build
```

Jika IP laptop `192.168.1.25`, buka pada HP:

```text
http://192.168.1.25:5173
```

Uji API langsung dari HP:

```text
http://192.168.1.25:8787/api/health
```

Port yang perlu dapat dijangkau HP:

- `5173`: web;
- `8787`: API;
- `8333`: avatar dan object signed URL.

PostgreSQL `5432` dan SeaweedFS master `9333` tidak perlu dibuka untuk HP.

## 3. Jika masih gagal

1. Pastikan health API di atas dapat dibuka dari browser HP.
2. Izinkan inbound TCP `5173`, `8787`, dan `8333` pada firewall laptop untuk profil jaringan privat saja.
3. Matikan client/AP isolation pada router atau gunakan hotspot yang mengizinkan perangkat saling terhubung.
4. Jangan membuka `http://localhost:5173` dari HP; `localhost` pada HP menunjuk ke HP.
5. Setelah menerima arsip/revisi baru, paksa build image web dan API lalu hard refresh atau hapus site data browser HP agar bundle lama tidak dipakai:

   ```bash
   podman compose build --no-cache web api
   podman compose up -d
   ```

   Docker memakai perintah yang sama dengan awalan `docker compose`.
6. Dari HP, buka `http://<IP-LAPTOP>:5173/build-info.json`. Build saat ini harus menampilkan release `2026.07.16-auth-trace.3`. Jika berbeda, hentikan dan buat ulang container:

   ```bash
   podman compose down --remove-orphans
   podman compose build --no-cache web
   podman compose up -d
   ```

7. Periksa `docker compose logs -f api web object-storage` atau `podman compose logs -f api web object-storage`.

Jika avatar mencatat `PRESIGN_UPLOAD` tanpa `UPDATE_PROFILE`, browser masih menjalankan bundle lama. Versi saat ini mengirim avatar melalui `POST /api/v1/profiles/me/avatar`; keberhasilan baru dicatat sebagai `UPDATE_PROFILE`, sedangkan kegagalan storage dicatat sebagai request gagal beserta request ID.

## Kontrol keamanan

`ALLOW_PRIVATE_NETWORK_ORIGINS=true` hanya menerima origin HTTP dari alamat loopback/private pada port yang tercantum di `PRIVATE_NETWORK_WEB_PORTS`. Alamat IP publik, HTTPS privat yang tidak dikonfigurasi, dan port lain tetap ditolak. Pada production wajib gunakan:

```text
ALLOW_PRIVATE_NETWORK_ORIGINS=false
ALLOWED_WEB_ORIGINS=https://dashboard.example.com
REQUIRE_CLIENT_PROVENANCE=true
```

Wildcard CORS `S3_ALLOWED_ORIGINS=*` pada Compose hanya untuk SeaweedFS local dan signed URL tanpa cookie. Bucket production harus memakai origin domain production yang eksplisit.
