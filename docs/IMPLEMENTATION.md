# Mapping implementasi

| Keputusan | Implementasi |
|---|---|
| Lokalisasi UI, teknis Inggris | Indonesia default, English, Mandarin; API, DTO, schema, enum, identifier Inggris |
| Stock unit ≠ meter unit | Entitas, endpoint, assignment, dan UI terpisah |
| Pompa dinamis | CRUD terbatas create/rename/activate; jumlah dan label tidak di-hardcode |
| Combine hanya laporan | `reporting_group` tidak dapat menjadi target transaksi |
| Formula dapat diaudit | Fungsi bersama + generated view + tooltip hover/focus |
| Audit immutable | PostgreSQL audit ledger + revision snapshot + trigger penolak update/delete |
| Avatar | Signed PUT/GET S3-compatible, maksimal 500 KB, tanpa base64 DB |
| Onboarding | First-login guide + replay per workflow dari Pengaturan |
| XLSX aman dan ringan | `write-excel-file` 4.1.1, dynamic import, data precomputed, tanpa formula silang |
| Auth tanpa SDK berat | Node `scrypt`, opaque session, cookie HttpOnly, DB revocation |
| Kode register per jam | HMAC server-side enam digit, admin-only endpoint |
| Delete account | Password recheck, bersihkan prefix object, revoke seluruh sesi, anonymize email, audit dipertahankan |
| Vercel | Vite static output + catch-all Node Function, pool kecil |
| Local container | Node 24.18.0/Alpine 3.24, PostgreSQL 18.4/Alpine 3.24, SeaweedFS 4.39 |
| Production bootstrap | Migration + satu admin; tanpa seed/master/transaksi palsu |
| Seed local | 320 mutasi + 268 bacaan dari workbook Pangkalan Balai |
| Tema | Gruvbox default; Catppuccin Mocha dan Hatsune Miku alternatif lokal |
| Tren | Poll 10 detik; rentang 7/14/30/60/90 hari |

## Status modul

| Modul | Aktif | Lanjutan |
|---|---|---|
| Authentication | Register/login/logout/delete, roles, code per jam | Password reset, MFA, admin role-management UI |
| Master data | Create/update branch, product create, stock create/update, meter create/update | Product update/deactivate dan overlap validator lengkap |
| Inventory | Dashboard/reporting, opening/supply/return/gain/loss/transfer + FIFO | Reversal UI dan stock-opname workflow |
| Meter sales | Create/read, continuity, atomic allocation + stock posting | Bulk import dengan validasi cost historis |
| Reconciliation | Filter, decision, correction immutable, revision ledger, threaded discussion | Attachment bukti per komentar |
| Opname & approval | Schema | Form dan decision workflow |
| Finance | Schema/KPI | Expense/income/deposit screens |
| Reports | CSV dan XLSX multi-sheet | Async export job + S3 download untuk volume besar |
| Security/audit | Session, role, branch, origin, rate limit, searchable immutable audit | MFA, centralized rate limit, SIEM |

## Security invariant

- `REGISTRATION_CODE_SECRET`, password bootstrap, database URL, dan S3 credential hanya berada di environment server.
- Akun baru selalu `OPERATOR`; kode registrasi tidak memberikan role admin.
- Role non-admin hanya dapat membaca/menulis cabang yang ditetapkan.
- Admin terakhir tidak dapat menghapus akunnya.
- Koreksi meter tidak menimpa histori: nilai aktif diperbarui secara transaksional, status kembali `PENDING`, dan snapshot sebelum/sesudah tersimpan immutable.
