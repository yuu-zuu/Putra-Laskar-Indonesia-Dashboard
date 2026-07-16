# Peta kode dan dependensi

## Workspace

| Path | Tanggung jawab | Boleh bergantung pada |
|---|---|---|
| `packages/contracts` | DTO, enum TypeScript, formula, util hitung meter | Standard library saja |
| `apps/api` | HTTP API, auth, validasi, transaksi, SQL, presign | contracts, `pg`, Node API |
| `apps/web` | UI React, context, gateway, chart, export | contracts, React; XLSX secara dinamis |
| `api/[...path].mjs` | Adapter Vercel Function | handler JavaScript terkompilasi dari `apps/api/dist` |
| `database/migrations` | Schema production | PostgreSQL 18 |
| `database/seeds` | Dataset workbook local-only | Schema hasil migration |
| `scripts` | Orkestrasi dev dan Podman | Node/shell host |

## Dependency table frontend

| Modul | Menggunakan | Dipakai oleh | Catatan |
|---|---|---|---|
| `main.tsx` | providers, `App` | browser entry | Urutan provider menentukan scope state |
| `App.tsx` | route resolver, pages, `AppShell` | `main` | Tidak memuat data bisnis langsung |
| `app/auth.tsx` | `authGateway` | seluruh area login | Sumber tunggal `AuthUser`; `refresh()` menyinkronkan header |
| `app/branches.tsx` | auth, HTTP | shell/pages | Active branch disimpan lokal; data branch dari API |
| `app/i18n.tsx` | contracts locale | komponen/pages | Locale lokal tidak membuat audit bersama |
| `app/preferences.tsx` | safe storage | shell/settings | Gruvbox default; Mocha/Miku tersedia |
| `app/tutorial.tsx` | auth, profile gateway, DOM | root provider | Spotlight target adalah selector kontrol nyata |
| `data/*Gateway.ts` | `lib/http.ts` | pages/hooks | Boundary transport; halaman tidak menyusun URL mentah |
| `lib/formulaLocale.ts` | contracts formula + locale | `FormulaHint` | Salinan rumus ID/EN/ZH tanpa mengubah formula domain |
| `lib/http.ts` | abort, safe storage | seluruh gateway API | Fetch, timeout portable, request ID dari respons server, parsing error lokal |
| `lib/abort.ts` | AbortController opsional | HTTP/dashboard | Timeout dan relay abort tanpa `AbortSignal.timeout/any` |
| `lib/id.ts` | Web Crypto opsional | HTTP/mock gateway | UUID korelasi portable; tidak membuat token keamanan |
| `lib/storage.ts` | localStorage opsional | context/mock gateway | Fallback memori bila storage diblokir browser |
| `lib/clipboard.ts` | Clipboard/DOM | settings | Copy modern dengan fallback legacy |
| `lib/clone.ts`, `lib/mockHash.ts` | API browser opsional | mock gateway | Fallback khusus data/password demo |
| `hooks/useDashboard.ts` | dashboard gateway | dashboard/stock | Poll 10 detik + abort + manual reload |
| `components/AppShell.tsx` | branch/auth profile/broadcast | semua halaman privat | Avatar header memakai profile signed URL |
| `components/PasswordInput.tsx` | i18n + Icon | auth/settings/accounts | Input password reusable dengan kontrol tampil/sembunyi |
| `app/tutorial.tsx` | auth/i18n/profile gateway + DOM targets | seluruh halaman privat | State machine panduan; retry target, action feasibility, touch fallback, posisi adaptif, minimize/resume |
| `data/accountGateway.ts` | HTTP/mock storage | `AccountsPage` | Boundary daftar/buat/mutasi/hapus akun admin |
| `pages/AccountsPage.tsx` | account gateway, branch/auth | router admin | Administrasi dan mutasi role/cabang akun |
| `components/ActivityLog.tsx` | audit gateway | settings/profile | Cursor pagination, filter, refresh 15 detik |
| `components/StockTrendChart.tsx` | `TrendPoint`, format | dashboard | SVG interaktif tanpa chart library; pointer, touch, keyboard, dan live detail |
| `components/ProductDialog.tsx` | master gateway | stock units | Bootstrap produk saat DB production masih kosong |
| `pages/*` | contexts, components, gateways | router | Orkestrasi view; business invariant tetap di API |
| `styles/*.css` | CSS custom properties | web entry | Reset, token, layout, component, page, theme, refinement terpisah |

## Dependency table API

