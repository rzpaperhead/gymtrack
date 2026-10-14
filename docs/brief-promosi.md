# BRIEF PROMOSI — GymTrack

> **Untuk Claude:** Dokumen ini adalah penjelasan lengkap tentang aplikasi **GymTrack**, dari awal sampai akhir. Bacalah seluruhnya sebelum menulis apa pun. Tugasmu adalah membantu saya (pemilik app) membuat **bahan promosi**: script video pendek (Reels/TikTok/Shorts), caption, copy iklan, thread, dan materi sejenis. Semua fakta di sini akurat dan sudah ada di aplikasi. **Jangan mengarang fitur yang tidak tertulis di sini.** Kalau butuh informasi yang tidak ada, tanyakan ke saya.

---

## 1. Ringkasan singkat

**GymTrack** adalah aplikasi pencatat latihan gym berbahasa Indonesia. Aplikasi ini **tetap jalan walau sinyal jelek atau tanpa internet**, mencatat satu set cukup dengan **satu tap**, dan dilengkapi **asisten seperti personal trainer**, **peta pemulihan otot**, serta **fitur sosial** (teman, peringkat, tantangan, chat).

- **Tagline resmi:** "Catat latihan secepat mengangkat beban."
- **Subjudul:** "Pencatat latihan gym yang tetap jalan walau sinyal jelek. Satu tap per set, progres yang jelas, dan PR yang terdeteksi otomatis."
- **Link:** https://gymtrack-seven-theta.vercel.app
- **Bahasa:** Indonesia (default) dan Inggris
- **Platform:** aplikasi web yang bisa **dipasang di layar utama HP** (PWA), baik Android maupun iPhone. **Tidak ada di Play Store/App Store**. Pasangnya langsung dari browser tanpa download besar, dan tetap tampil layar penuh seperti aplikasi biasa.

---

## 2. Masalah yang diselesaikan

| Masalah orang yang nge-gym | Jawaban GymTrack |
|---|---|
| Sinyal di gym (basement, mal) sering hilang, app lain loading terus | **Offline-first**: semua tersimpan di HP dulu, lalu sinkron otomatis saat online. Tidak ada set yang hilang. |
| Mencatat di notes HP itu ribet dan berantakan | **Satu tap per set**. Beban & repetisi sesi sebelumnya **sudah terisi otomatis**, tinggal centang. |
| Lupa minggu lalu angkat berapa | Nilai latihan terakhir muncul di setiap gerakan |
| Bingung kapan harus naik beban | **Asisten PT** memberi saran beban & repetisi untuk sesi berikutnya |
| Bingung hari ini latihan otot apa | **Peta pemulihan otot**: mana yang siap dilatih, mana yang masih lelah |
| Lupa waktu istirahat antar set | **Rest timer otomatis**. Notifikasi tetap muncul walau HP dikunci. |
| Latihan sendirian membosankan dan cepat menyerah | **Teman, peringkat mingguan, tantangan, kudos, chat & grup chat** |
| App gym populer kebanyakan berbahasa Inggris dan mahal (langganan bulanan) | **Bahasa Indonesia**, banyak fitur gratis, Premium **sekali bayar seumur hidup** dengan harga sangat murah |

---

## 3. Target pengguna (persona)

1. **Pemula gym (18–30 tahun):** baru mulai, butuh panduan dan program siap pakai, takut salah. Butuh rasa "ada yang membimbing".
2. **Gym-goer rutin:** sudah 3–5x seminggu dan ingin melihat progres dalam angka (1RM, volume, PR).
3. **Orang yang ingin turun atau naik berat badan:** mencatat berat badan, ukuran tubuh, foto progres, dan nutrisi.
4. **Gym buddy / komunitas gym:** suka saling memotivasi, bersaing, dan pamer progres ke teman.

---

## 4. Perjalanan pengguna dari awal sampai akhir

