# Putra Laskar Indonesia Dashboard

Aplikasi React + TypeScript untuk pendataan stock, pompa/meter dinamis, rekonsiliasi liter/kas, audit, dan laporan operasional. UI menyediakan Bahasa Indonesia (default), English, serta 中文; path API, field JSON, database, enum, dan identifier internal menggunakan Bahasa Inggris.

Support aplikasi: **Mr.Yudhistira** — [yudhizz14@gmail.com](mailto:yudhizz14@gmail.com).

> Permintaan “React Native + semantic HTML + CSS terpisah” diterjemahkan menjadi **React web + TypeScript + Vite**. React Native murni tidak menghasilkan HTML semantik dan tidak menggunakan stylesheet CSS eksternal.

## Fitur aktif

- Dashboard rinci dengan sinkronisasi 10 detik: stock, penjualan, setoran, laba FIFO, exception, rekonsiliasi, audit activity, serta tren 7/14/30/60/90 hari.
- Pompa/meter sepenuhnya dinamis: jumlah bebas, kode unik, label dapat diubah, bisa diaktifkan/nonaktifkan, serta dipetakan ke unit stock bertanggal efektif.
- Ledger stock aktif untuk saldo awal, supply, retur, transfer antarunit, gain, dan loss; mutasi masuk membuat layer FIFO dan transfer mempertahankan biaya layer asal.
- Input bacaan meter dengan continuity check, harga jual, reset offset, idempotency key, dan posting atomik ke bacaan, mutasi penjualan, serta alokasi FIFO.
- Register tetap mewajibkan ID karyawan dan email; login cukup memakai salah satu dari email atau ID karyawan beserta password. Seluruh field password memiliki tombol tampil/sembunyi; logout dan delete account memakai konfirmasi password.
- Admin memiliki menu Kelola Akun untuk membuat user tanpa self-register, memutasi role/cabang dengan alasan teraudit, serta mencabut akun/sesi dengan perlindungan admin terakhir. Penghapusan membersihkan objek milik akun tetapi mempertahankan histori bisnis dan audit.
- Cabang aktif dapat ditambah/diganti admin; unit stock, review rekonsiliasi, dan broadcast operasional terhubung ke API.
- Rekonsiliasi berfungsi sebagai ruang audit: koreksi nilai memerlukan alasan, menyimpan snapshot sebelum/sesudah yang immutable, dan memiliki diskusi balasan bertingkat per transaksi.
- Log aktivitas PostgreSQL lengkap dapat dicari dan difilter dari Pengaturan maupun profil pengguna; hasil berhasil/gagal/ditolak, request ID, pelaku, waktu, alasan, dan metadata ditampilkan. Preferensi lokal seperti bahasa, tema, dan compact sidebar tidak dicatat sebagai perubahan bersama.
- Semua role dapat mengganti avatar miliknya sendiri dengan PNG/JPEG/WebP maksimal 500 KB melalui upload API terverifikasi; avatar profil dan header tersinkron setelah disimpan.
- Tutorial pertama-login memakai spotlight pada kontrol nyata dan meminta interaksi langsung. Pada mobile, panel berpindah menjauhi target, dapat diminimalkan agar halaman tetap bisa digulir, dan langkah tanpa kontrol/pilihan yang valid selesai otomatis. Delapan panduan umum serta satu panduan admin dapat diputar ulang dari Pengaturan.
- Kode registrasi internal enam digit yang dihitung server-side dari HMAC dan otomatis berubah setiap jam; hanya role `ADMIN` yang dapat melihatnya.
- Password disimpan sebagai salted `scrypt`; sesi memakai opaque token yang hanya berada dalam cookie `HttpOnly`, dapat dicabut, dan memiliki expiry.
- Proteksi branch scope, role check, allowlist origin, provenance client web/native, login/register rate limit, serta perlindungan agar admin terakhir tidak terhapus.
- Export `.xlsx` asli multi-sheet dan CSV. XLSX dibuat melalui `write-excel-file`, dimuat secara dinamis agar bundle awal tetap kecil.
- Gruvbox Dark sebagai default, Catppuccin Mocha dan Hatsune Miku sebagai alternatif, panel flat tanpa border, SVG chart dengan skala stock/penjualan terpisah, serta tooltip rumus berbasis portal.
- Spotlight tutorial meredupkan area lain secara ringan; penjelasan sekunder dipindahkan ke hover/focus tooltip agar UI tidak padat.
- Tooltip rumus menerjemahkan judul, ekspresi, penjelasan, variabel, dan satuan secara penuh pada Bahasa Indonesia, English, dan 中文; pencarian mengikuti locale yang sama.
- Broadcast tampil sebagai tirai yang dapat disembunyikan; tiga item terlihat per viewport, sisanya dapat digulir, lengkap dengan pelaku dan waktu publikasi.
- Broadcast terbaru diberi kontras ringan. Grafik tren menampilkan detail stok, penjualan, dan kas melalui hover, sentuhan, atau keyboard tanpa menambah tab stop per titik.
- Layout mobile dioptimalkan hingga lebar 320 px: header dua baris, branch switcher utuh, bottom navigation bergulir, bacaan meter berbentuk kartu dengan state loading/error/kosong, form/modal/action responsif, serta akses LAN yang otomatis mengikuti IP laptop.
- Frontend tetap menargetkan ES2024. Browser tidak membuat request UUID saat login/API call; request ID ditetapkan server, sedangkan ID operasi lokal memakai RNG bertingkat. Runtime API juga memakai `randomBytes`, bukan `randomUUID`. Quality gate memeriksa bundle production, sementara `/build-info.json` membedakan container baru dari cache/image lama. Matriks rinci ada di [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).
- PostgreSQL migration, seed local workbook asli, presigned upload berbasis `node:crypto`, Docker Compose local stack, dan adapter Vercel Functions.

