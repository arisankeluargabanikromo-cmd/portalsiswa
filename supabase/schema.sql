-- SekolahHub: skema database Supabase
-- Jalankan sekali di Supabase > SQL Editor > New query > Run.

-- ============ Profil & peran pengguna ============
-- Peran: pending (belum disetujui) | viewer (hanya melihat) | pengurus (mengelola data) | admin (penuh)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'pending' check (role in ('pending','viewer','pengurus','admin')),
  created_at timestamptz not null default now()
);

-- Akun pertama yang mendaftar otomatis menjadi admin, akun berikutnya berstatus pending.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

alter table public.profiles enable row level security;
create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');
create policy profiles_update on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ============ Tabel data ============
create table if not exists public.pengaturan (
  id int primary key default 1 check (id = 1),
  sekolah text not null default 'Nama Sekolah',
  tahun text default '',
  walikelas text default ''
);
insert into public.pengaturan (id) values (1) on conflict do nothing;

create table if not exists public.siswa (
  id text primary key,
  nama text not null,
  nis text not null unique,
  nisn text, kelas text not null, jk text, tl text, tgl date, agama text, gol text,
  alamat text, hp text, ayah text, ibu text, wali text, pkj text,
  hobi text, cita text, kes text, masuk date, bio text,
  foto text, cover text,
  created_at timestamptz not null default now()
);

create table if not exists public.tabungan (
  id text primary key,
  sid text not null references public.siswa(id) on delete cascade,
  tgl date not null,
  jenis text not null check (jenis in ('setor','tarik')),
  jml bigint not null check (jml > 0),
  cat text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists tabungan_sid_idx on public.tabungan (sid);
create index if not exists tabungan_tgl_idx on public.tabungan (tgl);

-- Penjaga di server: penarikan tidak boleh melebihi saldo, apa pun klien yang dipakai.
create or replace function public.guard_saldo() returns trigger language plpgsql as $$
declare s bigint;
begin
  if new.jenis = 'tarik' then
    select coalesce(sum(case when jenis = 'setor' then jml else -jml end), 0) into s
      from public.tabungan where sid = new.sid and id <> new.id;
    if s - new.jml < 0 then raise exception 'Saldo tidak cukup'; end if;
  end if;
  return new;
end $$;
drop trigger if exists tabungan_guard on public.tabungan;
create trigger tabungan_guard before insert or update on public.tabungan
  for each row execute function public.guard_saldo();

create table if not exists public.kas (
  id text primary key, tgl date not null,
  jenis text not null check (jenis in ('masuk','keluar')),
  jml bigint not null check (jml > 0), ket text,
  created_at timestamptz not null default now()
);
create table if not exists public.agenda (
  id text primary key, tgl date not null, judul text not null, ket text,
  created_at timestamptz not null default now()
);
create table if not exists public.pengumuman (
  id text primary key, tgl date not null, judul text not null, isi text,
  created_at timestamptz not null default now()
);
create table if not exists public.voting (
  id text primary key, judul text not null, open boolean not null default true,
  kand jsonb not null default '[]', suara jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists public.struktur (
  id text primary key, jab text not null,
  sid text not null references public.siswa(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.aktivitas (
  id text primary key, t bigint not null, m text not null,
  uid uuid default auth.uid()
);

-- ============ Row Level Security ============
-- Baca: viewer, pengurus, admin. Tulis: pengurus, admin. Pengaturan: tulis hanya admin.
do $$
declare t text;
begin
  foreach t in array array['siswa','tabungan','kas','agenda','pengumuman','voting','struktur'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.my_role() in (''viewer'',''pengurus'',''admin''))', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (public.my_role() in (''pengurus'',''admin'')) with check (public.my_role() in (''pengurus'',''admin''))', t);
  end loop;
end $$;

alter table public.pengaturan enable row level security;
create policy pengaturan_read  on public.pengaturan for select to authenticated
  using (public.my_role() in ('viewer','pengurus','admin'));
create policy pengaturan_write on public.pengaturan for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Jejak aktivitas: hanya bisa ditambah dan dibaca, tidak bisa diubah atau dihapus dari aplikasi.
alter table public.aktivitas enable row level security;
create policy aktivitas_read   on public.aktivitas for select to authenticated
  using (public.my_role() in ('viewer','pengurus','admin'));
create policy aktivitas_insert on public.aktivitas for insert to authenticated
  with check (public.my_role() in ('pengurus','admin'));

-- ============ Realtime ============
alter publication supabase_realtime add table
  public.siswa, public.tabungan, public.kas, public.agenda,
  public.pengumuman, public.voting, public.struktur, public.pengaturan;

-- ============ Tambahan v1.1 (absensi, iuran, target tabungan) ============
alter table public.siswa add column if not exists target bigint default 0;
alter table public.pengaturan add column if not exists iuran bigint default 0;

create table if not exists public.iuran (
  id text primary key,
  sid text not null references public.siswa(id) on delete cascade,
  bulan text not null check (bulan ~ '^\d{4}-\d{2}$'),
  jml bigint not null check (jml > 0),
  tgl date not null,
  cat text,
  created_at timestamptz not null default now()
);
create index if not exists iuran_sid_idx on public.iuran (sid);

create table if not exists public.absensi (
  id text primary key,              -- format: tanggal_idSiswa, satu baris per siswa per hari
  sid text not null references public.siswa(id) on delete cascade,
  tgl date not null,
  st text not null check (st in ('H','S','I','A')),
  created_at timestamptz not null default now()
);
create index if not exists absensi_tgl_idx on public.absensi (tgl);

do $$
declare t text;
begin
  foreach t in array array['iuran','absensi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s_read" on public.%1$I for select to authenticated using (public.my_role() in (''viewer'',''pengurus'',''admin''))', t);
    execute format('create policy "%1$s_write" on public.%1$I for all to authenticated using (public.my_role() in (''pengurus'',''admin'')) with check (public.my_role() in (''pengurus'',''admin''))', t);
  end loop;
end $$;

alter publication supabase_realtime add table public.iuran, public.absensi;

-- ============ Tambahan v1.2 (portal orang tua) ============
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

-- ============ Tambahan v1.3 (pengingat WhatsApp) ============
alter table public.pengaturan
  add column if not exists wa_tab text default '',
  add column if not exists wa_iuran text default '';

-- ============ Tambahan v1.4 (foto di Storage) ============
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
