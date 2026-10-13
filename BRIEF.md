# Project Brief: Gym Tracker PWA

> Brief ini untuk diserahkan ke Claude Code. Simpan di root repo sebagai `BRIEF.md` (atau salin bagian penting ke `CLAUDE.md`).
> Nama aplikasi masih nama kerja: **GymTrack**. Ganti kalau sudah ada nama final.

---

## 0. Instruksi untuk Claude Code

1. **Mulai di plan mode.** Baca seluruh brief, lalu usulkan: struktur folder, skema database final, dan urutan pengerjaan per fase. Tunggu persetujuan saya sebelum menulis kode.
2. Kerjakan **per fase** (lihat bagian 9). Di akhir setiap fase: ringkas apa yang selesai, apa yang tertunda, dan cara mengetesnya. Tunggu persetujuan sebelum lanjut fase berikutnya.
3. Kalau ada keputusan yang belum jelas di brief ini, **tanya dulu**, jangan berasumsi diam-diam. Untuk hal kecil, pilih default yang wajar dan catat di `DECISIONS.md`.
4. Gunakan versi stabil terbaru dari setiap library. Jangan pakai paket yang sudah tidak dirawat.
5. Jangan pernah commit secret. Semua key masuk `.env.local`, sediakan `.env.example`.

---

## 1. Ringkasan Produk

Aplikasi pencatat latihan gym berbasis web (PWA) yang bisa di-install di HP dan tetap jalan saat sinyal di gym jelek. Fokus utama: **mencatat latihan secepat mungkin di sela set**, lalu menunjukkan progres secara jelas.

- **Jenis produk:** produk publik, multi-user, model freemium
- **Pasar:** Indonesia dulu, siap untuk global (dua bahasa)
- **Pengguna utama:** orang yang rutin angkat beban 3–6x seminggu, dari pemula yang ikut program sampai lifter menengah yang ingin melacak progressive overload
- **Prinsip produk:**
  - Log satu set ≤ 2 tap (nilai terakhir sudah terisi otomatis)
  - Bisa dipakai satu tangan, layar besar, kontras tinggi
  - Data latihan tidak boleh hilang, walau offline atau app tertutup di tengah sesi

---

## 2. Tech Stack

| Bagian | Pilihan |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui, ikon Lucide |
| Backend, Auth, DB, Storage | Supabase (Postgres, Auth, Storage, Row Level Security) |
| Data fetching | TanStack Query |
| Form & validasi | React Hook Form + Zod |
| Penyimpanan offline | IndexedDB via Dexie |
| PWA / service worker | Serwist (atau pengganti setara yang aktif dirawat) |
| Grafik | Recharts |
| i18n | next-intl (id, en) |
| Pembayaran | Midtrans atau Xendit (diputuskan di Fase 5) |
| Testing | Vitest (unit), Playwright (E2E alur utama) |
| Deploy | Vercel |

---

## 3. Fitur MVP

### 3.1 Akun & Onboarding
- Login: email + password, magic link, dan Google OAuth (Supabase Auth)
- Onboarding singkat (≤ 4 layar): nama, bahasa, satuan (kg/lb, default kg), tujuan (kekuatan / hipertrofi / umum), frekuensi latihan per minggu, berat badan awal (opsional)
- Halaman profil & pengaturan: ubah bahasa, satuan, durasi rest default, tema, hapus akun (beserta seluruh datanya)

### 3.2 Exercise Library
- Seed **±80 exercise umum** dengan nama Indonesia & Inggris, otot utama, otot sekunder, alat (barbell, dumbbell, machine, cable, bodyweight, dll.)
- Tipe exercise menentukan input: `weight_reps`, `bodyweight_reps`, `assisted`, `time`, `distance_time`
- Pencarian + filter berdasarkan otot dan alat
- User bisa membuat exercise kustom (hanya terlihat oleh dirinya)
- Halaman detail exercise: riwayat, PR, grafik estimasi 1RM

### 3.3 Log Latihan (fitur terpenting)
- Mulai sesi: kosong, dari template, atau dari jadwal program hari ini
- Per exercise: tambah/hapus set, isi beban, reps, RPE (opsional), tipe set (warm-up, working, drop set, failure)
- **Nilai sesi sebelumnya ditampilkan** di samping setiap set ("terakhir: 60 kg × 8"), dan set baru terisi otomatis dari nilai itu
- Centang set = selesai → **rest timer otomatis** berjalan (default per exercise, bisa diubah), dengan getar/notifikasi saat selesai
- Superset (grup exercise), ubah urutan dengan drag, catatan per exercise dan per sesi
- Timer durasi sesi berjalan di header
- Ringkasan akhir sesi: durasi, total volume, jumlah set, PR baru yang tercapai (dengan highlight)
- Bisa edit atau hapus sesi lama dari riwayat
- **Tahan banting:** state sesi aktif disimpan ke IndexedDB setiap perubahan. Kalau app tertutup atau offline, sesi bisa dilanjutkan dan disinkronkan ke Supabase saat online lagi

