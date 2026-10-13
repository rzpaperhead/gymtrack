# Keputusan teknis (DECISIONS)

Catatan keputusan kecil yang diambil tanpa bertanya (BRIEF §0.3). Yang besar/bisnis ada di bagian "Masih terbuka".

## Arsitektur

| # | Keputusan | Alasan |
|---|---|---|
| D1 | **Local-first**: semua data user ditulis ke IndexedDB (Dexie) dulu, lalu disinkronkan ke Supabase lewat *outbox*. UI membaca langsung dari IndexedDB (`useLiveQuery`). | Syarat "data tidak boleh hilang walau offline / app tertutup" berlaku untuk semua fitur, bukan cuma sesi aktif. Membaca lokal juga membuat UI instan di gym dengan sinyal jelek. |
| D2 | TanStack Query dipakai untuk data yang **hanya ada di server** (signed URL foto, checkout, hapus akun), bukan untuk data latihan. | Data latihan sudah reaktif dari IndexedDB; membungkusnya dengan Query hanya menambah cache kedua yang bisa basi. |
| D3 | ID dibuat di klien (`crypto.randomUUID()`), push memakai `upsert` → idempoten. Edit berulang pada satu baris digabung jadi satu entri outbox. | Retry aman, tidak ada duplikasi saat sinyal putus-sambung. |
| D4 | `updated_at` selalu diisi server (trigger) dan jadi cursor pull; hapus = *soft delete* (`deleted_at`). | Device lain bisa tahu ada penghapusan. Konflik: *last write wins* per baris; baris yang masih punya edit lokal tidak ditimpa pull. |
| D5 | Semua tabel milik user (termasuk tabel anak seperti `sets`) punya kolom `user_id`. RLS cukup `user_id = auth.uid()`; trigger `assert_parent_owner` mencegah menempel baris ke workout milik orang lain. | RLS sederhana & cepat (tanpa join), diuji di `tests/db/rls.test.ts`. |
| D6 | Exercise & template bawaan dibundel di kode (`src/lib/exercises/seed-data.ts`, `src/lib/templates/builtin.ts`) **dan** di-seed ke DB lewat migration yang di-generate dari file yang sama (`npm run db:gen-builtins`). ID bawaan deterministik. | Library tersedia offline sejak instal pertama; FK di server tetap valid. |
| D7 | Tabel `personal_records` dari draf **tidak dibuat**. PR dihitung dari `sets` (`src/lib/calc/prs.ts`). | Sesi lama bisa diedit/dihapus dan dicatat offline; tabel turunan akan cepat basi. Fungsi murni lebih mudah dites dan bisa dipakai juga di server/AI. |
| D8 | Semua halaman app dirender statis dan di-*precache* service worker; halaman detail memakai query string (`/workout/view?id=`) bukan segmen dinamis. | Seluruh app bisa dibuka offline setelah kunjungan pertama, termasuk riwayat. |
| D9 | i18n: next-intl di sisi klien (`NextIntlClientProvider`), locale disimpan di profil + localStorage. Render server selalu Bahasa Indonesia. Plugin server next-intl tidak dipakai. | Halaman tetap statis (syarat D8). Plugin next-intl juga memuat binding native SWC yang gagal di lingkungan build ini. |
| D10 | Sesi Supabase disimpan di localStorage (supabase-js, PKCE), API route menerima `Authorization: Bearer`. Tidak ada middleware/proxy. | App tetap jalan offline tanpa server; tidak perlu cookie SSR karena data dibaca di klien. |
| D11 | Login email menyediakan **magic link + kode 6 digit**. | PWA yang di-install di iOS: link email terbuka di Safari, bukan di app — kode OTP jadi jalan masuk yang andal. |
| D12 | Tanpa env Supabase, app berjalan dalam **mode demo** (data lokal saja). | Bisa dikembangkan/dites tanpa akun; dipakai juga oleh E2E test. |
| D13 | Service worker: Serwist (`@serwist/turbopack`) dengan esbuild native. | Paket aktif dirawat & mendukung Turbopack (default Next 16). esbuild-wasm menolak path Windows. |
| D14 | Untuk select/dropdown dipakai `<select>` native. | Picker native paling nyaman di HP dan aksesibel by default. |

## Logika latihan

| # | Keputusan |
|---|---|
| L1 | Epley dipakai untuk reps 2–12; **reps = 1 → 1RM = beban itu sendiri**; warm-up & set belum dicentang diabaikan. |
| L2 | Sesi pertama kali untuk sebuah exercise = *baseline*, **tidak** dihitung PR (menghindari banjir "PR" di sesi pertama). |
| L3 | "Reps terbanyak pada beban tertentu" hanya dihitung untuk beban yang pernah dipakai sebelumnya (beban baru sudah tercakup "beban terberat"). |
| L4 | Prefill: menambah exercise menyalin **struktur set sesi terakhir** (jumlah, tipe, beban, reps). Jika belum ada riwayat: jumlah set dari template (atau 1). Mencentang set kosong mengisi dari nilai sesi lalu. |
| L5 | Rest timer: `rest_sec` per exercise di sesi → default exercise → default profil. Dalam superset, rest baru jalan setelah exercise terakhir di grup. Timer disimpan di IndexedDB (selamat dari reload). |
| L6 | Selesai sesi dengan set belum dicentang: pilih "centang semua yang terisi" atau "buang yang belum dicentang". Exercise tanpa set dihapus. |
| L7 | Minggu dimulai **Senin**. Streak = minggu berturut-turut yang memenuhi target; minggu berjalan tidak memutus streak sebelum minggu itu selesai. |
| L8 | Volume per otot dihitung ke otot **utama** saja. |
| L9 | Moving average berat badan = rata-rata 7 hari kalender (bukan 7 entri). |
| L10 | Data per tanggal (berat, nutrisi) boleh dobel jika dua device offline mengisi hari yang sama; yang dibaca adalah yang terakhir diubah. |

## Freemium (`src/lib/entitlements.ts`, cermin di `supabase/migrations/…_entitlements.sql`)

| # | Keputusan |
|---|---|
| F1 | Free: grafik 1RM, volume total mingguan, dan tren berat badan — 90 hari terakhir. Premium: + volume per otot, heatmap, grafik ukuran tubuh, grafik kepatuhan nutrisi, seluruh riwayat. Pencatatan (berat, ukuran, nutrisi) tetap gratis. |
| F2 | Batas dicek di klien (paywall sopan) **dan** di server (trigger `enforce_tier_limit`). Baris yang sudah ada tidak pernah diblokir (edit/sinkron ulang tetap lolos), termasuk setelah turun ke Free. |
| F3 | Program bawaan bisa diaktifkan oleh semua user (disalin sebagai `programs.builtin_key`); program kustom butuh Premium. |
| F4 | Pembayaran: adapter **Midtrans Snap** (sandbox default) di `src/lib/billing/midtrans.ts`. Webhook memverifikasi signature SHA-512 **dan** menanyakan status ke API Midtrans; idempoten via `provider_ref`. Subscription diperpanjang dari `current_period_end` bila masih aktif. Belum ada perpanjangan otomatis (recurring) — lihat pertanyaan terbuka. |
| F5 | Harga default di env: Rp39.000/bulan, Rp299.000/tahun, tanpa trial (placeholder). |

## Masih terbuka (BRIEF §12)

Nama & domain final · harga & trial · Midtrans vs Xendit (adapter Midtrans sudah ada) · warna aksen & logo (sementara lime `oklch(0.9 0.2 127)`, ikon barbel) · provider analitik (wrapper `src/lib/analytics.ts` siap).
