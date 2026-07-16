# API v1

Base URL lokal: `http://localhost:8787`. Endpoint bisnis memerlukan cookie sesi `HttpOnly`. `/api/health` dan `/api/ready` tidak memerlukan sesi; alias root `/health` dan `/ready` tersedia pada server lokal. Register/login tidak memerlukan sesi tetapi tetap melewati admission client, origin, dan rate limit.
`GET /` dan `GET /api/v1` mengembalikan informasi discovery singkat agar port API tidak tampak sebagai endpoint rusak; antarmuka pengguna tetap dibuka melalui `http://localhost:5173`.

## Authentication

| Method | Path | Tujuan |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register menggunakan kode internal aktif |
| `POST` | `/api/v1/auth/login` | Membuat opaque session cookie |
| `POST` | `/api/v1/auth/logout` | Mencabut sesi saat ini |
| `GET` | `/api/v1/auth/me` | Membaca akun pada sesi aktif |
| `GET` | `/api/v1/auth/registration-code` | Kode enam digit aktif; khusus `ADMIN` |
| `DELETE` | `/api/v1/auth/account` | Soft-delete akun setelah konfirmasi password |
| `PATCH` | `/api/v1/auth/password` | Ganti password akun aktif, mencabut sesi lain, dan mempertahankan sesi peminta |
| `GET` | `/api/v1/admin/accounts` | Daftar akun aktif; `ADMIN` |
| `POST` | `/api/v1/admin/accounts` | Membuat akun tanpa self-register; `ADMIN` |
| `PATCH` | `/api/v1/admin/accounts/{id}` | Mutasi role/cabang dengan alasan wajib; `ADMIN` |
| `PATCH` | `/api/v1/admin/accounts/{id}/password` | Reset password sementara dan cabut seluruh sesi target; `ADMIN` |
| `DELETE` | `/api/v1/admin/accounts/{id}` | Cabut sesi dan soft-delete akun; `ADMIN` |

Contoh register:

```json
{
  "employeeId": "OPS-001",
  "email": "operator@example.com",
  "displayName": "Operator Satu",
  "password": "PasswordKuat2026",
  "registrationCode": "123456"
}
```

Contoh login—`identifier` menerima email atau ID karyawan:

```json
{ "identifier": "OPS-001", "password": "PasswordKuat2026" }
```

Kode merupakan HMAC dari window waktu UTC satu jam dan `REGISTRATION_CODE_SECRET`. Kode tidak disimpan di database, tidak ditaruh dalam bundle frontend, dan expired tepat pada pergantian jam.

Pembuatan akun oleh admin menerima `employeeId`, `email`, `displayName`, `password`, `role`, serta `branchId` nullable. Endpoint tidak membuat sesi untuk akun baru. Admin aktif tidak dapat menghapus dirinya melalui endpoint administrasi dan admin terakhir tetap dilindungi.

Perubahan password pribadi menerima `currentPassword` dan `newPassword`. Reset oleh admin menerima `password` serta `reason` minimal lima karakter. Password tidak pernah disimpan di audit log; audit hanya mencatat tindakan, target, pelaku, alasan reset administratif, dan pencabutan sesi. Admin mengganti password akunnya sendiri melalui Pengaturan, bukan endpoint reset akun lain.

## Validasi asal client

Production memeriksa provenance sebelum routing bisnis:

- browser cross-origin harus berasal dari `ALLOWED_WEB_ORIGINS`;
- browser same-origin dikenali melalui Fetch Metadata;
- native client mengirim `X-PLI-Client-ID` dan `X-PLI-Client-Key` yang cocok dengan hash environment;
- sesudah lolos admission, endpoint privat tetap membutuhkan cookie sesi, role, dan branch scope.

Request native contoh:

```http
POST /api/v1/auth/login HTTP/1.1
Content-Type: application/json
X-PLI-Client-ID: pli-android-v1
X-PLI-Client-Key: <raw-key>
```

CORS hanya mengatur browser mana yang boleh membaca response; ia tidak menggantikan autentikasi API.

## Master dan operasional