### 4.1 Masuk pertama kali
- **Bisa coba tanpa daftar** (tombol "Coba dulu tanpa daftar"). Semua data tersimpan di HP. Saat nanti daftar, data otomatis ikut pindah ke akun.
- **Daftar** cukup dengan email + password. Ada fitur **lupa password**.
- **Onboarding 4 langkah:**
  1. Nama dan bahasa.
  2. Satuan (kg/lb) dan **tujuan utama**:
     - Kekuatan
     - Hipertrofi (otot)
     - Kebugaran umum
     - **Menurunkan berat badan**
     - **Menaikkan berat badan**
  3. Target berapa kali latihan per minggu.
  4. Mulai latihan.

### 4.2 Beranda (home)
- Sapaan nama, **latihan hari ini** dari program aktif, tombol "Latihan bebas".
- Kartu **"Minggu ini 2/3"** (progres target mingguan) dan **streak** (minggu berturut-turut mencapai target).
- **Asisten PT** (Premium): insight mingguan, misalnya:
  - "Masih kurang 1 sesi minggu ini, sisa 2 hari."
  - "Otot kaki belum dilatih 9 hari."
  - "Kamu sudah latihan 5 hari berturut-turut, ambil 1 hari istirahat."
- **Peta pemulihan otot** (fitur unggulan, lihat 4.4).
- Riwayat latihan terakhir.

### 4.3 Saat latihan (inti aplikasi)
- Mulai dari **template**, **program**, atau **latihan bebas** (pilih gerakan sambil jalan).
- **113 gerakan bawaan**, dikelompokkan per otot (dada, punggung, bahu, lengan (bisep/trisep), kaki, perut, kardio), plus kategori **pemanasan dinamis** dan **pendinginan statis**. Bisa juga membuat gerakan sendiri.
- **Otomatis menyarankan pemanasan & pendinginan** sesuai otot yang dilatih hari itu.
- **Satu tap per set:** beban & repetisi dari sesi sebelumnya sudah terisi, tinggal centang ✓.
- Jenis set: **Warm-up, Working, Drop set, Failure**. Bisa mencatat RPE.
- **Rest timer otomatis** setelah set dicentang. Tetap memberi **notifikasi walau app ditutup atau HP dikunci**. Layar dijaga tetap menyala selama latihan.
- **Saran Asisten PT per gerakan** (Premium):
  - "Naikkan ke 62,5 kg × 8. Semua set kemarin mencapai target!"
  - "Tetap 60 kg, kejar 12 reps."
  - Saran ini menggunakan metode **double progression** yang biasa dipakai pelatih, dan target repetisinya menyesuaikan tujuan (misalnya 3–6 reps untuk kekuatan, 10–15 untuk menurunkan berat badan).
- **Ringkasan setelah selesai:** durasi, total volume, jumlah set, **perkiraan kalori**, dan **PR (rekor pribadi) yang terdeteksi otomatis** 🏆.

### 4.4 Peta pemulihan otot (fitur baru, gratis)
- Gambar tubuh **depan & belakang** dengan 16 otot berwarna:
  - 🟢 **Siap**
  - 🟡 **Pemulihan**
  - 🔴 **Masih lelah**
- Daftar **"Siap dilatih hari ini"** (yang paling lama tidak dilatih ada di urutan depan) dan **"Masih pemulihan: Dada, siap ±48 jam lagi"**.
- Dihitung dari jumlah set 7 hari terakhir. Otot besar butuh ±72 jam, otot kecil ±48 jam.
- Jawaban langsung untuk pertanyaan "hari ini latihan apa ya?"

### 4.5 Program & template siap pakai
- **Program:**
  - **Full Body 3x/minggu**
  - **Upper/Lower 4x/minggu**
  - **Push/Pull/Legs 6x/minggu**
- **Template bawaan:** Full Body A/B, Upper A/B, Lower A/B, Push, Pull, Legs.
- Bisa membuat template sendiri, dan menyimpan latihan bebas sebagai template.