| Modul/kelas | Menggunakan | Dipakai oleh | Tanggung jawab |
|---|---|---|---|
| `app.ts:handleRequest` | router, route registry, errors | local server, Vercel adapter | Boundary request/response dan error audit |
| `http/Router` | URLPattern internal | route registry | Match method/path parameter |
| `auth/session.ts` | pool, crypto, env | protected routes | Session lookup, cookie, origin, role |
| `auth/clientAccess.ts` | crypto, env | app/session | Allowlist web, Fetch Metadata, dan key native hashed |
| `auth/password.ts` | Node crypto | auth/bootstrap | Scrypt hash/verify |
| `auth/registrationCode.ts` | HMAC, env | auth routes | Kode enam digit window satu jam |
| `lib/validation.ts` | `AppError` | routes | Parser input eksplisit; tidak melempar raw DB detail |
| `lib/audit.ts` | pool/client | mutation routes/app | Audit success/failure/denied + request ID |
| `db/transaction.ts` | pool/client | mutation routes/bootstrap | Boundary BEGIN/COMMIT/rollback/release tunggal |
| `db/idempotency.ts` | PostgreSQL advisory lock | route posting | Serialisasi retry hanya untuk logical key yang sama |
| `config/env.ts` | process environment | seluruh API | Parse ketat dan invariant startup production |
| `DashboardRepository` | pool, contracts | `DashboardService` | Query branch, stock, trend, KPI, activity |
| `DashboardService` | repository | dashboard route | Menggabungkan read model menjadi response |
| `domain/fifo.ts` | `AppError` | inventory service/tests | Allocation FIFO murni dan weighted cost |
| `inventoryPostingService.ts` | FIFO, `PoolClient` | meter/inventory routes | Assignment, lock/consume/restore layer |
| `routes/auth.ts` | auth primitives, audit | route registry | Register/login/logout/delete |
| `routes/accounts.ts` | password/session/audit/object cleanup | route registry | List/create/mutasi/soft-delete akun khusus admin |
| `userObjectCleanupService.ts` | S3 signer, fetch | account deletion | List dan hapus semua prefix objek milik akun |
| `routes/masters.ts` | pool, validation, audit | route registry | Branch, product, stock unit, meter unit |
| `routes/inventoryMovements.ts` | posting service, pool | route registry | Supply/opening/return/gain/loss/transfer |
| `routes/meterReadings.ts` | posting service, FIFO | route registry | Atomic meter sale posting |
| `routes/reconciliation.ts` | pool, revision/comment | route registry | Decision, correction, immutable history/tree |
| `routes/profiles.ts` | pool, signer | route registry | Directory, avatar metadata, onboarding |
| `routes/uploads.ts` | S3 signer | route registry | Presigned upload policy |
| `routes/reports.ts` | pool, audit | route registry | Dataset export dan event audit |
| `db/runSqlDirectory.ts` | fs, pool | migrate/seed | File ordering, tracking, transaction per file |

## Alur perubahan yang umum

| Ingin mengubah | File utama | Ikut diperiksa |
|---|---|---|
| Tambah field API | contracts type + route | gateway, page, docs/API, migration bila persisted |
| Tambah command stock | contracts + route/service | enum DB, audit metadata, report/view, FIFO tests |
| Tambah tema | `themes.css`, preference type, Settings | contrast/focus/mobile screenshot |
| Tambah bahasa | dictionary i18n | literal UI yang tersisa, aria-label, tutorial |
| Tambah tabel | migration baru | ERD, backup, index, retention, branch scope |
| Ubah query dashboard | repository | trend ranges, empty branch, timezone, performance plan |
| Ubah upload | signer/routes/CSP | bucket CORS, MIME/size validation, docs security |

## Aturan modularitas

- Jangan mengakses `fetch` langsung dari page; tambahkan fungsi gateway kecil.
- Jangan menaruh SQL di frontend atau contracts.
- Jangan mempercayai role/branch dari body; selalu ambil identitas dari session.
- Jangan membuat mutation lintas beberapa query tanpa transaction jika sebagian hasil tidak boleh tersimpan.
- Gunakan `inTransaction()` untuk seluruh mutation runtime; `BEGIN/COMMIT/ROLLBACK` mentah hanya berada pada runner migration yang mengelola satu file SQL sebagai unit tersendiri.
- Jangan menangkap error hanya untuk menghilangkannya; ubah menjadi kontrak pengguna dan simpan detail trace pada log server/request ID.
- Pertahankan komponen kecil; dialog workflow terpisah dari page ketika memiliki state/submit sendiri.