### 3.4 Template & Program
- Template = daftar exercise + target set, rentang reps, rest
- Simpan sesi selesai sebagai template baru
- Program = jadwal mingguan yang memetakan hari ke template (contoh: Sen Push, Sel Pull, Rab Legs)
- Sediakan **template bawaan**: Full Body 3x, Upper/Lower 4x, Push/Pull/Legs 6x
- Halaman beranda menampilkan "Latihan hari ini" berdasarkan program aktif

### 3.5 Progres & Grafik
- Estimasi 1RM pakai rumus Epley: `1RM = w × (1 + reps/30)` (hanya untuk reps ≤ 12, abaikan warm-up)
- Personal record per exercise: beban terberat, estimasi 1RM tertinggi, volume set terbesar, reps terbanyak pada beban tertentu
- Grafik:
  - Estimasi 1RM per exercise dari waktu ke waktu
  - Volume mingguan total dan per kelompok otot
  - Frekuensi latihan (kalender heatmap ala GitHub)
- Riwayat sesi dengan filter tanggal dan exercise
- Streak dan konsistensi mingguan (sesi selesai vs target)

### 3.6 Tubuh & Nutrisi
- Log berat badan harian, grafik tren dengan moving average 7 hari
- Ukuran tubuh opsional: lingkar dada, pinggang, lengan, paha, persentase lemak
- **Foto progres** (depan/samping/belakang), disimpan di Supabase Storage bucket privat; tampilan banding dua tanggal berdampingan
- Nutrisi versi sederhana: input total harian kalori, protein, karbo, lemak, plus target harian. **Tidak** ada database makanan di MVP
- Grafik kepatuhan protein & kalori mingguan

---

## 4. Freemium

Batasan fitur dibuat di **satu tempat** (misalnya `lib/entitlements.ts`) supaya gampang diubah. Harga belum final, jadikan konfigurasi.

| Fitur | Free | Premium |
|---|---|---|
| Log latihan, riwayat, exercise library | Tak terbatas | Tak terbatas |
| Template kustom | Maks. 3 | Tak terbatas |
| Program aktif | 1 (bawaan saja) | Program kustom tak terbatas |
| Grafik | 1RM & volume total, 3 bulan terakhir | Semua grafik, seluruh riwayat, volume per otot |
| Foto progres | Maks. 6 foto | Tak terbatas |
| Export data (CSV) | – | Ya |
| Exercise kustom | Maks. 5 | Tak terbatas |

- Di MVP awal, siapkan tabel `subscriptions` dan pengecekan entitlement dulu. Integrasi pembayaran baru di Fase 5
- Paywall harus sopan: tunjukkan apa yang didapat, jangan blokir data yang sudah dibuat user

---

## 5. Model Data (draf, silakan disempurnakan)

Semua tabel milik user wajib **RLS: user hanya bisa membaca/menulis datanya sendiri**. Simpan beban dalam kg di database; konversi ke lb hanya di tampilan.

- `profiles` — id (= auth.users.id), display_name, locale, unit, goal, weekly_target, default_rest_sec, calorie_target, protein_target, created_at
- `exercises` — id, owner_id (null = global), name_id, name_en, primary_muscle, secondary_muscles[], equipment, type, default_rest_sec
- `templates` — id, user_id (null = bawaan), name, notes
- `template_exercises` — id, template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, rest_sec, superset_group
- `programs` — id, user_id, name, is_active
- `program_days` — id, program_id, weekday (0–6), template_id
- `workouts` — id, user_id, template_id, started_at, ended_at, notes, status (in_progress / completed)
- `workout_exercises` — id, workout_id, exercise_id, position, notes, superset_group
- `sets` — id, workout_exercise_id, position, set_type, weight_kg, reps, rpe, duration_sec, distance_m, completed_at
- `personal_records` — id, user_id, exercise_id, record_type, value, set_id, achieved_at (diperbarui oleh fungsi/trigger saat sesi selesai)
- `body_metrics` — id, user_id, date, weight_kg, body_fat_pct, measurements (jsonb)
- `progress_photos` — id, user_id, date, pose, storage_path
- `nutrition_logs` — id, user_id, date, calories, protein_g, carbs_g, fat_g
- `subscriptions` — user_id, tier, status, provider, provider_ref, current_period_end

Gunakan Supabase migrations (SQL di repo) dan generate TypeScript types dari skema.

---

## 6. Desain & UX

