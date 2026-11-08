-- Migrasi 009: NIP kepala sekolah untuk blok tanda tangan di sisi belakang kartu ID.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor. Instalasi baru: sudah termasuk di schema.sql.
-- Opsional: tanpa migrasi ini aplikasi tetap berjalan, tanda tangan hanya menampilkan nama tanpa NIP.
alter table public.pengaturan
  add column if not exists kepsek_nip text default '';

-- Isi sekali di sini, atau nanti lewat Pengaturan > Umum > NIP kepala sekolah:
-- update public.pengaturan set kepsek_nip = '196501011990031001' where id = 1;
