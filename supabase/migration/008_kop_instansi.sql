-- Migrasi 008: kop instansi induk pada kartu ID (contoh: PEMERINTAH KABUPATEN MADIUN).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor. Instalasi baru: sudah termasuk di schema.sql.
-- Opsional: tanpa migrasi ini aplikasi tetap berjalan, kartu hanya tidak menampilkan baris kop instansi.
alter table public.pengaturan
  add column if not exists instansi text default '';

-- Isi sekali di sini, atau nanti lewat Pengaturan > Umum > Instansi induk:
-- update public.pengaturan set instansi = 'PEMERINTAH KABUPATEN MADIUN' where id = 1;