- **Tema gelap, bold, sporty.** Latar hampir hitam, satu warna aksen terang (misalnya oranye atau lime) untuk aksi utama dan PR
- Angka besar dan tebal (beban, reps, timer) karena dibaca sekilas di sela set
- Mobile-first: target utama layar 360–430 px. Tombol minimal 44 px, aksi utama di jangkauan jempol (bawah layar)
- Navigasi bawah: **Beranda, Latihan, Progres, Tubuh, Profil**
- Tombol "Mulai Latihan" selalu mudah dijangkau; saat sesi berjalan, tampilkan bar sesi aktif yang menempel di semua halaman
- Feedback haptic (Vibration API) saat set selesai dan rest timer habis
- Animasi kecil untuk momen PR baru, tanpa berlebihan
- Aksesibilitas: kontras WCAG AA, label untuk screen reader, tidak bergantung pada warna saja

---

## 7. Bahasa & Lokalisasi

- Bahasa Indonesia (default) dan English via next-intl. Tidak ada teks hardcode di komponen
- Format angka, tanggal, dan mata uang mengikuti locale (`Rp`, `id-ID`)
- Nama exercise tersedia dalam dua bahasa; istilah gym yang umum (set, reps, RPE, superset) boleh tetap dalam bahasa Inggris di versi Indonesia

---

## 8. Kebutuhan Non-fungsional

- **PWA:** installable, ikon & splash screen, offline untuk halaman sesi aktif dan riwayat terakhir
- **Performa:** Lighthouse mobile ≥ 90 untuk Performance, Accessibility, Best Practices
- **Keamanan:** RLS di semua tabel, bucket foto privat dengan signed URL, validasi Zod di semua input server
- **Privasi:** hapus akun = hapus semua data & foto. Sediakan halaman Kebijakan Privasi dan Syarat Layanan (placeholder)
- **Siap untuk AI (nanti):** fitur AI coach belum masuk MVP, tapi rancang data supaya mudah dibaca (misalnya fungsi `getTrainingSummary(userId, range)` yang mengembalikan ringkasan terstruktur). Jangan pasang Claude API dulu
- **Analitik produk:** event dasar (signup, workout_started, workout_completed, paywall_viewed, upgrade) lewat satu wrapper, provider ditentukan nanti

---

## 9. Fase Pengerjaan

| Fase | Isi | Selesai jika |
|---|---|---|
| 0. Setup | Repo, Next.js, Tailwind, shadcn, Supabase lokal, i18n, PWA dasar, CI lint + test | App kosong ter-deploy ke Vercel dan bisa di-install |
| 1. Auth & Library | Login, onboarding, profil, seed exercise, pencarian/filter, exercise kustom | User baru bisa daftar dan melihat library dalam dua bahasa |
| 2. Log Latihan | Sesi aktif, set, rest timer, superset, ringkasan, riwayat, offline + sync | Satu sesi penuh bisa dicatat dalam mode pesawat lalu tersinkron |
| 3. Template & Program | Template kustom & bawaan, program mingguan, "Latihan hari ini" | User bisa menjalankan PPL dari template bawaan |
| 4. Progres | 1RM, PR, grafik, heatmap, streak | PR terdeteksi otomatis dan muncul di ringkasan sesi |
| 5. Tubuh, Nutrisi, Freemium | Berat badan, ukuran, foto, nutrisi harian, entitlements, pembayaran | Batasan free berlaku, upgrade via pembayaran mengubah tier |
| 6. Polish & Launch | Landing page, SEO, kebijakan privasi, audit Lighthouse, E2E test | Semua kriteria di bagian 10 terpenuhi |

---

## 10. Kriteria Penerimaan MVP

- [ ] User baru bisa daftar, onboarding, dan menyelesaikan sesi latihan pertama dalam < 3 menit
- [ ] Mencatat satu set yang sama dengan sesi sebelumnya cukup 1 tap
- [ ] Sesi aktif tetap utuh setelah app ditutup paksa atau perangkat offline
- [ ] Estimasi 1RM dan deteksi PR punya unit test dan hasilnya benar
- [ ] User A tidak bisa mengakses data User B (dites lewat RLS)
- [ ] Semua teks UI tersedia dalam Bahasa Indonesia dan English
- [ ] Batasan freemium berlaku sesuai tabel di bagian 4
- [ ] Lighthouse mobile ≥ 90 dan app bisa di-install di Android & iOS

---

## 11. Di Luar Scope MVP

- AI coach / rekomendasi otomatis (arsitektur disiapkan, belum dibangun)
- Database makanan dan scan barcode
- Fitur sosial (follow, feed, leaderboard)
- Mode personal trainer–klien
- Integrasi wearable (Google Fit, Apple Health)
- Aplikasi native di Play Store / App Store

---

## 12. Keputusan yang Masih Terbuka

- Nama final dan domain aplikasi
- Harga Premium (bulanan/tahunan) dan apakah ada trial gratis
- Midtrans vs Xendit untuk pembayaran
- Warna aksen final dan logo
- Provider analitik produk
