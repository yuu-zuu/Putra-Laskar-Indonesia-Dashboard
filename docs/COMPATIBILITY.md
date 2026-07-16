# Kompatibilitas browser dan perangkat

## Batas dukungan

Aplikasi web tidak bergantung pada sistem operasi. Windows, Linux, macOS, Android, dan iOS memakai build yang sama; kompatibilitas ditentukan oleh engine browser.

Build production menargetkan `es2024`; tidak ada penurunan target bahasa untuk menutupi masalah runtime. Release ditujukan pada browser modern yang masih menerima pembaruan keamanan:

| Browser engine | Target QA release |
|---|---:|
| Chrome/Chromium/Android WebView | Dua versi stabil terbaru |
| Firefox desktop/Android | Dua versi stabil terbaru |
| Safari/iOS WebKit | Dua versi stabil terbaru |
| Edge Chromium | Dua versi stabil terbaru |

Rujukan: [Vite — Browser Compatibility](https://vite.dev/guide/build#browser-compatibility) dan [React — dukungan browser modern](https://react.dev/blog/2022/03/08/react-18-upgrade-guide#dropping-support-for-internet-explorer).

Internet Explorer, Android Browser lama, Opera Mini, UC Browser lama, dan browser Symbian tidak didukung. Browser tersebut tidak menyediakan kombinasi native ESM, dynamic import, `import.meta`, Fetch, Promise/microtask, dan CSS layout modern yang dibutuhkan React/Vite. Menambahkan polyfill untuk API tunggal tidak cukup untuk menjadikannya target yang aman.

## Fallback yang disediakan

| Kemampuan | Jalur utama | Fallback |
|---|---|---|
| Request ID HTTP | Dibuat API dengan `randomBytes` | Browser tidak membuat UUID saat login/request |
| ID operasi/idempotensi | `crypto.getRandomValues()` | Pseudo-random hanya untuk korelasi local/mock |
| Timeout request | `AbortController` | Request tetap berjalan tanpa cancellation pada browser yang tidak memilikinya |
| Gabungan abort | Relay event ke satu `AbortController` | Tidak memakai `AbortSignal.any()` |
| Penyimpanan preferensi | `localStorage` | Penyimpanan memori selama tab aktif |
| Salin kode | Clipboard API | `document.execCommand("copy")` |
| Tutorial responsif | `ResizeObserver` | Event resize/scroll biasa |
| Clone data demo | `structuredClone()` | Clone JSON untuk data demo serializable |
| Hash password demo | Web Crypto SHA-256 | Hash deterministik non-security; production selalu memakai scrypt di API |
| Tinggi viewport mobile | `dvh` | Deklarasi `vh` sebelumnya |

Fallback pseudo-random dan hash demo tidak pernah dipakai untuk session token, password production, kode registrasi, atau signature. Seluruh material keamanan production dibuat dan diverifikasi di API Node.js.

## HTTP LAN dan HTTPS production

- Production wajib HTTPS agar cookie `Secure`, Web Crypto, Clipboard, dan kebijakan browser bekerja konsisten.
- HTTP melalui IP LAN hanya untuk pengujian lokal. Request ID dibuat API; upload preview, timeout, dan akses API memiliki jalur fallback yang relevan.
- Pada iOS, semua browser memakai WebKit meskipun bernama Firefox atau Chrome. Karena itu pengujian iPhone harus mengikuti versi iOS/Safari, bukan hanya versi aplikasi browser.

## Uji lintas perangkat sebelum release

1. Login dengan email dan ID karyawan.
2. Verifikasi cookie sesi setelah reload.
3. Pilih/ganti cabang dan buka semua navigasi.
4. Tambah bacaan meter, mutasi stock, rekonsiliasi, dan ekspor.
5. Upload avatar PNG/JPEG/WebP dari kamera/galeri.
6. Jalankan tutorial, tooltip, grafik sentuh, dan broadcast.
7. Uji jaringan lambat, timeout, offline, serta storage/clipboard yang diblokir.
8. Uji portrait 320 px, landscape, keyboard desktop, dan pembesaran teks 200%.

Gunakan perangkat fisik sekurangnya satu Android Chromium, satu Firefox Android, dan satu iPhone/iPad WebKit sebelum promosi deployment production.

## Memastikan HP memuat build terbaru

Buka `http://<IP-LAPTOP>:5173/build-info.json` dari perangkat yang bermasalah. Release ini harus menampilkan:

```json
{
  "release": "2026.07.16-auth-trace.3",
  "requestIdStrategy": "server-assigned",
  "operationIdStrategy": "getRandomValues-with-local-fallback"
}
```

Jika nilainya berbeda atau URL tidak tersedia, container/web server masih melayani build lama. Build production juga diperiksa oleh `npm run verify:browser-bundle`; quality gate gagal apabila `randomUUID`, `AbortSignal.timeout`, atau `AbortSignal.any` muncul di JavaScript browser.
