-- Migrasi 004: templat pesan pengingat WhatsApp (opsional, disimpan di pengaturan sekolah).
-- Untuk database yang sudah berjalan: jalankan sekali. Instalasi baru: sudah termasuk di akhir schema.sql.
alter table public.pengaturan
  add column if not exists wa_tab text default '',
  add column if not exists wa_iuran text default '';
