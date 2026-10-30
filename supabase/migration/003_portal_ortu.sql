-- Migrasi 003: portal orang tua (peran 'ortu' + tautan ke siswa).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor.
-- (Instalasi baru tidak perlu: blok ini sudah termasuk di akhir schema.sql.)

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('pending','viewer','pengurus','ortu','admin'));

create table if not exists public.wali_siswa (
  uid uuid not null references auth.users(id) on delete cascade,
  sid text not null references public.siswa(id) on delete cascade,
  primary key (uid, sid)
);
alter table public.wali_siswa enable row level security;
create policy wali_read  on public.wali_siswa for select to authenticated
  using (uid = auth.uid() or public.my_role() = 'admin');
create policy wali_write on public.wali_siswa for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create or replace function public.my_children() returns setof text
language sql stable security definer set search_path = public as
$$ select sid from public.wali_siswa where uid = auth.uid() $$;

-- Orang tua hanya boleh MEMBACA data anaknya sendiri.
create policy siswa_ortu   on public.siswa   for select to authenticated
  using (public.my_role() = 'ortu' and id  in (select public.my_children()));
create policy tabungan_ortu on public.tabungan for select to authenticated
  using (public.my_role() = 'ortu' and sid in (select public.my_children()));
create policy iuran_ortu   on public.iuran   for select to authenticated
  using (public.my_role() = 'ortu' and sid in (select public.my_children()));
create policy absensi_ortu on public.absensi for select to authenticated
  using (public.my_role() = 'ortu' and sid in (select public.my_children()));

-- Informasi umum kelas.
create policy pengumuman_ortu on public.pengumuman for select to authenticated using (public.my_role() = 'ortu');
create policy agenda_ortu     on public.agenda     for select to authenticated using (public.my_role() = 'ortu');
create policy pengaturan_ortu on public.pengaturan for select to authenticated using (public.my_role() = 'ortu');
