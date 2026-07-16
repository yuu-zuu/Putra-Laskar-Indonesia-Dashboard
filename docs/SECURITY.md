# Security model

Dokumen ini menjelaskan kontrol yang sudah ada dan batasnya. Ia bukan pengganti penetration test atau review independen sebelum go-live.

## Authentication dan session

- Password di-hash dengan Node `scrypt`, salt acak, dan compare timing-safe.
- Login menerima email atau employee ID, tetapi tidak mengungkap identifier mana yang valid.
- Session token acak hanya dikirim sebagai cookie `HttpOnly`; database menyimpan hash token, expiry, last seen, IP, user-agent, dan revocation.
- Request web hanya menerima origin pada `ALLOWED_WEB_ORIGINS`; production cookie harus `Secure`.
- Pengecualian origin LAN hanya menerima IP privat + port local ketika `ALLOW_PRIVATE_NETWORK_ORIGINS=true`; production wajib menonaktifkannya.
- Production menolak client tanpa provenance. Browser same-origin memakai Fetch Metadata; native memakai ID + key terdaftar dan tetap wajib login.
- Startup production gagal lebih awal bila origin/object endpoint bukan HTTPS, origin utama tidak berada pada allowlist, cookie tidak memakai prefix `__Host-`, seed lokal aktif, atau secret registrasi kurang dari 32 byte.
- Login/register memakai rate-limit database. Untuk traffic besar, pindahkan bucket ke store terdistribusi dengan kontrak sama.
- Last active admin tidak dapat menghapus diri sendiri.
- Admin terakhir tidak dapat diturunkan; role akun admin yang sedang aktif harus diubah oleh admin lain.

## Endpoint publik dan kode yang terlihat

URL Vercel Function memang dapat dipanggil dari internet dan JavaScript frontend dapat diperiksa pengguna. Ini normal; keamanan tidak boleh bergantung pada endpoint tersembunyi atau secret di browser. Credential PostgreSQL, registration secret, hash key native, dan object-storage key hanya berada di server environment.

Kontrol request berlapis:

1. `ALLOWED_WEB_ORIGINS` menolak origin browser asing dan CORS API tidak pernah menggunakan wildcard credentialed.
2. `REQUIRE_CLIENT_PROVENANCE=true` menolak curl/script tanpa provenance yang dikonfigurasi.
3. Native client harus mengirim ID/key per channel; key dapat dicabut tanpa mengubah akun pengguna.
4. Cookie sesi `HttpOnly`, role, branch scope, ownership, idempotency, dan rate limit tetap menjadi security boundary utama.
5. Vercel Firewall/WAF dapat menambah IP block, challenge, custom rule, dan rate limiting di edge.

CORS adalah kebijakan browser untuk membaca response, bukan bukti bahwa request berasal dari aplikasi asli. Lihat [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS). Static key dalam binary native juga dapat diekstrak; untuk risiko lebih tinggi gunakan short-lived access token, PKCE, platform attestation, atau mTLS/API gateway. Jangan menganggap `X-PLI-Client-Key` sebagai identitas pengguna.

## Kode registrasi

- Kode enam digit dihitung HMAC di server dari secret dan window UTC satu jam.
- Kode tidak disimpan di database atau bundle frontend.
- Endpoint pembaca hanya untuk admin; akun baru selalu `OPERATOR`.
- Rotasi secret mengganti kode aktif dan membatalkan kode sebelumnya.

## Authorization

| Kontrol | Implementasi |
|---|---|
| Role | `requireUser(request, allowedRoles)` pada route mutation |
| Branch | Non-admin harus cocok dengan `user.branchId`; admin dapat memilih branch |
| Object ownership | Avatar key wajib berada di prefix `avatar/{userId}/` |
| Global master | Pembuatan produk hanya admin |
| Transparansi | Profil/aktivitas user lain dapat dibaca akun aktif; mutation profil hanya pemilik |
| Mutasi pegawai | Hanya admin; alasan dan snapshot role/cabang sebelum–sesudah disimpan di audit |

Frontend bukan security boundary. Semua role/branch/ownership diperiksa ulang di API.

## Upload dan object storage