## Dependensi utama

Semua versi dikunci di `package-lock.json` dan diverifikasi ulang langsung dari npm registry pada 15 Juli 2026.

| Area | Paket | Versi |
|---|---|---:|
| UI | React / React DOM | 19.2.7 |
| Build | Vite / plugin React | 8.1.4 / 6.0.3 |
| Bahasa | TypeScript | 7.0.2 |
| Database | pg / @types/pg | 8.22.0 / 8.20.0 |
| Vercel runtime | @vercel/functions | 3.7.5 |
| XLSX | write-excel-file | 4.1.1 |
| Runtime TS dev | tsx | 4.23.1 |
| Lint & format | Biome | 2.5.3 |

Tidak ada CSS framework, UI kit, chart library, ORM, Supabase SDK, AWS SDK, atau auth SDK. Paket resmi Vercel hanya dipakai untuk lifecycle pool PostgreSQL pada Fluid Compute. Router hash dan state/context internal dipertahankan karena sudah cukup kecil.

## Instalasi UI demo

Prasyarat: Node.js 24.x LTS dan npm 11.x/12.x. Runtime ini sengaja sama dengan Vercel Functions; Node 26 belum tersedia sebagai runtime Vercel pada 15 Juli 2026.

```bash
npm ci
cp .env.example .env
npm run dev:web
```

Buka `http://localhost:5173`. Mock mode hanya aktif pada Vite development ketika `VITE_USE_MOCKS=true`; production build selalu memakai API nyata.

Akun demo admin:

```text
Login    : ADMIN-001 (atau yudhizz14@gmail.com)
Password : DemoAdmin!2026
```

Setelah login, kode register demo berada di **Pengaturan → Kode registrasi internal**.

### Perbaikan native binding npm

Proyek menyertakan `.npmrc` dengan `include=optional`, top-level optional binding Rolldown untuk glibc/musl, dan kebijakan `allowScripts` yang hanya menyetujui `esbuild@0.28.1`. Ini memperbaiki error `Cannot find @rolldown/binding-linux-x64-gnu` dan menghilangkan peringatan install-script yang belum direview pada npm 11.18+.

Jika sebelumnya pernah menjalankan versi arsip lama, bersihkan instalasi lama satu kali lalu gunakan lockfile baru:

```bash
rm -rf node_modules
npm ci
npm run dev:web
```

Jangan menghapus `package-lock.json` dari arsip baru karena lockfile tersebut sudah memuat binding platform yang diperlukan.

## Local testing dengan Compose

Semua image menggunakan Alpine dan nama registry penuh agar kompatibel dengan Docker maupun Podman tanpa konfigurasi short-name. Versi yang dikunci per 15 Juli 2026 adalah Node.js 24.18.0/Alpine 3.24, PostgreSQL 18.4/Alpine 3.24, dan SeaweedFS 4.39.

Docker:

```bash
docker compose up --build
```

Podman rootless:

```bash
./scripts/podman-compose.sh up --build
```

Script Podman mengabaikan alamat D-Bus desktop non-standar yang dapat membuat `crun` gagal sebelum `npm ci` benar-benar dijalankan. Compose otomatis menjalankan migration, seed workbook Pangkalan Balai, dan bootstrap admin sebelum API dimulai.

- Web: `http://localhost:5173`
- API: `http://localhost:8787`
- S3 SeaweedFS: `http://localhost:8333`
- SeaweedFS master UI: `http://localhost:9333`
- Admin lokal: `ADMIN-001` / `yudhizz14@gmail.com` / `ChangeMeLocal123!`

Jika volume berasal dari arsip lama yang masih memakai seed demo, jalankan `podman compose down --volumes --remove-orphans` satu kali sebelum startup baru. Ubah password, registration secret, credential PostgreSQL, dan object storage melalui environment sebelum dipakai bersama orang lain. Detail data seed ada di [docs/LOCAL_DATA.md](docs/LOCAL_DATA.md); troubleshooting ada di [docs/CONTAINERS.md](docs/CONTAINERS.md).

