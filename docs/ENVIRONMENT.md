# Environment variables

Gunakan `.env.example` untuk local non-container dan `.env.production.example` untuk Vercel. Jangan commit `.env` nyata. Variable berawalan `VITE_` masuk ke bundle browser; seluruh credential harus memakai nama server-only.

## Server/API

| Variable | Wajib production | Default local | Fungsi |
|---|---:|---|---|
| `NODE_ENV` | Ya | `development` | `production` mengaktifkan default cookie secure dan menolak seed |
| `ALLOW_LOCAL_SEED` | Tidak; harus `false` | `true` bila sengaja seed | Guard tambahan; seed butuh true dan non-production |
| `API_HOST` | Container/local | `0.0.0.0` | Bind local server; tidak dipakai adapter Vercel |
| `API_PORT` | Container/local | `8787` | Port local API |
| `WEB_ORIGIN` | Ya | `http://localhost:5173` | Origin mutation tepercaya dan CORS upload |
| `ALLOWED_WEB_ORIGINS` | Ya | nilai `WEB_ORIGIN` | Allowlist origin web, dipisahkan koma |
| `ALLOW_PRIVATE_NETWORK_ORIGINS` | Ya; harus `false` | `true` pada Compose local | Izinkan origin HTTP beralamat privat untuk uji dari HP/LAN |
| `PRIVATE_NETWORK_WEB_PORTS` | Bila LAN aktif | `5173,4173` | Port web yang boleh memakai pengecualian origin privat |
| `REQUIRE_CLIENT_PROVENANCE` | Ya | `false` local; default `true` production | Tolak request tanpa origin/same-origin metadata atau credential native |
| `NATIVE_CLIENT_KEY_HASHES` | Bila native aktif | `{}` | JSON `clientId: sha256Hex`; key mentah tidak disimpan server |
| `TRUST_PROXY` | Ya di Vercel | `false` | Pakai forwarded IP hanya di balik proxy tepercaya; Vercel default otomatis true |
| `APP_RELEASE` | Opsional non-Vercel | `local` | Label release pada health/log; Vercel memakai commit SHA otomatis |
| `DATABASE_URL` | Ya | URL PostgreSQL local | Connection string; production gunakan TLS + pooled endpoint |
| `DB_POOL_MAX` | Ya | `10` | Maksimum koneksi per process; Vercel disarankan `2` |
| `DB_CONNECTION_TIMEOUT_MS` | Ya | `5000` | Batas membuat koneksi PostgreSQL |
| `DB_QUERY_TIMEOUT_MS` | Ya | `20000` | Batas tunggu query di client |
| `DB_STATEMENT_TIMEOUT_MS` | Ya | `15000` | Batas eksekusi statement di PostgreSQL |
| `REGISTRATION_CODE_SECRET` | Ya | placeholder local | HMAC code; acak minimal 32 byte |
| `SESSION_TTL_HOURS` | Ya | `12` | Umur sesi |
| `SESSION_TOUCH_INTERVAL_MINUTES` | Ya | `5` | Throttle pembaruan last-seen agar polling tidak menulis tiap request |
| `SESSION_COOKIE_NAME` | Ya | `pli_session` | Nama cookie opaque; production wajib prefix `__Host-` |
| `SESSION_COOKIE_SECURE` | Ya | `false` | Wajib `true` pada HTTPS production |

## Bootstrap admin

Variable ini hanya diperlukan ketika menjalankan `npm run auth:bootstrap-admin`, bukan saat request normal.

| Variable | Aturan |
|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | Email admin awal; unik |
| `BOOTSTRAP_ADMIN_PASSWORD` | Minimal 12 karakter, huruf kecil/besar + angka; gunakan password manager |
| `BOOTSTRAP_ADMIN_NAME` | Nama tampilan, default `Mr.Yudhistira` |

Employee ID admin awal adalah `ADMIN-001`. Bootstrap tidak membuat branch/product/unit/pompa. Jika identitas yang sama sudah menjadi admin aktif, command selesai tanpa mengubah password; konflik email/employee ID/role ditolak agar tidak terjadi privilege escalation atau overwrite diam-diam.

## Object storage