- Avatar kecil dikirim ke API, divalidasi ulang, lalu diteruskan ke object storage melalui endpoint internal. Alur ini menghindari CORS/host object storage yang berbeda pada HP/LAN.
- Avatar dibatasi PNG/JPEG/WebP dan 512.000 byte pada UI maupun saat API membaca body; signature JPEG/PNG/WebP juga diperiksa sebelum upload.
- Object key dibuat server-side; signed GET untuk avatar berumur pendek.
- Penghapusan akun membersihkan seluruh prefix objek milik user sebelum soft-delete dilanjutkan. Kegagalan storage membatalkan penghapusan; transaksi dan audit historis tidak dihapus.
- CSP mengizinkan `blob:` untuk preview lokal dan endpoint object storage untuk image.
- Production perlu bucket private, CORS origin spesifik, lifecycle untuk object yatim, serta antivirus/quarantine bila attachment bukti diaktifkan.
- MIME header tidak membuktikan isi file. Untuk risiko tinggi, tambahkan magic-byte validation melalui ingestion worker sebelum object dipublikasikan.

## Audit dan trace

- Setiap response memiliki `x-request-id`; error contract mengembalikannya ke pengguna.
- Audit menyimpan action, outcome (`SUCCEEDED`, `FAILED`, `DENIED`), actor, object, reason, metadata, dan request ID.
- `audit_log`, `meter_reading_revision`, dan `reconciliation_comment` memiliki trigger penolak `UPDATE`/`DELETE`.
- Detail exception internal hanya berada pada structured server log; response memakai pesan aman.
- Preferensi browser seperti bahasa, tema, dan compact sidebar ditandai local dan tidak menambah noise audit bersama.

Immutable di database yang sama belum setara WORM. Untuk anti-tamper tingkat tinggi, replikasi audit ke storage append-only/SIEM dengan hash chain dan retention policy terpisah.

## HTTP headers

`vercel.json` mengatur CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Referrer-Policy`, `Permissions-Policy`, dan `frame-ancestors 'none'`. `connect-src` production hanya mengizinkan origin aplikasi; avatar tetap dapat dibaca dari signed HTTPS image URL. Jika attachment kelak memakai direct signed PUT, tambahkan hostname object storage secara eksplisit ke `connect-src`, bukan wildcard protocol.

## Secret dan data privacy

- Jangan memakai prefix `VITE_` untuk database, HMAC, atau object-storage credentials.
- Jangan menaruh password bootstrap dalam repository, screenshot, atau tiket.
- Bootstrap admin memakai advisory lock, hanya membuat identitas awal yang belum ada, dan menolak konflik; command tidak pernah menaikkan role atau menimpa password akun yang sudah ada secara diam-diam.
- Penggantian password pribadi memerlukan password lama, dibatasi percobaannya, memakai pembaruan kondisional untuk mencegah overwrite bersamaan, mencabut sesi lain, lalu menerbitkan ulang sesi peminta.
- Reset password oleh admin memerlukan alasan audit, tidak pernah mencatat password, dan langsung mencabut seluruh sesi akun target.
- Audit delete account mempertahankan histori bisnis, mencatat jumlah objek yang dibersihkan, dan menganonimkan email akun.
- Backup harus terenkripsi, akses minimum, memiliki retention, dan diuji restore.
- Gunakan akun database aplikasi non-superuser pada production; migration role dapat terpisah.

## Checklist go-live

1. Ganti semua default local dan bootstrap password.
2. Set `NODE_ENV=production`, `ALLOW_LOCAL_SEED=false`, cookie secure, TLS database.
3. Batasi CORS bucket dan CSP ke domain production.
4. Jalankan dependency audit, SAST, UAT role/branch, dan penetration test.
5. Aktifkan database PITR, object versioning/lifecycle, alert error/latency, dan audit export.
6. Uji account deletion, admin-last guard, code rotation, revoked session, duplicate idempotency, serta concurrent FIFO sale.
7. Definisikan incident owner, secret rotation, backup restore, dan data-retention policy.
8. Set `REQUIRE_CLIENT_PROVENANCE=true`, verifikasi allowlist origin, dan biarkan native map kosong sampai client resmi tersedia.
9. Aktifkan [Vercel WAF custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules) serta [rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) untuk endpoint login/register/API sensitif.