Panduan lengkap Windows/PowerShell: [docs/RUN_WINDOWS.md](docs/RUN_WINDOWS.md).

Untuk membuka dashboard local dari HP pada Wi-Fi yang sama, gunakan `http://<IP-LAPTOP>:5173`, bukan `localhost`. Host API dan object storage akan mengikuti IP tersebut secara otomatis; izinkan port `5173`, `8787`, dan `8333` pada firewall jaringan privat. Lihat [docs/RUN_LAN.md](docs/RUN_LAN.md).

## Menjalankan full stack tanpa container aplikasi

```bash
cp .env.example .env
docker compose up -d postgres object-storage
npm ci
npm run db:migrate
npm run db:seed
npm run auth:bootstrap-admin
npm run dev
```

Pastikan `.env` berisi `NODE_ENV=development`, `ALLOW_LOCAL_SEED=true`, dan `VITE_USE_MOCKS=false` untuk full stack nyata.

## Deployment Vercel

Repository root sudah berisi `vercel.json` dan `api/[...path].mjs`. Build production mengompilasi contracts, API, dan web menggunakan TypeScript 7 terlebih dahulu. Frontend disajikan sebagai Vite static output, sedangkan route `/api/*` menjalankan hasil JavaScript API sebagai Vercel Node Function dengan handler yang sama seperti local server. Entrypoint JavaScript ini menghindari ketergantungan pada programmatic compiler API yang belum disediakan TypeScript 7.0.

Ringkasnya:

1. Buat PostgreSQL eksternal/Marketplace dengan pooled connection; Vercel Postgres lama sudah digantikan integrasi Marketplace.
2. Salin seluruh variable dari `.env.production.example` ke Vercel Project Environment Variables.
3. Gunakan `DB_POOL_MAX=2`, `SESSION_COOKIE_SECURE=true`, `VITE_USE_MOCKS=false`, dan secret acak minimal 32 byte.
4. Muat seluruh environment production pada mesin tepercaya, jalankan migration + schema verification + bootstrap admin; jangan jalankan seed.
5. Import repository ke Vercel atau jalankan `vercel` dari root. `vercel.json` menentukan build dan output directory.

```bash
npm run db:migrate
npm run db:verify
npm run auth:bootstrap-admin
```

Ketiga command membaca konfigurasi production lengkap dari environment process. Variable bootstrap hanya diperlukan untuk command terakhir dan harus dihapus setelah akun awal dibuat.

Panduan lengkap: [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

Production bootstrap sengaja menghasilkan satu akun admin dan schema kosong. Admin kemudian membuat cabang, produk, unit stock, saldo awal berbiaya, serta pompa/meter melalui UI. `db:seed` menolak `NODE_ENV=production`.

## Verifikasi

```bash
npm run format:check
npm run lint
npm run check
npm run test:coverage
npm run build
npm audit
```

`npm run quality` menjalankan seluruh pemeriksaan di atas kecuali audit registry. `npm run test:coverage` menerapkan gate minimal 90% pada modul inti yang dimuat suite unit; hasil hardening terakhir adalah 97,60% line, 92,54% branch, dan 98,25% function pada core API, serta 100% formula contracts. SQL dan browser tetap diverifikasi terpisah melalui migration smoke test dan UAT.

GitHub Actions pada `.github/workflows/ci.yml` menjalankan quality gate, `npm audit`, migration kosong + idempotency + schema verification pada PostgreSQL 18, serta build kedua image Alpine. Aktifkan branch protection agar `main` hanya menerima pull request yang lulus; Vercel Git Integration kemudian menjadi CD untuk commit `main` yang sudah tervalidasi.

Struktur utama:

```text
api/                    adapter Vercel Function
apps/web/               React UI, gateway, CSS, Alpine runtime
apps/api/               native HTTP handler, auth, route, PostgreSQL, S3 signer
packages/contracts/     DTO, enum, formula, unit test
database/               migration dan seed
docs/                   arsitektur, code map, ERD, API, env, data, security, testing, deployment, maintenance
```

## Batas implementasi

Dashboard, auth, master cabang/unit stock/pompa, ledger supply/transfer/return/adjustment, meter entry + FIFO, koreksi dan diskusi rekonsiliasi, audit outcome, profil/avatar, broadcast, report/XLSX, serta presign upload sudah aktif. Stock opname dan approval suggestion masih tersedia di schema tetapi belum memiliki workflow UI khusus.

Sebelum go-live lakukan UAT terhadap workbook sumber, integration test pada PostgreSQL production-equivalent, load/concurrency test FIFO, object antivirus/quarantine, backup/restore drill, secret rotation, observability, serta security review independen.

Indeks dokumentasi lengkap: [docs/README.md](docs/README.md).
