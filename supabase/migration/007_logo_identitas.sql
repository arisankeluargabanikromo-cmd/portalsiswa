-- Migrasi 007: logo sekolah + identitas tambahan (kepala sekolah, alamat, telepon).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor. Instalasi baru: sudah termasuk di schema.sql.
-- Opsional: tanpa migrasi ini aplikasi tetap berjalan, hanya kolom/fitur logo yang dinonaktifkan.
-- Logo & identitas tambahan sekolah.
alter table public.pengaturan
  add column if not exists logo text default '',
  add column if not exists kepsek text default '',
  add column if not exists alamat text default '',
  add column if not exists telp text default '';

-- Bucket logo bersifat PUBLIK (logo bukan data sensitif; perlu tampil di layar masuk sebelum login).
-- Hanya admin yang boleh mengunggah, mengganti, atau menghapus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logo-sekolah', 'logo-sekolah', true, 524288, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 524288,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists logo_insert on storage.objects;
drop policy if exists logo_update on storage.objects;
drop policy if exists logo_delete on storage.objects;
create policy logo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'logo-sekolah' and public.my_role() = 'admin');
create policy logo_update on storage.objects for update to authenticated
  using (bucket_id = 'logo-sekolah' and public.my_role() = 'admin');
create policy logo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'logo-sekolah' and public.my_role() = 'admin');
