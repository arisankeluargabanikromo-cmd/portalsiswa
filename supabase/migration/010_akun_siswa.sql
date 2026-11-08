-- Migrasi 010: akun siswa (peran 'siswa'), klaim pendaftaran, dan persetujuan akun terpandu.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 003 dan 005.
-- Instalasi baru: sudah termasuk di akhir schema.sql.

-- ---------- Peran 'siswa' ----------
-- siswa: akun milik satu siswa, hanya-baca, hanya melihat data siswa itu sendiri (tabungan, iuran, absensi, profil)
-- ditambah pengumuman dan agenda. Dibangun di atas tabel tautan wali_siswa yang sama dengan portal orang tua.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('pending','viewer','pengurus','ortu','siswa','admin'));

-- Klaim saat mendaftar: HANYA saran untuk admin (diisi pengguna sendiri, tidak pernah memberi akses).
alter table public.profiles
  add column if not exists klaim_jenis text check (klaim_jenis in ('siswa','ortu','staf')),
  add column if not exists klaim_nis text,
  add column if not exists disetujui_oleh uuid references auth.users(id) on delete set null,
  add column if not exists disetujui_pada timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  j text := m->>'klaim_jenis';
  n text := nullif(left(btrim(coalesce(m->>'klaim_nis', '')), 40), '');
begin
  if j is null or j not in ('siswa','ortu','staf') then j := null; end if;
  insert into public.profiles (id, email, role, klaim_jenis, klaim_nis)
  values (new.id, new.email,
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end, j, n);
  return new;
end $$;

-- ---------- Tautan akun -> siswa: aturan satu-ke-satu untuk akun siswa ----------
alter table public.wali_siswa add column if not exists peran text check (peran in ('ortu','siswa'));
update public.wali_siswa w set peran = case when p.role = 'siswa' then 'siswa' else 'ortu' end
  from public.profiles p where p.id = w.uid and w.peran is null;
update public.wali_siswa set peran = 'ortu' where peran is null;
create unique index if not exists wali_siswa_satu_akun  on public.wali_siswa (sid) where peran = 'siswa';
create unique index if not exists wali_siswa_satu_siswa on public.wali_siswa (uid) where peran = 'siswa';

create or replace function public.wali_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role into r from public.profiles where id = new.uid;
  if r is null or r not in ('ortu','siswa') then
    raise exception 'Hanya akun berperan orang tua atau siswa yang dapat ditautkan ke data siswa';
  end if;
  new.peran := r;
  if r = 'siswa' then
    if exists (select 1 from public.wali_siswa where uid = new.uid and sid <> new.sid) then
      raise exception 'Akun siswa hanya boleh tertaut ke satu siswa';
    end if;
    if exists (select 1 from public.wali_siswa where sid = new.sid and uid <> new.uid and peran = 'siswa') then
      raise exception 'Siswa ini sudah memiliki akun siswa lain';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists wali_before_trg on public.wali_siswa;
create trigger wali_before_trg before insert or update on public.wali_siswa
  for each row execute function public.wali_before();

-- Ganti peran lewat jalur apa pun: tautan menyesuaikan; peran non-portal otomatis kehilangan tautan (akses dicabut).
create or replace function public.profiles_role_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if new.role in ('ortu','siswa') then
      if new.role = 'siswa' and (select count(*) from public.wali_siswa where uid = new.id) > 1 then
        raise exception 'Akun siswa hanya boleh tertaut ke satu siswa. Lepas tautan lain terlebih dahulu';
      end if;
      update public.wali_siswa set peran = new.role where uid = new.id;
    else
      delete from public.wali_siswa where uid = new.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists profiles_role_after_trg on public.profiles;
create trigger profiles_role_after_trg after update of role on public.profiles
  for each row execute function public.profiles_role_after();

-- ---------- Persetujuan akun terpandu (satu transaksi, hanya admin) ----------
create or replace function public.approve_account(p_uid uuid, p_role text, p_sids text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare s text; n int;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Hanya admin yang dapat mengatur akun'; end if;
  if p_uid = auth.uid() then raise exception 'Peran akun sendiri tidak dapat diubah'; end if;
  if p_role is null or p_role not in ('pending','viewer','pengurus','ortu','siswa','admin') then raise exception 'Peran tidak dikenal'; end if;
  if not exists (select 1 from public.profiles where id = p_uid) then raise exception 'Akun tidak ditemukan'; end if;
  p_sids := coalesce(p_sids, '{}');
  select count(distinct x) into n from unnest(p_sids) x;
  if p_role = 'siswa' and n <> 1 then raise exception 'Akun siswa harus tertaut ke tepat satu siswa'; end if;
  if p_role = 'ortu' and n < 1 then raise exception 'Akun orang tua harus tertaut ke minimal satu siswa'; end if;
  if p_role in ('ortu','siswa') then
    foreach s in array p_sids loop
      if not exists (select 1 from public.siswa where id = s) then raise exception 'Data siswa tidak ditemukan'; end if;
    end loop;
  end if;
  delete from public.wali_siswa where uid = p_uid;
  update public.profiles set role = p_role,
    disetujui_oleh = case when p_role = 'pending' then null else auth.uid() end,
    disetujui_pada = case when p_role = 'pending' then null else now() end
    where id = p_uid;
  if p_role in ('ortu','siswa') then
    insert into public.wali_siswa (uid, sid) select p_uid, x from (select distinct unnest(p_sids) as x) t;
  end if;
end $$;
revoke all on function public.approve_account(uuid, text, text[]) from public, anon;
grant execute on function public.approve_account(uuid, text, text[]) to authenticated;

-- ---------- Akses baca: peran portal (ortu dan siswa) hanya untuk siswa yang tertaut ----------
drop policy if exists siswa_ortu on public.siswa;
create policy siswa_ortu on public.siswa for select to authenticated
  using (public.my_role() in ('ortu','siswa') and id in (select public.my_children()));
drop policy if exists tabungan_ortu on public.tabungan;
create policy tabungan_ortu on public.tabungan for select to authenticated
  using (public.my_role() in ('ortu','siswa') and sid in (select public.my_children()));
drop policy if exists iuran_ortu on public.iuran;
create policy iuran_ortu on public.iuran for select to authenticated
  using (public.my_role() in ('ortu','siswa') and sid in (select public.my_children()));
drop policy if exists absensi_ortu on public.absensi;
create policy absensi_ortu on public.absensi for select to authenticated
  using (public.my_role() in ('ortu','siswa') and sid in (select public.my_children()));
drop policy if exists pengumuman_ortu on public.pengumuman;
create policy pengumuman_ortu on public.pengumuman for select to authenticated using (public.my_role() in ('ortu','siswa'));
drop policy if exists agenda_ortu on public.agenda;
create policy agenda_ortu on public.agenda for select to authenticated using (public.my_role() in ('ortu','siswa'));
drop policy if exists pengaturan_ortu on public.pengaturan;
create policy pengaturan_ortu on public.pengaturan for select to authenticated using (public.my_role() in ('ortu','siswa'));
drop policy if exists foto_read on storage.objects;
create policy foto_read on storage.objects for select to authenticated using (
  bucket_id = 'foto-siswa' and (
    public.my_role() in ('viewer','pengurus','admin')
    or (public.my_role() in ('ortu','siswa') and (storage.foldername(name))[1] in (select public.my_children()))));