### 4.6 Progres
- **Estimasi 1RM** per gerakan (rumus Epley), grafik volume, **heatmap latihan**, volume per otot.
- **Rekor pribadi (PR)** otomatis.
- **Ringkasan mingguan/bulanan:** jumlah sesi, volume, PR, kalori, gerakan favorit. Bisa dibagikan sebagai **kartu gambar** (ukuran feed Instagram 1080×1350) ke WhatsApp/Instagram.
- **15 lencana (badge):**
  - Langkah Pertama
  - 10 / 50 / 100 Sesi
  - Streak 4 / 8 / 12 Minggu
  - Sesi 10 Ton
  - Total 100 Ton
  - Bench 100 kg
  - Squat 140 kg
  - Deadlift 180 kg
  - Si Pagi
  - Si Malam
  - Raja Pemanasan

### 4.7 Tubuh
- **Berat badan** dan rata-rata 7 hari, plus **lemak tubuh (%)**.
- **Ukuran tubuh:** dada, pinggang, lengan, paha.
- **Foto progres** (depan/samping/belakang), privat, dan bisa **dibandingkan berdampingan** antar tanggal.
- **Nutrisi harian:** kalori, protein, karbo, lemak, dengan target harian dan kepatuhan mingguan.

### 4.8 Sosial
- **Tambah teman** lewat kode teman (format GT-XXXXXX).
- **Lihat progres teman.** **Privasi bisa diatur per bagian** (streak, riwayat latihan, angkatan). Kalau kamu menyembunyikan progres, kamu juga tidak bisa melihat progres temanmu (adil, timbal balik).
- **Feed aktivitas** teman.
- **Kudos** (💪🔥👏🏆) pada latihan teman.
- **Peringkat mingguan** antar teman (sesi atau volume).
- **Tantangan**, misalnya "12 sesi dalam 30 hari", bersama teman.
- **Chat pribadi & grup chat** (contoh nama grup: "Gym Squad"). Ada **centang 1, centang 2, dan centang 2 biru** seperti WhatsApp.
- **Blokir** pengguna.
- **Notifikasi:** permintaan teman, kudos, PR teman, pesan baru, dan Premium aktif.

### 4.9 Pengingat & kenyamanan
- **Pengingat jadwal latihan** (pilih hari & jam).
- **Notifikasi rest timer** di latar belakang.
- **Tema gelap/terang**, foto profil, dan **dua bahasa**.

---

## 5. Gratis vs Premium

| | **Gratis** | **Premium** |
|---|---|---|
| Mencatat latihan tanpa batas, offline, rest timer, PR otomatis | ✅ | ✅ |
| Program & template bawaan | ✅ | ✅ |
| Peta pemulihan otot | ✅ | ✅ |
| Fitur sosial (teman, peringkat, tantangan, chat) | ✅ | ✅ |
| Lencana, ringkasan & kartu share | ✅ | ✅ |
| Template kustom | 3 | **Tanpa batas** |
| Gerakan kustom | 5 | **Tanpa batas** |
| Foto progres | 6 | **Tanpa batas** |
| Program kustom | ❌ | ✅ |
| Grafik | 1RM, volume total, berat badan (90 hari terakhir) | **Semua grafik** (volume per otot, heatmap, ukuran tubuh, nutrisi), **seluruh riwayat** |
| Asisten PT (saran beban per gerakan + insight mingguan) | ❌ (bisa lihat contohnya) | ✅ |
| Export data CSV | ❌ | ✅ |

**Harga Premium:**
- **Sekali bayar, berlaku permanen** (bukan langganan).
- Harga normal **$5**, sekarang **diskon jadi $0,9**, sekitar **Rp15 ribuan** (dikonversi ke rupiah mengikuti kurs hari itu).
- **Cara bayar:** transfer bank, unggah screenshot bukti, lalu Premium aktif setelah dicek admin. User mendapat notifikasi saat Premium aktif.
- Ada juga **kode promo** (bisa untuk giveaway/kolaborasi: Premium sementara atau permanen).
- **Janji penting:** "Data yang sudah kamu buat tidak akan pernah dikunci." Turun ke paket gratis tidak menghapus apa pun.

---

## 6. Keunggulan utama (untuk hook promosi)

