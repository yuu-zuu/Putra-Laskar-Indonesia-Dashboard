# Menjalankan aplikasi di Windows

Panduan ini ditujukan untuk penguji lokal. Cara paling konsisten adalah menjalankan seluruh stack melalui Docker Desktop atau Podman Desktop; Node.js host hanya diperlukan bila ingin menjalankan frontend/API langsung.

## Pilihan A — seluruh stack dengan Docker Desktop

Prasyarat:

- Windows 10/11 64-bit dengan WSL 2 aktif;
- Docker Desktop dengan engine Linux container;
- minimal 4 GB RAM kosong;
- port `5173`, `8787`, `5432`, `8333`, dan `9333` belum digunakan.

Buka PowerShell pada folder hasil ekstraksi:

```powershell
Set-Location "$HOME\Downloads\spbu-ops-dashboard"
Copy-Item .env.example .env
docker compose up --build
```

Tunggu sampai service `postgres`, `object-storage`, `api`, dan `web` berstatus healthy. Buka:

- Web: `http://localhost:5173`
- API health: `http://localhost:8787/api/health`
- Admin: `ADMIN-001` atau `yudhizz14@gmail.com`
- Password local: `ChangeMeLocal123!`

Untuk menguji dari HP pada Wi-Fi yang sama, buka `http://<IP-LAPTOP>:5173`. Frontend akan mengarahkan request API/object storage ke IP laptop secara otomatis. Panduan IP, firewall, dan troubleshooting lengkap ada di [RUN_LAN.md](RUN_LAN.md).

Hentikan stack dengan `Ctrl+C`, lalu:

```powershell
docker compose down
```

Reset total hanya bila data lokal boleh dihapus:

```powershell
docker compose down --volumes --remove-orphans
docker compose up --build
```

Perintah reset menghapus database dan object lokal, kemudian mengimpor ulang workbook seed saat startup.

## Pilihan B — seluruh stack dengan Podman Desktop

Aktifkan Podman Machine Linux dari Podman Desktop, kemudian jalankan PowerShell:

```powershell
Set-Location "$HOME\Downloads\spbu-ops-dashboard"
Copy-Item .env.example .env
podman machine start
podman compose up --build
```

Jika provider Compose belum tersedia, instal `podman-compose` melalui menu extension/provider Podman Desktop atau gunakan Docker Desktop. Script `scripts/podman-compose.sh` khusus shell Linux dan tidak diperlukan pada PowerShell Windows.

## Pilihan C — UI demo tanpa database

Prasyarat: Node.js `24.x` LTS dan npm `11.x`/`12.x`.

```powershell
Set-Location "$HOME\Downloads\spbu-ops-dashboard"
Copy-Item .env.example .env
npm ci --include=optional
npm run dev:web
```

Karena `.env.example` memakai `VITE_USE_MOCKS=true`, mode ini menggunakan data browser dan tidak menguji PostgreSQL, object storage, transaksi FIFO, atau API sebenarnya.

Jika instalasi lama memiliki native binding yang salah:

```powershell
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
npm cache verify
npm ci --include=optional
```

Jangan menghapus `package-lock.json`.

## Pilihan D — API/web pada Node, infrastruktur dalam container

```powershell
Set-Location "$HOME\Downloads\spbu-ops-dashboard"
Copy-Item .env.example .env
docker compose up -d postgres object-storage
npm ci --include=optional
```

Ubah `VITE_USE_MOCKS=false` di `.env`, lalu:

```powershell
npm run db:migrate
npm run db:seed
npm run auth:bootstrap-admin
npm run dev
```

`DATABASE_URL` pada `.env.example` sudah cocok dengan password default Compose. Jangan gunakan credential local ini pada server bersama atau production.

## Pemeriksaan dan troubleshooting

Lihat status serta log:

```powershell
docker compose ps
docker compose logs -f api web postgres object-storage
```

Jika port bentrok, cari process pemilik port:

```powershell
Get-NetTCPConnection -LocalPort 5173,8787,5432,8333,9333 -ErrorAction SilentlyContinue |
  Select-Object LocalPort, State, OwningProcess
```

Jika browser menyimpan bundle/cookie lama, lakukan hard refresh (`Ctrl+F5`) dan hapus cookie `localhost`. Jika avatar gagal, pastikan port `8333` dapat diakses dari browser dan CSP berasal dari arsip terbaru.

## Checklist pengujian teman

1. Login menggunakan email dan ID karyawan secara bergantian.
2. Ganti cabang aktif dan periksa data dashboard.
3. Tambah produk, unit stock, pompa/meter, lalu input bacaan.
4. Buka rekonsiliasi, lakukan koreksi dengan alasan, dan periksa histori/thread.
5. Ganti avatar dan pastikan foto header ikut berubah.
6. Buka/tutup tirai pengumuman dan periksa waktu publikasi.
7. Sebagai admin, buat akun dari menu **Kelola akun**, login dengan akun tersebut, lalu uji pencabutan akun.
8. Uji XLSX, bahasa, tiga tema, sidebar compact, tampilan mobile, dan log aktivitas.
