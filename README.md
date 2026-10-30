# SekolahHub

Aplikasi grup sekolah dan tabungan siswa. Frontend statis (HTML, CSS, JS), database dan login di **Supabase**, kode di **GitHub**, hosting di **Vercel**.

## Struktur folder

```
sekolahhub/
├─ public/                 ← folder yang dipublikasikan
│  ├─ index.html
│  ├─ css/style.css        ← seluruh tampilan (dark + glassmorphism)
│  ├─ js/app.js            ← logika aplikasi (UI, tabungan, voting, laporan)
│  ├─ js/data.js           ← lapisan Supabase (login, sinkronisasi, realtime)
│  ├─ js/config.js         ← URL dan anon key Supabase
│  └─ vendor/supabase.js   ← supabase-js 2.45.4 (di-host sendiri)
├─ supabase/schema.sql     ← tabel, aturan keamanan (RLS), peran
├─ supabase/migrations/    ← migrasi untuk database yang sudah berjalan
├─ supabase/tests/         ← skrip uji keamanan (RLS)
├─ scripts/gen-config.js   ← menulis config.js dari environment variable
├─ vercel.json             ← build dan header keamanan
└─ package.json
```

## 1. Siapkan Supabase

1. Buat project baru di supabase.com.
2. Buka **SQL Editor → New query**, tempel isi `supabase/schema.sql`, lalu **Run**.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon public key**.
4. Buka **Authentication → Providers → Email** (aktif). Untuk sekolah, disarankan mengaktifkan konfirmasi email.

## 2. Jalankan di komputer sendiri

1. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `public/js/config.js`.
2. Jalankan `npx serve public`, lalu buka alamat yang tampil.
3. Daftar akun pertama. **Akun pertama otomatis menjadi admin.**

## 3. GitHub dan Vercel

1. Buat repository di GitHub, lalu push seluruh isi folder ini.
2. Di vercel.com pilih **Add New → Project**, impor repository tersebut.
3. Framework Preset: **Other**. Build dan output sudah diatur oleh `vercel.json`.
4. Tambahkan **Environment Variables**: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (lihat `.env.example`).
5. **Deploy**. Setelah dapat domain, tambahkan domain itu di Supabase pada **Authentication → URL Configuration → Site URL**.

## Fitur

- **Tabungan:** setoran, penarikan, setoran massal per kelas, buku tabungan, bukti setoran yang bisa dicetak, dan target tabungan per siswa.
- **Iuran:** tabel pembayaran iuran per siswa per bulan. Nominal iuran diatur di Pengaturan.
- **Absensi:** kehadiran harian per kelas (Hadir, Sakit, Izin, Alpa) dengan rekap bulanan dan ringkasan di profil siswa.
- **Kas kelas, agenda, pengumuman, voting, struktur kelas, laporan** (bisa dicetak atau diekspor CSV), dan **riwayat aktivitas**.
- **Profil siswa** bergaya media sosial dengan data lengkap, foto, dan sampul.
- **Pengingat WhatsApp:** daftar siswa yang belum menabung atau belum lunas iuran bulan ini, lengkap dengan tombol kirim yang membuka WhatsApp dengan pesan terisi. Isi pesan bisa diubah di Pengaturan. Bukti setoran juga bisa dikirim ke wali.
- **Ekspor CSV** untuk data siswa, transaksi, dan rekap tabungan.

## Portal orang tua

Orang tua mendaftar sendiri dari halaman login. Admin membuka menu **Pengguna**, mengubah peran akun itu menjadi `ortu`, lalu menekan **Atur** untuk menautkan satu atau lebih anak. Orang tua hanya melihat saldo, iuran, kehadiran, dan transaksi anaknya sendiri, ditambah pengumuman dan agenda. Pembatasan ini dijaga oleh Row Level Security di database, jadi orang tua tidak bisa membuka data siswa lain walau memakai alat selain aplikasi ini.

## Foto dan kinerja

Foto profil dan sampul disimpan di **Supabase Storage** (bucket privat `foto-siswa`, maksimal 1 MB per file, hanya JPEG). Di database hanya tersimpan nama file, jadi data siswa tetap ringan. Foto diakses lewat URL bertanda tangan yang berlaku 24 jam, dan orang tua hanya bisa membuka foto anaknya. Foto lama yang masih tersimpan langsung di database bisa dipindahkan lewat tombol di **Pengaturan**. Pembaruan realtime hanya memuat ulang tabel yang berubah.

## Uji keamanan

Setelah semua migrasi dijalankan, buka `supabase/tests/security_check.sql`, tempel di SQL Editor, lalu Run. Skrip membuat akun dan data uji sementara, memeriksa apakah orang tua, viewer, akun pending, dan pengunjung tanpa login hanya bisa mengakses yang seharusnya, lalu **membatalkan semuanya**. Hasilnya tampil sebagai pesan error berjudul `HASIL UJI KEAMANAN`. Error itu disengaja. Setiap baris harus bertuliskan `LULUS`. Jalankan ulang setiap kali aturan akses diubah.

## Upgrade dari versi sebelumnya

Jika database sudah dibuat dengan `schema.sql` versi awal, jalankan migrasi yang belum pernah dijalankan, berurutan, di SQL Editor: `002_absensi_iuran.sql` (versi 1.1) lalu `003_portal_ortu.sql` (versi 1.2), `004_pengingat_wa.sql` (versi 1.3), dan `005_foto_storage.sql` (versi 1.4). Instalasi baru cukup menjalankan `schema.sql`.

## Peran pengguna

| Peran | Akses |
|---|---|
| pending | Akun baru, belum bisa membuka data |
| viewer | Hanya melihat |
| pengurus | Mengelola siswa, tabungan, kas, agenda, pengumuman, voting, struktur |
| ortu | Orang tua: hanya data anak yang ditautkan, plus pengumuman dan agenda |
| admin | Semua, termasuk pengaturan sekolah dan menu **Pengguna** untuk menyetujui akun |

Akun baru berstatus pending. Admin menyetujuinya lewat menu **Pengguna**.

## Catatan keamanan

- Anon key memang publik. Data dilindungi oleh Row Level Security di `schema.sql`, jadi jangan menonaktifkannya.
- Jangan pernah memasukkan `service_role` key ke frontend atau repository.
- Penarikan melebihi saldo ditolak oleh database (trigger `guard_saldo`), bukan hanya oleh tampilan.
- `vercel.json` memakai `'unsafe-inline'` pada script karena antarmuka memakai atribut `onclick`.
- Voting: suara disimpan dalam satu baris, jadi dua orang yang memilih pada detik yang sama bisa saling menimpa.