| Method | Path | Role |
|---|---|---|
| `GET` | `/api/health` | Publik; liveness tanpa database |
| `GET` | `/api/ready` | Publik; readiness PostgreSQL |
| `GET` | `/api/v1/dashboard?branchId=&date=&days=30` | Akun aktif, branch scope; `days` 7–90 |
| `GET` | `/api/v1/branches` | Akun aktif |
| `POST` | `/api/v1/branches` | `ADMIN` |
| `PATCH` | `/api/v1/branches/{id}` | `ADMIN` |
| `GET` | `/api/v1/products` | Akun aktif |
| `POST` | `/api/v1/products` | `ADMIN` |
| `GET` | `/api/v1/stock-units?branchId=` | Akun aktif, branch scope |
| `POST` | `/api/v1/stock-units` | `ADMIN`, `MANAGER` |
| `PATCH` | `/api/v1/stock-units/{id}` | `ADMIN`, `MANAGER` |
| `GET` | `/api/v1/inventory/movements?branchId=&date=` | Akun aktif, branch scope |
| `POST` | `/api/v1/inventory/movements` | `ADMIN`, `MANAGER`, `OPERATOR` |
| `POST` | `/api/v1/inventory/transfers` | `ADMIN`, `MANAGER` |
| `GET` | `/api/v1/meter-units?branchId=&date=` | Akun aktif, branch scope |
| `POST` | `/api/v1/meter-units` | `ADMIN`, `MANAGER` |
| `PATCH` | `/api/v1/meter-units/{id}` | `ADMIN`, `MANAGER` |
| `GET` | `/api/v1/sales/meter-readings?branchId=&date=` | Akun aktif |
| `POST` | `/api/v1/sales/meter-readings` | `ADMIN`, `MANAGER`, `OPERATOR` |
| `PATCH` | `/api/v1/reconciliations/{id}` | `ADMIN`, `MANAGER`, `FINANCE`, `AUDITOR` |
| `PATCH` | `/api/v1/reconciliations/{id}/correction` | `ADMIN`, `MANAGER`, `FINANCE`; alasan wajib |
| `GET` | `/api/v1/reconciliations/{id}/history` | Akun aktif, branch scope |
| `GET` | `/api/v1/reconciliations/{id}/comments` | Akun aktif, branch scope |
| `POST` | `/api/v1/reconciliations/{id}/comments` | Akun aktif, branch scope |
| `GET` | `/api/v1/profiles` | Akun aktif; direktori transparansi |
| `GET` | `/api/v1/profiles/{id}` | Akun aktif |
| `PATCH` | `/api/v1/profiles/me` | Pemilik profil |
| `POST` | `/api/v1/profiles/me/avatar` | Pemilik profil; raw PNG/JPEG/WebP maksimal 512.000 byte |
| `PATCH` | `/api/v1/profiles/me/onboarding` | Pemilik profil |
| `GET` | `/api/v1/audit-logs?...` | Akun aktif; cursor pagination |
| `GET` | `/api/v1/broadcasts?branchId=` | Akun aktif |
| `POST` | `/api/v1/broadcasts` | `ADMIN`, `MANAGER` |
| `PATCH` | `/api/v1/broadcasts/{id}` | `ADMIN`, `MANAGER` |
| `GET` | `/api/v1/reports/daily-stock?...` | Akun aktif |
| `GET` | `/api/v1/reports/meter-reconciliation?...` | Akun aktif |
| `POST` | `/api/v1/reports/export-events` | Akun aktif |
| `POST` | `/api/v1/uploads/presign` | Akun aktif; evidence/report, bukan avatar |

Contoh tambah pompa dinamis:

```json
{
  "branchId": "10000000-0000-0000-0000-000000000001",
  "code": "PMP-TIMUR-04",
  "name": "Pompa Jalur Timur",
  "stockUnitId": "30000000-0000-0000-0000-000000000001",
  "validFrom": "2026-07-10"
}
```

`name` adalah label bebas. Jumlah record tidak dibatasi oleh konsep “depan/belakang”. Menonaktifkan pompa menggunakan `PATCH` dengan `{ "name": "...", "active": false }`; histori tidak dihapus.

Mutasi manual menerima `OPENING`, `SUPPLY`, `SALES_RETURN`, `SUPPLIER_RETURN`, `GAIN`, atau `LOSS`. Mutasi masuk wajib memiliki `unitCost` dan `unitSellingPrice`; transfer mengonsumsi layer FIFO unit asal dan membuat layer ekuivalen di tujuan. Posting bacaan meter wajib mengirim `unitSellingPrice` dan disimpan bersama mutasi `SALE` serta alokasi FIFO dalam satu transaksi database.

`audit-logs` menerima `branchId`, `actorId`, `objectType`, `action`, `outcome`, `search`, `cursor`, dan `limit` (10–100). `outcome` bernilai `SUCCEEDED`, `FAILED`, atau `DENIED`; respons juga memuat `requestId`. Klasifikasi dampak tetap menjadi metadata internal database dan tidak diekspos pada UI/API pengguna. Query dengan `actorId` sengaja dapat dibaca lintas cabang untuk halaman profil transparansi; log cabang umum tetap mengikuti branch scope. Tabel `audit_log`, `meter_reading_revision`, dan `reconciliation_comment` dilindungi trigger immutable dari operasi update/delete.

Scope upload `avatar` hanya menerima `image/png`, `image/jpeg`, atau `image/webp` sampai 512.000 byte. Object key selalu berada di prefix user, dan metadata profil hanya menerima key milik sesi tersebut.

Contoh tambah produk pada database production kosong:

```json
{ "code": "PERTALITE", "name": "Pertalite", "unit": "LITER" }
```

Dashboard memvalidasi `days` sebagai integer 7–90. UI menyediakan preset 7, 14, 30, 60, dan 90 hari; default 30.

## Error contract

```json
{
  "code": "INVALID_REGISTRATION_CODE",
  "message": "Kode registrasi tidak valid atau sudah berganti.",
  "fieldErrors": {
    "registrationCode": "Minta kode enam digit aktif dari administrator."
  },
  "retryable": false,
  "requestId": "0ea9b1b6-..."
}
```

Status utama: `401` sesi/credential, `403` client/origin/role/branch, `409` duplicate atau last-admin guard, `422` validasi, dan `429` rate limit. Semua respons API memakai `cache-control: no-store` dan `x-request-id`.
