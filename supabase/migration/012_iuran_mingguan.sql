-- Migrasi 012: iuran mingguan.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor. Instalasi baru: sudah termasuk di akhir schema.sql. Aman dijalankan ulang.
--
-- Kolom baru public.iuran.minggu = tanggal SENIN pada minggu yang dibayar (Senin sampai Minggu).
--   Pembayaran mingguan : minggu terisi; kolom bulan = bulan dari hari Senin itu (laporan bulanan/tahunan tetap benar).
--   Pembayaran lama     : minggu kosong (iuran bulanan sebelumnya). Tetap tersimpan, tetap dihitung di total tahunan, tidak diubah.
-- Setiap pembayaran mingguan otomatis tercatat sebagai pemasukan di tabel kas dengan id 'iu_' + id iuran (dibuat oleh aplikasi, tanpa kolom baru).
-- Kebijakan RLS tidak berubah: siswa/orang tua tetap hanya melihat iuran miliknya.

alter table public.iuran add column if not exists minggu date;
create index if not exists iuran_sid_minggu_idx on public.iuran (sid, minggu);