1. **Jalan tanpa sinyal.** Cocok untuk gym di basement.
2. **Satu tap per set.** Angka minggu lalu sudah terisi.
3. **Seperti punya PT pribadi:** saran naik beban, deteksi otot yang terlupakan, pengingat istirahat.
4. **Peta pemulihan otot:** tahu otot mana yang siap dilatih hari ini.
5. **Gym bareng teman:** peringkat, tantangan, kudos, dan chat dengan centang biru.
6. **Bahasa Indonesia** dan dibuat untuk orang Indonesia.
7. **Murah banget:** sekitar Rp15 ribu **sekali bayar seumur hidup**, bukan langganan bulanan.
8. **Tanpa download dari Play Store/App Store.** Ringan, langsung pasang dari browser.

---

## 7. Identitas brand
- **Nama:** GymTrack
- **Warna:** hitam pekat (#0B0C0F) dengan aksen **hijau lime neon (#C5F04A)**
- **Logo:** ikon barbel/dumbel hijau lime di latar hitam
- **Gaya huruf:** judul tebal, **HURUF KAPITAL**, condensed, sporty
- **Nada bicara:** santai, akrab, menyemangati, "kamu", tidak menggurui. Contoh copy di dalam app: "Mantap!", "Pertahankan!", "Coba dulu tanpa daftar".
- **Mode tampilan default:** gelap (dark mode)

---

## 8. Cara install (untuk call-to-action)
- **Android (Chrome):** buka link, ketuk **"Install"/"Tambahkan ke layar utama"**.
- **iPhone (Safari):** buka link, ketuk tombol **Share ⬆️**, pilih **"Add to Home Screen"/"Tambahkan ke Layar Utama"**.
- Notifikasi di iPhone butuh iOS 16.4+ dan app dibuka dari ikon layar utama.

---

## 9. Batasan & klaim yang TIDAK boleh dipakai
- ❌ Jangan bilang ada di **Play Store/App Store**. Ini web app yang dipasang dari browser.
- ❌ Jangan klaim **AI/kecerdasan buatan**. Asisten PT memakai aturan latihan yang terbukti (double progression), bukan AI.
- ❌ Jangan klaim akurasi medis. **Kalori** dan **pemulihan otot** adalah **perkiraan**.
- ❌ Jangan janji hasil tubuh tertentu ("turun 10 kg dalam sebulan", dll.).
- ❌ Jangan klaim ada video tutorial gerakan, scan makanan, database makanan, smartwatch, atau sinkron Google Fit/Apple Health. **Fitur ini belum ada.**
- ❌ Jangan sebut harga langganan bulanan. Premium **sekali bayar**.
- ✅ Boleh bilang: "gratis untuk mulai", "bisa offline", "Bahasa Indonesia", "sekali bayar".

---

## 10. Aset visual yang tersedia
Screenshot app ada di folder `docs/screenshots/`:
- 01 landing
- 02 onboarding
- 03 home
- 04 latihan aktif
- 05 ringkasan + PR
- 06 progres
- 07 tubuh
- 08 home setelah latihan

Saya juga bisa merekam layar app langsung untuk B-roll.

---

## 11. Yang saya minta darimu (Claude)
Setelah memahami brief ini, bantu saya membuat:
1. **5 ide hook** video pendek (3 detik pertama) dengan sudut berbeda: masalah sinyal, PT pribadi, peta otot, gym bareng teman, harga murah.
2. **Script video 30–45 detik** untuk Reels/TikTok, format: *Hook → Masalah → Solusi (demo fitur) → Bukti/benefit → CTA*. Sertakan **arahan visual per adegan** (apa yang direkam di layar HP / di gym) dan **teks overlay**.
3. **Caption Instagram/TikTok** + hashtag Indonesia yang relevan.
4. **Copy iklan singkat** (judul + 1–2 kalimat) untuk beberapa persona di bagian 3.
5. **Ide konten seri** (misalnya "1 fitur per hari" selama 7 hari).

Gunakan **Bahasa Indonesia gaul tapi jelas**. Kalau ada yang kurang jelas, tanya saya dulu sebelum menulis.
