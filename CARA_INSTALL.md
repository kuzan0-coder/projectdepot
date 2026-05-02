# Depot Epii — Cara Install & Menjalankan

## Prasyarat
- Node.js (https://nodejs.org) — sudah terinstall
- MySQL (XAMPP / WAMP / MySQL standalone)

## Langkah 1: Setup Database MySQL

1. Buka phpMyAdmin atau MySQL Workbench
2. Buka file `database/schema.sql` dan jalankan semua isinya
   (atau copy-paste ke query editor, lalu Execute)
3. Database `depot_epii` akan otomatis terbuat dengan 4 tabel

## Langkah 2: Konfigurasi Koneksi Database

Edit file `.env` sesuai MySQL Anda:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=        <-- isi password MySQL Anda (kosong jika tidak ada)
DB_NAME=depot_epii
PORT=3000
```

## Langkah 3: Jalankan Aplikasi

Buka Command Prompt / Terminal di folder `depot-epii`, lalu:

```
npm start
```

Aplikasi akan berjalan di: http://localhost:3000

## Catatan
- File CSV laporan tersimpan di folder `exports/`
- Data otomatis terpisah per tanggal
- Gunakan navigasi tanggal di bagian atas untuk berpindah hari
- Riwayat bisa dilihat di menu "Riwayat Harian"
- Export CSV tersedia di menu "Export Laporan"