| Variable | Wajib production | Default local | Fungsi |
|---|---:|---|---|
| `S3_ENDPOINT` | Ya | `http://localhost:8333` | Endpoint yang dapat diakses browser untuk signed URL |
| `S3_INTERNAL_ENDPOINT` | Ya | nilai `S3_ENDPOINT` | Endpoint yang dapat dijangkau API untuk menyimpan avatar; Compose memakai hostname service internal |
| `S3_REGION` | Ya | `us-east-1` | Region signing |
| `S3_BUCKET` | Ya | `pli-documents` | Bucket avatar/evidence |
| `S3_ACCESS_KEY` | Ya | local-only | Access key server |
| `S3_SECRET_KEY` | Ya | local-only | Secret server |
| `S3_FORCE_PATH_STYLE` | Provider-specific | `true` | `true` untuk SeaweedFS/local; sering `false` pada managed S3 |
| `S3_PRESIGN_TTL_SECONDS` | Ya | `900` | Umur URL; integer positif |
| `S3_REQUEST_TIMEOUT_MS` | Ya | `7500` | Timeout upload/cleanup yang dijalankan API |
| `S3_ALLOWED_ORIGINS` | Local Compose saja | `*` | CORS SeaweedFS local untuk signed URL tanpa cookie; jangan wildcard di production |

API mengunggah dan memvalidasi avatar kecil melalui `S3_INTERNAL_ENDPOINT`; browser hanya membaca avatar melalui signed GET dari `S3_ENDPOINT`. Presign generik tidak menerima scope avatar. Upload attachment lain tetap dapat memakai signed PUT. Jangan membuka credential atau wildcard write CORS.

Credential S3 milik API membutuhkan `ListBucket`, `GetObject`, `PutObject`, dan `DeleteObject` pada bucket/prefix aplikasi. `ListBucket` dan `DeleteObject` dipakai hanya ketika akun dihapus untuk membersihkan semua objek yang dia miliki; audit dan transaksi tetap berada di PostgreSQL.

## Browser/build

| Variable | Default | Fungsi |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8787/api/v1` | Base URL gateway browser |
| `VITE_USE_MOCKS` | `false` kecuali Vite dev + explicit `true` | Demo lokal. Production build selalu memakai API nyata |

Jika halaman local dibuka melalui IP laptop, frontend mengganti hostname loopback pada `VITE_API_BASE_URL` dengan hostname halaman secara otomatis. Port dan path tetap mengikuti variable tersebut.

## Web dan native client

Untuk beberapa domain web:

```text
ALLOWED_WEB_ORIGINS=https://dashboard.example.com,https://preview.example.com
REQUIRE_CLIENT_PROVENANCE=true
```

Untuk mendaftarkan native client, buat key acak per aplikasi/channel, lalu simpan hanya hash SHA-256 di server:

```bash
node -e "const c=require('node:crypto');console.log(c.createHash('sha256').update(process.argv[1]).digest('hex'))" "NATIVE_KEY_ACAK"
```

```text
NATIVE_CLIENT_KEY_HASHES={"pli-android-v1":"<sha256-hex>","pli-ios-v1":"<sha256-hex>"}
```

Native client mengirim `X-PLI-Client-ID` dan `X-PLI-Client-Key` pada setiap request serta mempertahankan cookie sesi hasil login. Jangan memakai prefix `VITE_`: kedua nilai native tidak boleh dimasukkan ke bundle web. Key native adalah kontrol admission/rotasi, bukan pengganti login, role, atau device attestation.

## Contoh secret generation

```bash
openssl rand -base64 48
```

Simpan nilai di secret manager/Vercel Environment Variables, bukan shell history bersama. Rotasi `REGISTRATION_CODE_SECRET` segera mengganti kode register aktif. Rotasi S3 key harus dikoordinasikan dengan deployment; signed URL lama akan berhenti berlaku. Rotasi session cookie secret tidak diperlukan karena token disimpan hashed di database, tetapi semua sesi dapat dicabut dengan mengisi `revoked_at`.

## Validasi sebelum production

Konfigurasi production divalidasi saat cold start. API menolak start bila origin atau endpoint object bukan HTTPS, origin utama tidak ada pada allowlist, nama cookie tidak memakai `__Host-`, cookie tidak secure, provenance dimatikan, seed/LAN exception aktif, atau registration secret kurang dari 32 byte.

Jangan mencetak credential penuh di CI log. Untuk diagnosis, cetak hanya status ada/tidak, hostname ter-redaksi, dan `process.version`.
