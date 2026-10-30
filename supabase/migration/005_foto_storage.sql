-- Migrasi 005: foto siswa di Supabase Storage (bucket PRIVAT, akses lewat URL bertanda tangan).
-- Untuk database yang sudah berjalan: jalankan sekali setelah migrasi 003. Instalasi baru: sudah ada di akhir schema.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-siswa', 'foto-siswa', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

-- Folder pertama pada nama file = id siswa (contoh: abc123/foto-1700000000.jpg)
create policy foto_read on storage.objects for select to authenticated using (
  bucket_id = 'foto-siswa' and (
    public.my_role() in ('viewer','pengurus','admin')
    or (public.my_role() = 'ortu' and (storage.foldername(name))[1] in (select public.my_children()))));
create policy foto_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'foto-siswa' and public.my_role() in ('pengurus','admin'));
create policy foto_update on storage.objects for update to authenticated
  using (bucket_id = 'foto-siswa' and public.my_role() in ('pengurus','admin'));
create policy foto_delete on storage.objects for delete to authenticated
  using (bucket_id = 'foto-siswa' and public.my_role() in ('pengurus','admin'));
