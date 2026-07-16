# Deploy ke Vercel

Vercel menyajikan `apps/web/dist` sebagai static site dan menjalankan `api/gateway.mjs` sebagai Node.js Function. Rewrite `/api/:__pli_api_path*` meneruskan seluruh route API bertingkat ke Function tetap tersebut, kemudian adapter memulihkan path publik sebelum memanggil router aplikasi. Build lebih dahulu mengompilasi TypeScript 7 API ke `apps/api/dist`; adapter Function hanya mengimpor JavaScript hasil kompilasi tersebut. PostgreSQL dan object storage harus eksternal; filesystem Function tidak dipakai sebagai penyimpanan persisten.

Vercel Functions mendukung Node 24.x sebagai default LTS saat dokumen ini diperbarui. Project dan local Compose sama-sama dikunci ke Node 24.18.0 agar hasil build tidak berbeda. Referensi: [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## 1. Siapkan layanan

- PostgreSQL 18-compatible dengan pooled connection URL, TLS, backup/PITR, dan region dekat Function.
- Bucket private S3-compatible yang endpoint signed-nya dapat diakses browser.
- Domain final Vercel/custom domain untuk `WEB_ORIGIN` dan bucket CORS.

## 2. Environment Variables

Salin `.env.production.example` ke Vercel Project Environment Variables untuk Production/Preview sesuai kebutuhan. Minimum:

```text
NODE_ENV=production
ALLOW_LOCAL_SEED=false
DATABASE_URL=postgres://...pooled...?sslmode=require
DB_POOL_MAX=2
DB_CONNECTION_TIMEOUT_MS=5000
DB_QUERY_TIMEOUT_MS=20000
DB_STATEMENT_TIMEOUT_MS=15000
WEB_ORIGIN=https://dashboard.example.com
ALLOWED_WEB_ORIGINS=https://dashboard.example.com
REQUIRE_CLIENT_PROVENANCE=true
NATIVE_CLIENT_KEY_HASHES={}
TRUST_PROXY=true
REGISTRATION_CODE_SECRET=<random-minimal-32-byte>
SESSION_TTL_HOURS=12
SESSION_TOUCH_INTERVAL_MINUTES=5
SESSION_COOKIE_NAME=__Host-pli_session
SESSION_COOKIE_SECURE=true
S3_ENDPOINT=https://...
S3_INTERNAL_ENDPOINT=https://...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=false
S3_PRESIGN_TTL_SECONDS=900
S3_REQUEST_TIMEOUT_MS=7500
VITE_API_BASE_URL=/api/v1
VITE_USE_MOCKS=false
```

Jangan memakai prefix `VITE_` untuk credential. Detail setiap variable ada di [ENVIRONMENT.md](ENVIRONMENT.md).

`NATIVE_CLIENT_KEY_HASHES={}` adalah kondisi aman saat belum ada aplikasi native. Bila custom domain dan domain Vercel sama-sama dipakai pengguna, masukkan keduanya dalam `ALLOWED_WEB_ORIGINS` yang dipisahkan koma. Preview sebaiknya memakai environment terpisah dan [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection), bukan otomatis mempercayai seluruh subdomain preview.

## 3. CORS object storage

Izinkan origin production melakukan signed `PUT` dan `GET` sesuai provider, dengan request header `Content-Type`. Credential server memerlukan akses minimum `ListBucket`, `GetObject`, `PutObject`, dan `DeleteObject` hanya pada bucket/prefix aplikasi agar pembersihan akun dapat diselesaikan. Jangan memakai wildcard write origin. CSP di `vercel.json` sudah mengizinkan HTTPS image/connect; bila provider membutuhkan hostname/protocol khusus, sempitkan kebijakan ke domain tersebut.

## 4. Migration dan admin awal

Jalankan dari mesin/CI administratif tepercaya menggunakan direct atau migration connection yang sesuai provider. Muat seluruh variable production dari secret manager ke environment process—startup validation sengaja tidak menerima konfigurasi production parsial—lalu:

```bash
npm run db:migrate
npm run db:verify
```

Bootstrap satu admin:

Tambahkan `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, dan `BOOTSTRAP_ADMIN_NAME` pada environment process yang sama, lalu jalankan `npm run auth:bootstrap-admin`. Hapus kembali ketiga variable bootstrap setelah berhasil.

Jangan jalankan `npm run db:seed`. Seed workbook memiliki guard yang selalu menolak production. Setelah bootstrap, database hanya berisi schema dan satu admin; cabang, produk, unit, meter, dan transaksi masih kosong.

## 5. Import project

Gunakan repository root sebagai Root Directory. `vercel.json` menetapkan:

- framework `vite`;
- `npm ci --omit=dev --include=optional` agar instalasi production tetap menyediakan seluruh tool build yang dideklarasikan langsung oleh workspace dan binding Rolldown;
- build contracts + API + web menggunakan TypeScript 7;
- output `apps/web/dist`;
- rewrite wildcard `/api/:__pli_api_path*` menuju Function JavaScript tetap `api/gateway.mjs` dengan durasi maksimum 60 detik;
- header CSP/security.

Entrypoint Function sengaja berupa `.mjs`, bukan `.ts`. TypeScript 7.0 menyediakan compiler CLI native tetapi belum menyediakan programmatic compiler API yang masih dipanggil builder TypeScript Vercel. Precompile ini mempertahankan TypeScript 7 untuk pemeriksaan dan emit aplikasi tanpa menggantungkan deployment pada API compiler tersebut.

Compiler, type package, Vite, dan plugin React yang dipakai saat build sengaja dideklarasikan sebagai `dependencies` langsung pada workspace pemakainya. Vercel dapat melakukan fase instalasi production-only saat menyiapkan Function; deklarasi ini membuat build tiap workspace mandiri dan mencegah `tsc: command not found`. Paket build yang tidak diimpor oleh handler tidak ikut ke bundle Function hasil file tracing.

Build workspace API dan web juga mandiri secara topologis: masing-masing membangun `@spbu/contracts` sebelum `build:self`. Karena itu build Vercel tetap valid ketika Function builder menjalankan workspace API secara terpisah. Build dari root memakai `build:self` setelah satu build contracts agar kompilasi tidak diulang.

Pool `pg` didaftarkan ke Vercel Fluid Compute melalui `attachDatabasePool`; tetap gunakan pooled database endpoint dan `DB_POOL_MAX=2` agar jumlah koneksi antarscale-out terkendali.

Deploy melalui Git integration atau Vercel CLI:

```bash
vercel
vercel --prod
```

Untuk CLI, instal versi current sesuai dokumentasi Vercel dan jangan commit `.vercel` credentials.

## 6. First-run production

1. Login dengan email atau `ADMIN-001`.
2. Dari header, tambah cabang pertama.
3. Buka Unit Stock → Tambah produk.
4. Tambah unit stock.
5. Posting saldo awal dengan cost/harga nyata agar layer FIFO terbentuk.
6. Tambah pompa/meter dan mapping tanggal efektif.
7. Buat operator melalui kode registrasi aktif atau menu admin **Kelola akun**.

## 7. Smoke test

- `GET /api/health` menguji liveness tanpa database; `GET /api/ready` menguji koneksi PostgreSQL; `GET /api/v1/auth/me` harus mencapai API dan mengembalikan `401` sebelum login, bukan 404 Vercel.
- Login/logout/cookie Secure bekerja pada domain final.
- Branch/product/unit/meter dapat dibuat sesuai role.
- Concurrent posting tidak menggandakan idempotency.
- Avatar upload API/signed GET berhasil untuk seluruh role dan avatar header berubah setelah save.
- Dashboard polling/trend 7–90 hari, rekonsiliasi, log, broadcast, dan XLSX berfungsi.
- Non-admin gagal membuka branch lain; response menyertakan request ID.
- Origin asing, native key salah, dan request tanpa provenance production ditolak `403`.

## 8. Operasi

- Aktifkan Vercel Function logs/alerts, PostgreSQL slow-query/connection alerts, backup/PITR, dan object lifecycle.
- Tambahkan [Vercel WAF rate limit](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) untuk login/register dan custom rule untuk pola abuse.
- Total koneksi maksimum kira-kira `instance aktif × DB_POOL_MAX`; gunakan pooled URL dan pool kecil.
- Jalankan migration sebagai release job terpisah. Function request tidak melakukan migration/seed.
- Lindungi branch `main` dengan required check **Quality gate**, **PostgreSQL migration smoke test**, dan **Alpine container builds**. Vercel Git Integration mendeploy `main` setelah pull request tervalidasi.
- Ikuti [MAINTENANCE.md](MAINTENANCE.md) untuk rollback, restore, secret rotation, dan incident.
