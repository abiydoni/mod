# 🏨 MOD Schedule & WhatsApp Dispatcher Bot

Aplikasi Web & Otomasi Pengiriman Notifikasi Jadwal **Manager On Duty (MOD)** langsung ke Grup WhatsApp secara terjadwal berdasarkan data Google Spreadsheet.

---

## 🌟 Fitur Utama

1. **Pembuat & Pengelola Jadwal MOD Langsung dari Web (Schedule Builder)**:
   - Membuat jadwal baru untuk bulan apa saja (misal: `November 2026`, `Desember 2026`).
   - **Interactive Shift Toggler**: Cukup klik kotak tanggal pada nama petugas untuk mengubah shift (`Kosong` ➔ `MOD1` ➔ `MOD2` ➔ `MOD`).
   - **Smart Auto-Assign**: 1-Klik generate rotasi jadwal otomatis yang adil (weekend diisi MOD1 & MOD2, weekday diisi MOD).
   - **Kelola Petugas**: Tambah dan hapus petugas secara instan.
   - **Ekspor ke CSV**: Jadwal yang dibuat dapat diunduh dalam format CSV dan langsung dibuka di Excel atau disalin ke Google Sheets.
2. **Sinkronisasi Realtime Google Spreadsheet**:
   - Membaca live data sheet per bulan (seperti `October 2026`).
   - Otomatis memetakan nama petugas, jabatan, dan jadwal shift (`MOD1`, `MOD2`, `MOD`).
3. **Jadwal Pengiriman Otomatis (Cron Engine WIB)**:
   - **MOD 1 (Shift Pagi)** ➔ Otomatis dikirim pukul **09:00 WIB** (Masuk jam 09:00)
   - **MOD 2 (Shift Sore)** ➔ Otomatis dikirim pukul **16:00 WIB** (Masuk jam 16:00)
   - **MOD (Shift Sore / Weekday)** ➔ Otomatis dikirim pukul **18:00 WIB** (Masuk jam 18:00)
2. **Integrasi WhatsApp Gateway**:
   - Terintegrasi langsung dengan Appsbee WA Gateway API.
   - Mendukung format markdown WhatsApp (*bold*, _italic_, list nomor).
4. **Dashboard Web Interaktif**:
   - **Jadwal Hari Ini & Besok**: Kartu status shift per kategori dengan tombol kirim cepat.
   - **Simulasi Pesan WhatsApp**: Pratinjau realtime pesan sebelum terkirim.
   - **Kalender Matrix**: Tabel jadwal 1 bulan penuh per tanggal 1–31.
   - **Kirim Pesan Manual / Pengumuman**: Kirim broadcast kustom kapan saja ke grup.
   - **Pengaturan Lengkap**: Ubah Link Google Sheet, jam kirim, API Key, nomor grup, dan template pesan langsung dari browser.
   - **Riwayat Log**: Monitoring pengiriman sukses / gagal.

---

## 🚀 Cara Menjalankan

1. Masuk ke direktori `mod`:
   ```bash
   cd e:\GitHub\mod
   ```
2. Pastikan dependensi terpasang:
   ```bash
   npm install
   ```
3. Jalankan server:
   ```bash
   npm start
   ```
4. Buka di browser:
   👉 **`http://localhost:3000`**

---

## ⚙️ Pengaturan di Menu Settings
- **Link Google Sheets**: Masukkan URL / ID spreadsheet Anda (pastikan diset ke *"Anyone with the link can view"*).
- **Target WA Group**: Masukkan nomor ID WhatsApp Group (contoh: `120363398680818900@g.us`).
- **Jam Pengiriman**: Sesuaikan jam kirim pagi (09:00), sore 1 (16:00), atau sore 2 / weekday (18:00).
- **Template Pesan**: Sesuaikan kata-kata sambutan atau format teks sesuai kebutuhan operasional.
