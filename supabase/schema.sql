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

-- ============ Preferensi tampilan (migrasi 006) ============
-- Preferensi tampilan per akun (tema terang/gelap/ikuti perangkat).
-- Tabel TERPISAH dari profiles dengan sengaja: profiles_update hanya untuk admin; membuka update pada
-- profiles agar pengguna bisa menyimpan tema akan memungkinkan mereka mengubah perannya sendiri.
create table if not exists public.preferensi (
  uid uuid primary key references auth.users(id) on delete cascade,
  tema text not null default 'system' check (tema in ('system','light','dark')),
  updated_at timestamptz not null default now()
);
alter table public.preferensi enable row level security;
drop policy if exists preferensi_own on public.preferensi;
create policy preferensi_own on public.preferensi for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ============ Logo & identitas sekolah (migrasi 007) ============
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

-- ============ Kop instansi pada kartu ID (migrasi 008) ============
alter table public.pengaturan
  add column if not exists instansi text default '';

-- ============ NIP kepala sekolah pada kartu ID (migrasi 009) ============
alter table public.pengaturan
  add column if not exists kepsek_nip text default '';

-- ============ Akun siswa & persetujuan terpandu (migrasi 010) ============
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

-- ---------- Migrasi 011: akses menu keuangan dan kelas untuk akun Siswa (hanya-baca) ----------
--
-- Yang dibuka untuk peran 'siswa' (semuanya SELECT saja, tidak ada tulis):
--   kas       : seluruh catatan kas kelas (transparansi iuran dan pengeluaran kelas)
--   struktur  : seluruh jabatan pengurus kelas
--   voting    : seluruh pemilihan beserta hasilnya
--   rekan_kelas(): nama (bukan data lain) siswa sekelas, hanya untuk menampilkan nama pengurus dan kandidat
-- Yang TETAP tertutup: data pribadi, tabungan, iuran, dan absensi siswa lain; aktivitas; profil akun.

drop policy if exists kas_siswa on public.kas;
create policy kas_siswa on public.kas for select to authenticated
  using (public.my_role() = 'siswa');

drop policy if exists struktur_siswa on public.struktur;
create policy struktur_siswa on public.struktur for select to authenticated
  using (public.my_role() = 'siswa');

drop policy if exists voting_siswa on public.voting;
create policy voting_siswa on public.voting for select to authenticated
  using (public.my_role() = 'siswa');

-- Nama siswa yang sekelas dengan siswa tertaut. Hanya id, nama, kelas; tidak ada NIS, kontak, atau data lain.
create or replace function public.rekan_kelas()
returns table (id text, nama text, kelas text)
language sql stable security definer set search_path = public as $$
  select s.id, s.nama, s.kelas
  from public.siswa s
  where public.my_role() = 'siswa'
    and s.kelas in (select k.kelas from public.siswa k where k.id in (select public.my_children()))
  order by s.nama
$$;
revoke all on function public.rekan_kelas() from public, anon;
grant execute on function public.rekan_kelas() to authenticated;

-- ---------- Migrasi 012: iuran mingguan ----------
alter table public.iuran add column if not exists minggu date;
create index if not exists iuran_sid_minggu_idx on public.iuran (sid, minggu);


-- ============================================================
-- ---------- Migrasi 013: standar perbankan untuk menu Keuangan ----------
-- Migrasi 013: standar perbankan untuk menu Keuangan (Tabungan, Iuran, Kas Kelas).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 012. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang.
--
-- Prinsip yang ditegakkan DI DATABASE (bukan hanya di tampilan):
--   1. Buku besar permanen    : transaksi tabungan, pembayaran iuran, dan catatan kas manual tidak bisa diubah atau dihapus
--                               dari aplikasi. Kesalahan dikoreksi dengan PEMBATALAN (reversal): baris lawan bernilai negatif
--                               yang menunjuk transaksi asal lewat kolom rev_of. Satu transaksi hanya bisa dibatalkan satu kali.
--   2. Nomor referensi unik   : setiap transaksi punya ref (TRX/IUR/KAS + yymmdd + 8 karakter acak), waktu pembukuan dari server,
--                               dan petugas (email disamarkan). Diisi server bila klien tidak mengirim.
--   3. Tutup buku             : pengaturan.tutup_buku. Transaksi bertanggal <= tutup buku ditolak untuk semua peran.
--                               Koreksi atas periode tertutup dibukukan sebagai pembatalan bertanggal hari ini.
--   4. Saldo mengendap        : pengaturan.saldo_min. Penarikan tidak boleh menyisakan saldo di bawah nilai ini
--                               (kecuali layanan 'Tutup rekening' yang menarik seluruh saldo).
--   5. Kas tidak boleh minus  : pengeluaran kas dan pembatalan pemasukan ditolak bila membuat saldo kas negatif.
--   6. Pembatalan lintas hari : hanya admin. Pengurus hanya boleh membatalkan transaksi yang dibukukan hari yang sama.
--   7. Hapus/ubah             : UPDATE ditolak untuk semua. DELETE hanya admin (untuk reset, pemulihan, urungkan impor)
--                               atau lewat cascade penghapusan siswa. Baris kas 'iu_*' adalah turunan iuran dan tetap
--                               disinkronkan otomatis oleh aplikasi.

-- ---------- Kolom ----------
alter table public.tabungan
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text;
alter table public.iuran
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text,
  add column if not exists created_by uuid default auth.uid();
alter table public.kas
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text,
  add column if not exists kat text default '', add column if not exists created_by uuid default auth.uid();
alter table public.pengaturan
  add column if not exists tutup_buku date,
  add column if not exists saldo_min bigint default 0,
  add column if not exists limit_otor bigint default 0;

-- ---------- Isi data lama (sebelum trigger dipasang) ----------
update public.tabungan set ref = 'TRX' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;
update public.iuran    set ref = 'IUR' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;
update public.kas k set ref = i.ref, kat = 'Iuran', waktu = coalesce(k.created_at, k.tgl::timestamptz)
  from public.iuran i where k.ref is null and k.id = 'iu_' || i.id;
update public.kas set ref = 'KAS' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;

-- ---------- Batasan ----------
alter table public.tabungan drop constraint if exists tabungan_jml_check;
alter table public.tabungan add constraint tabungan_jml_check check (jml <> 0);
alter table public.iuran drop constraint if exists iuran_jml_check;
alter table public.iuran add constraint iuran_jml_check check (jml <> 0);
alter table public.kas drop constraint if exists kas_jml_check;
alter table public.kas add constraint kas_jml_check check (jml <> 0);
alter table public.pengaturan drop constraint if exists pengaturan_bank_check;
alter table public.pengaturan add constraint pengaturan_bank_check check (coalesce(saldo_min, 0) >= 0 and coalesce(limit_otor, 0) >= 0);

create unique index if not exists tabungan_ref_uq on public.tabungan (ref) where ref is not null;
create unique index if not exists tabungan_rev_uq on public.tabungan (rev_of) where rev_of is not null;
create unique index if not exists iuran_ref_uq on public.iuran (ref) where ref is not null;
create unique index if not exists iuran_rev_uq on public.iuran (rev_of) where rev_of is not null;
create unique index if not exists kas_ref_uq on public.kas (ref) where ref is not null;
create unique index if not exists kas_rev_uq on public.kas (rev_of) where rev_of is not null;

-- ---------- Fungsi bantu ----------
create or replace function public.ledger_ref(p text, d date) returns text language sql volatile as
$$ select p || to_char(d, 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) $$;

-- Email petugas disamarkan agar tidak terbaca akun siswa/orang tua yang boleh melihat barisnya.
create or replace function public.petugas_label() returns text
language sql stable security definer set search_path = public as
$$ select left(split_part(email, '@', 1), 2) || '***@' || split_part(email, '@', 2) from public.profiles where id = auth.uid() $$;

-- Tanggal transaksi: tidak boleh melewati tutup buku, tidak boleh di masa depan (toleransi 1 hari untuk zona WITA/WIT).
-- Konteks sistem (SQL Editor, service role: auth.uid() kosong) dilewati.
create or replace function public.ledger_open(d date) returns void
language plpgsql stable security definer set search_path = public as $$
declare tb date;
begin
  if auth.uid() is null then return; end if;
  if d > (now() at time zone 'Asia/Jakarta')::date + 1 then raise exception 'Tanggal transaksi tidak boleh di masa depan'; end if;
  select tutup_buku into tb from public.pengaturan where id = 1;
  if tb is not null and d <= tb then
    raise exception 'Periode sampai % sudah ditutup (tutup buku). Transaksi harus bertanggal setelahnya.', to_char(tb, 'DD-MM-YYYY');
  end if;
end $$;

-- ---------- Tabungan ----------
create or replace function public.ledger_tab() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.tabungan%rowtype; sal bigint; mn bigint := 0;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Buku tabungan bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Transaksi tabungan tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  perform pg_advisory_xact_lock(hashtext('tab:' || new.sid));
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('TRX', new.tgl));
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  else
    select * into o from public.tabungan where id = new.rev_of;
    if not found then raise exception 'Transaksi asal pembatalan tidak ditemukan'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.sid <> new.sid or o.jenis <> new.jenis or new.jml <> -o.jml then raise exception 'Data pembatalan tidak cocok dengan transaksi asal'; end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan transaksi lintas hari hanya dapat dilakukan admin';
    end if;
  end if;
  select coalesce(sum(case when jenis = 'setor' then jml else -jml end), 0) into sal from public.tabungan where sid = new.sid;
  if new.jenis = 'tarik' and new.rev_of is null then
    if coalesce(new.kanal, '') <> 'Tutup rekening' then select coalesce(saldo_min, 0) into mn from public.pengaturan where id = 1; end if;
    if sal - new.jml < mn then
      raise exception '%', case when mn > 0 then 'Saldo tidak cukup. Saldo mengendap minimal Rp ' || mn else 'Saldo tidak cukup' end;
    end if;
  elsif new.jenis = 'setor' and new.rev_of is not null and sal + new.jml < 0 then
    raise exception 'Saldo tidak cukup untuk membatalkan setoran ini (dana sudah ditarik)';
  end if;
  return new;
end $$;
drop trigger if exists tabungan_ledger on public.tabungan;
create trigger tabungan_ledger before insert or update or delete on public.tabungan
  for each row execute function public.ledger_tab();

-- ---------- Iuran ----------
create or replace function public.ledger_iuran() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.iuran%rowtype; ks bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Catatan iuran bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Pembayaran iuran tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('IUR', new.tgl));
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  else
    select * into o from public.iuran where id = new.rev_of;
    if not found then raise exception 'Pembayaran asal pembatalan tidak ditemukan'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.sid <> new.sid or o.bulan <> new.bulan or o.minggu is distinct from new.minggu or new.jml <> -o.jml then
      raise exception 'Data pembatalan tidak cocok dengan pembayaran asal';
    end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan pembayaran lintas hari hanya dapat dilakukan admin';
    end if;
    if o.minggu is not null then   -- pembayaran mingguan masuk ke Kas Kelas; dananya harus masih ada
      select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) into ks from public.kas;
      if ks + new.jml < 0 then raise exception 'Saldo Kas Kelas tidak cukup untuk membatalkan pembayaran ini (dana sudah dipakai)'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists iuran_ledger on public.iuran;
create trigger iuran_ledger before insert or update or delete on public.iuran
  for each row execute function public.ledger_iuran();

-- ---------- Kas kelas ----------
create or replace function public.ledger_kas() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.kas%rowtype; sal bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    if old.id like 'iu\_%' then return new; end if;   -- turunan iuran: disinkronkan aplikasi
    raise exception 'Catatan kas bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if old.id like 'iu\_%' or sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Catatan kas tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  new.waktu := coalesce(new.waktu, now());
  if new.id like 'iu\_%' then
    new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('IUR', new.tgl));
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('kas'));
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('KAS', new.tgl));
  select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) into sal from public.kas;
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
    if new.jenis = 'keluar' and sal - new.jml < 0 then raise exception 'Saldo kas tidak cukup. Saldo kas saat ini Rp %', sal; end if;
  else
    select * into o from public.kas where id = new.rev_of;
    if not found then raise exception 'Catatan kas asal pembatalan tidak ditemukan'; end if;
    if o.id like 'iu\_%' then raise exception 'Catatan ini berasal dari Iuran. Batalkan pembayarannya di menu Iuran'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.jenis <> new.jenis or new.jml <> -o.jml then raise exception 'Data pembatalan tidak cocok dengan catatan asal'; end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan catatan kas lintas hari hanya dapat dilakukan admin';
    end if;
    if new.jenis = 'masuk' and sal + new.jml < 0 then raise exception 'Saldo kas tidak cukup untuk membatalkan pemasukan ini (dana sudah dipakai)'; end if;
  end if;
  return new;
end $$;
drop trigger if exists kas_ledger on public.kas;
create trigger kas_ledger before insert or update or delete on public.kas
  for each row execute function public.ledger_kas();

-- ---------- Pengaturan: tutup buku ----------
create or replace function public.pengaturan_bank_guard() returns trigger language plpgsql as $$
begin
  if new.tutup_buku is not null and new.tutup_buku > (now() at time zone 'Asia/Jakarta')::date + 1 then
    raise exception 'Tanggal tutup buku tidak boleh di masa depan';
  end if;
  return new;
end $$;
drop trigger if exists pengaturan_bank_trg on public.pengaturan;
create trigger pengaturan_bank_trg before insert or update on public.pengaturan
  for each row execute function public.pengaturan_bank_guard();

-- ============ Nama aplikasi & merek publik layar masuk (migrasi 014) ============
alter table public.pengaturan
  add column if not exists app_nama text default 'SekolahHub';

-- Layar masuk perlu menampilkan logo dan kop sekolah SEBELUM pengguna login, termasuk di perangkat yang baru dipakai.
-- Fungsi ini hanya mengembalikan 6 data non-sensitif (nama aplikasi, nama sekolah, path logo, instansi, alamat, telepon).
-- Logo sendiri sudah berada di bucket publik. Data siswa dan keuangan TIDAK ikut terbuka.
-- Dibaca lewat to_jsonb agar tetap berjalan walau migrasi 007/008 belum dijalankan (kolom yang tidak ada menjadi null).
create or replace function public.brand_publik()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'app_nama', nullif(j->>'app_nama', ''),
    'sekolah',  j->>'sekolah',
    'logo',     coalesce(j->>'logo', ''),
    'instansi', coalesce(j->>'instansi', ''),
    'alamat',   coalesce(j->>'alamat', ''),
    'telp',     coalesce(j->>'telp', ''))
  from (select to_jsonb(p) as j from public.pengaturan p where p.id = 1) x
$$;
revoke all on function public.brand_publik() from public;
grant execute on function public.brand_publik() to anon, authenticated;

-- Ubah nama sekali di sini, atau nanti lewat Pengaturan > Umum > Nama aplikasi:
-- update public.pengaturan set app_nama = 'Portal SDN 1 Contoh' where id = 1;

-- ============ Voting berdasarkan akun login (migrasi 015) ============
-- ---------- Penjaga kolom suara ----------
create or replace function public.voting_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('sh.vote_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' then new.suara := '{}'::jsonb; else new.suara := old.suara; end if;
  end if;
  return new;
end $$;
drop trigger if exists voting_guard_trg on public.voting;
create trigger voting_guard_trg before insert or update on public.voting
  for each row execute function public.voting_guard();

-- ---------- Beri suara (akun Siswa yang sedang login) ----------
create or replace function public.beri_suara(p_id text, p_kand text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.voting; sid text; kls text;
begin
  if auth.uid() is null or public.my_role() is distinct from 'siswa' then
    raise exception 'Hanya akun Siswa yang dapat memberi suara.' using errcode = '42501';
  end if;
  select m into sid from public.my_children() as m limit 1;
  if sid is null then
    raise exception 'Akun Anda belum ditautkan ke data siswa. Hubungi admin sekolah.' using errcode = '42501';
  end if;
  select * into v from public.voting where id = p_id for update;   -- kunci baris: dua suara bersamaan tidak saling menimpa
  if not found then raise exception 'Pemilihan tidak ditemukan.'; end if;
  if not v.open then raise exception 'Pemilihan ini sudah ditutup.'; end if;
  if jsonb_typeof(v.kand) <> 'array' or not (v.kand ? p_kand) then
    raise exception 'Pilihan bukan kandidat dalam pemilihan ini.';
  end if;
  select kelas into kls from public.siswa where id = sid;
  if not exists (select 1 from public.siswa k where k.kelas = kls and k.id in (select jsonb_array_elements_text(v.kand))) then
    raise exception 'Pemilihan ini bukan untuk kelas Anda.' using errcode = '42501';
  end if;
  if v.suara ? sid then
    raise exception 'Anda sudah memberikan suara. Suara tidak dapat diubah.';
  end if;
  perform set_config('sh.vote_rpc', 'on', true);
  update public.voting set suara = suara || jsonb_build_object(sid, p_kand) where id = p_id;
  perform set_config('sh.vote_rpc', 'off', true);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.beri_suara(text, text) from public, anon;
grant execute on function public.beri_suara(text, text) to authenticated;

-- ---------- Rekap untuk akun Siswa (tanpa daftar siapa memilih siapa) ----------
create or replace function public.voting_siswa() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid text; kls text; r jsonb;
begin
  if public.my_role() is distinct from 'siswa' then return '[]'::jsonb; end if;
  select m into sid from public.my_children() as m limit 1;
  if sid is null then return '[]'::jsonb; end if;
  select kelas into kls from public.siswa where id = sid;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'judul', v.judul, 'open', v.open, 'kand', v.kand,
      'hitung', coalesce((select jsonb_object_agg(t.k, t.n) from (select e.value as k, count(*) as n from jsonb_each_text(v.suara) e group by e.value) t), '{}'::jsonb),
      'total', (select count(*) from jsonb_object_keys(v.suara)),
      'saya', v.suara ->> sid) order by v.created_at), '[]'::jsonb)
    into r
    from public.voting v
   where jsonb_typeof(v.kand) = 'array'
     and exists (select 1 from public.siswa k where k.kelas = kls and k.id in (select jsonb_array_elements_text(v.kand)));
  return r;
end $$;
revoke all on function public.voting_siswa() from public, anon;
grant execute on function public.voting_siswa() to authenticated;

-- Siswa tidak lagi membaca tabel voting langsung (rahasia suara). Admin, pengurus, dan viewer tidak berubah.
drop policy if exists voting_siswa on public.voting;

-- ============================================================
-- ---------- Migrasi 016: penjaga baris kas turunan iuran ----------
create or replace function public.ledger_kas() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.kas%rowtype; i public.iuran%rowtype; sal bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    if old.id like 'iu\_%' then
      if new.id <> old.id then raise exception 'ID catatan kas turunan iuran tidak boleh diubah'; end if;
      if not sys then
        select * into i from public.iuran where id = substr(new.id, 4);
        if not found or i.minggu is null or new.jenis <> 'masuk' or new.jml <> i.jml then
          raise exception 'Catatan kas turunan iuran harus cocok dengan pembayaran iuran mingguan asalnya';
        end if;
      end if;
      return new;   -- turunan iuran: disinkronkan aplikasi
    end if;
    raise exception 'Catatan kas bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if old.id like 'iu\_%' or sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Catatan kas tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  new.waktu := coalesce(new.waktu, now());
  if new.id like 'iu\_%' then
    if not sys then
      select * into i from public.iuran where id = substr(new.id, 4);
      if not found or i.minggu is null or new.jenis <> 'masuk' or new.jml <> i.jml then
        raise exception 'Catatan kas turunan iuran harus cocok dengan pembayaran iuran mingguan asalnya';
      end if;
    end if;
    new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('IUR', new.tgl));
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('kas'));
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('KAS', new.tgl));
  select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) into sal from public.kas;
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
    if new.jenis = 'keluar' and sal - new.jml < 0 then raise exception 'Saldo kas tidak cukup. Saldo kas saat ini Rp %', sal; end if;
  else
    select * into o from public.kas where id = new.rev_of;
    if not found then raise exception 'Catatan kas asal pembatalan tidak ditemukan'; end if;
    if o.id like 'iu\_%' then raise exception 'Catatan ini berasal dari Iuran. Batalkan pembayarannya di menu Iuran'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.jenis <> new.jenis or new.jml <> -o.jml then raise exception 'Data pembatalan tidak cocok dengan catatan asal'; end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan catatan kas lintas hari hanya dapat dilakukan admin';
    end if;
    if new.jenis = 'masuk' and sal + new.jml < 0 then raise exception 'Saldo kas tidak cukup untuk membatalkan pemasukan ini (dana sudah dipakai)'; end if;
  end if;
  return new;
end $$;
-- (trigger kas_ledger dari migrasi 013 otomatis memakai versi fungsi terbaru)

-- ===== Migrasi 017 (v2.16): privasi uraian kas turunan iuran =====
create or replace function public.kas_ket_privasi() returns trigger
language plpgsql as $$
begin
  if new.id like 'iu\_%' then
    new.ket := regexp_replace(coalesce(new.ket, ''), '^((Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$', '\1 · \3');
  end if;
  return new;
end $$;

drop trigger if exists kas_ket_privasi on public.kas;
create trigger kas_ket_privasi before insert or update of ket on public.kas
  for each row execute function public.kas_ket_privasi();

-- ===== Migrasi 018 (v2.18): verifikasi keaslian bukti transaksi =====
create or replace function public.verifikasi_transaksi(p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r text := upper(btrim(coalesce(p_ref, '')));
  sek text; v_tipe text; v_tgl date; v_waktu timestamptz; v_jml bigint; v_nama text; v_rev text; v_pet text; v_id text; v_tbl text; v_jenis text;
  v_batal text; st text;
begin
  if r !~ '^(TRX|IUR|KAS|REV)[0-9]{6}-[0-9A-F]{8}$' then return jsonb_build_object('ada', false); end if;
  select sekolah into sek from public.pengaturan where id = 1;

  select t.id, t.tgl, t.waktu, t.jml, t.rev_of, t.petugas, t.jenis, s.nama into v_id, v_tgl, v_waktu, v_jml, v_rev, v_pet, v_jenis, v_nama
    from public.tabungan t left join public.siswa s on s.id = t.sid where upper(t.ref) = r limit 1;
  if found then
    v_tbl := 'tabungan'; v_tipe := case when v_jenis = 'setor' then 'Setoran tabungan' else 'Penarikan tabungan' end;
    select x.ref into v_batal from public.tabungan x where x.rev_of = v_id limit 1;
  else
    select i.id, i.tgl, i.waktu, i.jml, i.rev_of, i.petugas, s.nama into v_id, v_tgl, v_waktu, v_jml, v_rev, v_pet, v_nama
      from public.iuran i left join public.siswa s on s.id = i.sid where upper(i.ref) = r limit 1;
    if found then
      v_tbl := 'iuran'; v_tipe := 'Pembayaran iuran';
      select x.ref into v_batal from public.iuran x where x.rev_of = v_id limit 1;
    else
      select k.id, k.tgl, k.waktu, k.jml, k.rev_of, k.petugas, k.jenis into v_id, v_tgl, v_waktu, v_jml, v_rev, v_pet, v_jenis
        from public.kas k where upper(k.ref) = r and k.id not like 'iu\_%' limit 1;
      if found then
        v_tbl := 'kas'; v_tipe := case when v_jenis = 'masuk' then 'Kas kelas masuk' else 'Kas kelas keluar' end;
        select x.ref into v_batal from public.kas x where x.rev_of = v_id limit 1;
      end if;
    end if;
  end if;
  if v_tbl is null then return jsonb_build_object('ada', false); end if;

  st := case when v_rev is not null then 'Pembatalan' when v_batal is not null then 'Dibatalkan' else 'Berhasil' end;
  if v_rev is not null then v_tipe := 'Pembatalan · ' || lower(v_tipe); end if;
  return jsonb_build_object(
    'ada', true, 'tipe', v_tipe, 'ref', r, 'tanggal', v_tgl, 'waktu', v_waktu, 'jumlah', abs(v_jml), 'status', st,
    'sekolah', coalesce(sek, ''), 'petugas', coalesce(v_pet, ''), 'ref_pembatalan', v_batal,
    'siswa', case when v_nama is null then null else (
      select string_agg(case when n = 1 then w else left(w, 1) || '.' end, ' ' order by n)
        from unnest(regexp_split_to_array(btrim(v_nama), '\s+')) with ordinality as x(w, n)) end);
end $$;

revoke all on function public.verifikasi_transaksi(text) from public;
grant execute on function public.verifikasi_transaksi(text) to anon, authenticated;

-- ===== Migrasi 019: akun Orang tua setara Siswa (v2.22) =====

drop policy if exists kas_portal on public.kas;
create policy kas_portal on public.kas for select to authenticated
  using (public.my_role() in ('siswa','ortu'));
drop policy if exists kas_siswa on public.kas;   -- digantikan kas_portal

drop policy if exists struktur_portal on public.struktur;
create policy struktur_portal on public.struktur for select to authenticated
  using (public.my_role() in ('siswa','ortu'));
drop policy if exists struktur_siswa on public.struktur;   -- digantikan struktur_portal

create or replace function public.rekan_kelas()
returns table (id text, nama text, kelas text)
language sql stable security definer set search_path = public as $$
  select s.id, s.nama, s.kelas
  from public.siswa s
  where public.my_role() in ('siswa','ortu')
    and s.kelas in (select k.kelas from public.siswa k where k.id in (select public.my_children()))
  order by s.nama
$$;
revoke all on function public.rekan_kelas() from public, anon;
grant execute on function public.rekan_kelas() to authenticated;

create or replace function public.voting_siswa() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare sid text; kls text[]; r jsonb; sendiri boolean;
begin
  if public.my_role() is null or public.my_role() not in ('siswa','ortu') then return '[]'::jsonb; end if;
  sendiri := public.my_role() = 'siswa';
  select coalesce(array_agg(distinct s.kelas), '{}'::text[]) into kls
    from public.siswa s where s.id in (select public.my_children());
  if cardinality(kls) = 0 then return '[]'::jsonb; end if;
  if sendiri then select m into sid from public.my_children() as m limit 1; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'judul', v.judul, 'open', v.open, 'kand', v.kand,
      'hitung', coalesce((select jsonb_object_agg(t.k, t.n) from (select e.value as k, count(*) as n from jsonb_each_text(v.suara) e group by e.value) t), '{}'::jsonb),
      'total', (select count(*) from jsonb_object_keys(v.suara)),
      'saya', case when sendiri then v.suara ->> sid else null end) order by v.created_at), '[]'::jsonb)
    into r
    from public.voting v
   where jsonb_typeof(v.kand) = 'array'
     and exists (select 1 from public.siswa k where k.kelas = any (kls) and k.id in (select jsonb_array_elements_text(v.kand)));
  return r;
end $$;
revoke all on function public.voting_siswa() from public, anon;
grant execute on function public.voting_siswa() to authenticated;

-- ===== Migrasi 020: hak akses pengurus kelas (Ketua, Sekretaris, Bendahara) v2.23 =====
-- Migrasi 020: hak akses pengurus kelas (Ketua, Sekretaris, Bendahara). v2.23.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 013, 016, 018 dan 019. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang. BELUM DIUJI di Postgres: coba di proyek staging lebih dulu, lalu jalankan supabase/tests/pengurus_kelas_check.sql.
--
-- PRINSIP
--   Pengurus kelas tetap akun peran 'siswa' (hanya-baca seperti siswa lain, tetap memberi suara di voting). Wewenang tambahan disimpan di
--   kolom profiles.jabatan (daftar: 'ketua', 'sekretaris', 'bendahara') dan HANYA admin yang dapat mengubahnya (approve_account).
--   Tabel TIDAK dibuka untuk ditulis: semua tindakan lewat fungsi (RPC) yang memeriksa jabatan, kelas, tanggal, dan batas jumlah di server,
--   lalu mencatat jejak ke tabel aktivitas. Trigger buku besar (013, 016) tetap berlaku: tutup buku, pembatalan hanya hari yang sama, saldo kas tak boleh minus.
--   Wewenang selalu dibatasi pada kelas siswa yang ditautkan ke akun itu.
--
-- WEWENANG
--   Ketua      : mengisi absensi kelas HARI INI; melihat rekap absensi kelas; membuat/mengubah/menghapus pengumuman dan agenda MILIKNYA.
--   Sekretaris : mengisi/mengoreksi absensi kelas hari ini sampai 7 hari ke belakang; rekap absensi; pengumuman dan agenda MILIKNYA.
--   Bendahara  : mencatat iuran mingguan siswa kelasnya (maksimal sebesar iuran per minggu, minggu berjalan sampai 12 minggu ke belakang),
--                membatalkan pembayaran yang ia catat sendiri pada hari yang sama, mencatat kas manual (masuk/keluar, wajib keterangan)
--                dengan batas harian (pengaturan.batas_bendahara), membatalkan catatan kas buatannya sendiri pada hari yang sama.
--   Seorang siswa boleh memegang lebih dari satu jabatan (wewenangnya digabung).
-- TIDAK DIBERIKAN (tetap admin/pengurus): tabungan siswa, hapus/ubah catatan lama, tutup buku, data pribadi siswa lain, pengaturan, akun, daftar siswa lengkap.

-- ---------- Kolom ----------
alter table public.profiles add column if not exists jabatan text[] not null default '{}'::text[];
alter table public.profiles drop constraint if exists profiles_jabatan_check;
alter table public.profiles add constraint profiles_jabatan_check
  check (jabatan <@ array['ketua','sekretaris','bendahara']::text[]);

-- Jabatan hanya berlaku untuk peran 'siswa': dikosongkan otomatis bila peran berubah.
create or replace function public.profiles_jabatan_guard() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from 'siswa' then new.jabatan := '{}'::text[]; end if;
  return new;
end $$;
drop trigger if exists profiles_jabatan_trg on public.profiles;
create trigger profiles_jabatan_trg before insert or update of role, jabatan on public.profiles
  for each row execute function public.profiles_jabatan_guard();

alter table public.pengaturan add column if not exists batas_bendahara bigint not null default 100000;
alter table public.pengaturan drop constraint if exists pengaturan_batas_bendahara_check;
alter table public.pengaturan add constraint pengaturan_batas_bendahara_check check (batas_bendahara >= 0);

-- Pembuat pengumuman/agenda (agar pengurus kelas hanya mengubah miliknya) dan sumbernya (ditampilkan ke siswa dan orang tua).
alter table public.pengumuman add column if not exists oleh uuid, add column if not exists sumber text;
alter table public.agenda     add column if not exists oleh uuid, add column if not exists sumber text;

-- ---------- Persetujuan akun: tambah daftar jabatan ----------
drop function if exists public.approve_account(uuid, text, text[]);
create or replace function public.approve_account(p_uid uuid, p_role text, p_sids text[] default '{}', p_jabatan text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare s text; n int;
begin
  if public.my_role() is distinct from 'admin' then raise exception 'Hanya admin yang dapat mengatur akun'; end if;
  if p_uid = auth.uid() then raise exception 'Peran akun sendiri tidak dapat diubah'; end if;
  if p_role is null or p_role not in ('pending','viewer','pengurus','ortu','siswa','admin') then raise exception 'Peran tidak dikenal'; end if;
  if not exists (select 1 from public.profiles where id = p_uid) then raise exception 'Akun tidak ditemukan'; end if;
  p_sids := coalesce(p_sids, '{}');
  p_jabatan := coalesce((select array_agg(distinct x) from unnest(coalesce(p_jabatan, '{}'::text[])) x), '{}'::text[]);
  if not (p_jabatan <@ array['ketua','sekretaris','bendahara']::text[]) then raise exception 'Jabatan tidak dikenal'; end if;
  if p_role <> 'siswa' and cardinality(p_jabatan) > 0 then raise exception 'Jabatan kelas hanya untuk akun berperan Siswa'; end if;
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
    jabatan = case when p_role = 'siswa' then p_jabatan else '{}'::text[] end,
    disetujui_oleh = case when p_role = 'pending' then null else auth.uid() end,
    disetujui_pada = case when p_role = 'pending' then null else now() end
    where id = p_uid;
  if p_role in ('ortu','siswa') then
    insert into public.wali_siswa (uid, sid) select p_uid, x from (select distinct unnest(p_sids) as x) t;
  end if;
  insert into public.aktivitas (id, t, m, uid)
    values ('ap' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), (extract(epoch from clock_timestamp()) * 1000)::bigint,
            'Jabatan akun diatur: ' || coalesce(nullif(array_to_string(p_jabatan, ', '), ''), '(tidak ada)'), auth.uid());
end $$;
revoke all on function public.approve_account(uuid, text, text[], text[]) from public, anon;
grant execute on function public.approve_account(uuid, text, text[], text[]) to authenticated;

-- ---------- Fungsi bantu ----------
create or replace function public.my_jabatan() returns text[]
language sql stable security definer set search_path = public as
$$ select coalesce((select case when role = 'siswa' then jabatan else '{}'::text[] end from public.profiles where id = auth.uid()), '{}'::text[]) $$;

create or replace function public.has_jabatan(j text) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(j = any (public.my_jabatan()), false) $$;

create or replace function public.my_kelas() returns text
language sql stable security definer set search_path = public as
$$ select s.kelas from public.siswa s where s.id in (select public.my_children()) limit 1 $$;

create or replace function public.pj_wib() returns date language sql stable as
$$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- Memastikan pemanggil memegang salah satu jabatan; mengembalikan kelasnya.
create or replace function public.pj_perlu(j text[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_k text;
begin
  if auth.uid() is null or public.my_role() is distinct from 'siswa' or not (public.my_jabatan() && j) then
    raise exception 'Anda tidak memiliki wewenang untuk tindakan ini';
  end if;
  v_k := public.my_kelas();
  if v_k is null then raise exception 'Akun Anda belum tertaut ke data siswa'; end if;
  return v_k;
end $$;

create or replace function public.pj_label() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select string_agg(initcap(x), ' & ' order by x) from unnest(public.my_jabatan()) x), 'Pengurus') || ' ' || s.nama || ' (' || s.kelas || ')'
  from public.siswa s where s.id in (select public.my_children()) limit 1 $$;

create or replace function public.pj_log(m text) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.aktivitas (id, t, m, uid)
  values ('pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 10), (extract(epoch from clock_timestamp()) * 1000)::bigint, left(m, 300), auth.uid()) $$;

create or replace function public.pj_mg(d date) returns text language sql immutable as $$
  select 'Mg ' || ((extract(day from d)::int - 1) / 7 + 1) || ' ' ||
    (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from d)::int] || ' ' || extract(year from d)::int $$;

revoke all on function public.pj_perlu(text[]), public.pj_label(), public.pj_log(text), public.pj_mg(date), public.pj_wib() from public, anon, authenticated;

-- ---------- Absensi (Ketua, Sekretaris) ----------
create or replace function public.pj_absensi_kelas(p_tgl date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['ketua','sekretaris']); v_h date := public.pj_wib(); v_m int; v_r jsonb;
begin
  p_tgl := coalesce(p_tgl, v_h);
  v_m := case when public.has_jabatan('sekretaris') then 7 else 0 end;
  select jsonb_build_object('kelas', v_k, 'tgl', p_tgl, 'dari', v_h - v_m, 'sampai', v_h, 'boleh', (p_tgl between v_h - v_m and v_h),
           'siswa', coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nama', s.nama, 'st', coalesce(a.st, '')) order by s.nama), '[]'::jsonb))
    into v_r
    from public.siswa s
    left join public.absensi a on a.id = to_char(p_tgl, 'YYYY-MM-DD') || '_' || s.id
   where s.kelas = v_k;
  return v_r;
end $$;

create or replace function public.pj_absensi_simpan(p_tgl date, p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['ketua','sekretaris']); v_h date := public.pj_wib(); v_m int;
        v_e jsonb; v_sid text; v_st text; v_id text; v_n int := 0; v_d int := 0; v_c int;
begin
  v_m := case when public.has_jabatan('sekretaris') then 7 else 0 end;
  if p_tgl is null or p_tgl > v_h or p_tgl < v_h - v_m then
    raise exception 'Tanggal absensi di luar wewenang Anda (%)', case when v_m > 0 then 'hari ini sampai 7 hari ke belakang' else 'hanya hari ini' end;
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 80 then raise exception 'Data absensi tidak valid'; end if;
  for v_e in select value from jsonb_array_elements(p_rows) loop
    v_sid := v_e ->> 'sid'; v_st := nullif(btrim(coalesce(v_e ->> 'st', '')), '');
    if not exists (select 1 from public.siswa where id = v_sid and kelas = v_k) then raise exception 'Ada siswa yang bukan anggota kelas Anda'; end if;
    v_id := to_char(p_tgl, 'YYYY-MM-DD') || '_' || v_sid;
    if v_st is null then
      delete from public.absensi where id = v_id; get diagnostics v_c = row_count; v_d := v_d + v_c;
    elsif v_st not in ('H','S','I','A') then raise exception 'Status absensi tidak dikenal';
    else
      insert into public.absensi (id, sid, tgl, st) values (v_id, v_sid, p_tgl, v_st)
        on conflict (id) do update set st = excluded.st;
      v_n := v_n + 1;
    end if;
  end loop;
  perform public.pj_log(public.pj_label() || ' mengisi absensi kelas ' || v_k || ' tanggal ' || p_tgl || ' (' || v_n || ' diisi, ' || v_d || ' dikosongkan)');
  return jsonb_build_object('disimpan', v_n, 'dikosongkan', v_d);
end $$;

create or replace function public.pj_absensi_rekap(p_bulan text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['ketua','sekretaris']); v_b text; v_r jsonb;
begin
  v_b := coalesce(nullif(p_bulan, ''), to_char(public.pj_wib(), 'YYYY-MM'));
  if v_b !~ '^\d{4}-\d{2}$' then raise exception 'Format bulan harus YYYY-MM'; end if;
  select jsonb_build_object('kelas', v_k, 'bulan', v_b, 'siswa', coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nama', s.nama, 'H', coalesce(c.ch, 0), 'S', coalesce(c.cs, 0), 'I', coalesce(c.ci, 0), 'A', coalesce(c.ca, 0)) order by s.nama), '[]'::jsonb))
    into v_r
    from public.siswa s
    left join (select ab.sid, count(*) filter (where ab.st = 'H') ch, count(*) filter (where ab.st = 'S') cs,
                      count(*) filter (where ab.st = 'I') ci, count(*) filter (where ab.st = 'A') ca
                 from public.absensi ab
                where ab.tgl >= (v_b || '-01')::date and ab.tgl < ((v_b || '-01')::date + interval '1 month')
                group by ab.sid) c on c.sid = s.id
   where s.kelas = v_k;
  return v_r;
end $$;

-- ---------- Iuran mingguan (Bendahara) ----------
create or replace function public.pj_iuran_kelas(p_minggu date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['bendahara']); v_h date := public.pj_wib(); v_cw date; v_w date; v_nom bigint; v_r jsonb;
begin
  v_cw := v_h - (extract(isodow from v_h)::int - 1);
  v_w := coalesce(p_minggu, v_cw);
  if extract(isodow from v_w) <> 1 then raise exception 'Tanggal minggu harus hari Senin'; end if;
  if v_w > v_cw or v_w < v_cw - 84 then raise exception 'Minggu di luar jangkauan (minggu ini sampai 12 minggu ke belakang)'; end if;
  select coalesce(iuran, 0) into v_nom from public.pengaturan where id = 1;
  select jsonb_build_object('kelas', v_k, 'minggu', v_w, 'minggu_ini', v_cw, 'nominal', coalesce(v_nom, 0),
           'siswa', coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nama', s.nama, 'bayar', p.net, 'pid', c.id) order by s.nama), '[]'::jsonb))
    into v_r
    from public.siswa s
    left join lateral (select coalesce(sum(i.jml), 0) as net from public.iuran i where i.sid = s.id and i.minggu = v_w) p on true
    left join lateral (
      select i2.id from public.iuran i2
       where i2.sid = s.id and i2.minggu = v_w and i2.rev_of is null and i2.created_by = auth.uid()
         and (coalesce(i2.waktu, i2.created_at) at time zone 'Asia/Jakarta')::date = v_h
         and not exists (select 1 from public.iuran r where r.rev_of = i2.id)
       order by coalesce(i2.waktu, i2.created_at) desc limit 1) c on true
   where s.kelas = v_k;
  return v_r;
end $$;

create or replace function public.pj_iuran_catat(p_sid text, p_minggu date, p_jml bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['bendahara']); v_h date := public.pj_wib(); v_cw date; v_nom bigint; v_paid bigint;
        v_nama text; v_id text; v_ref text; v_wkt timestamptz;
begin
  v_cw := v_h - (extract(isodow from v_h)::int - 1);
  select coalesce(iuran, 0) into v_nom from public.pengaturan where id = 1;
  if coalesce(v_nom, 0) <= 0 then raise exception 'Nominal iuran per minggu belum diatur oleh admin'; end if;
  select nama into v_nama from public.siswa where id = p_sid and kelas = v_k;
  if v_nama is null then raise exception 'Siswa bukan anggota kelas Anda'; end if;
  if p_minggu is null or extract(isodow from p_minggu) <> 1 or p_minggu > v_cw or p_minggu < v_cw - 84 then
    raise exception 'Minggu tidak valid (harus hari Senin, minggu ini sampai 12 minggu ke belakang)'; end if;
  if p_jml is null or p_jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  select coalesce(sum(jml), 0) into v_paid from public.iuran where sid = p_sid and minggu = p_minggu;
  if v_paid + p_jml > v_nom then
    raise exception 'Melebihi iuran minggu ini (sudah dibayar Rp %, sisa Rp %)', v_paid, greatest(v_nom - v_paid, 0); end if;
  v_id := 'pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into public.iuran (id, sid, bulan, jml, tgl, minggu, cat)
    values (v_id, p_sid, to_char(p_minggu, 'YYYY-MM'), p_jml, v_h, p_minggu, 'Dicatat bendahara kelas')
    returning ref, waktu into v_ref, v_wkt;
  -- Pemasukan Kas Kelas turunan iuran (id 'iu_' + id iuran), tanpa nama siswa (privasi, migrasi 017)
  insert into public.kas (id, tgl, jenis, jml, ket, kat, ref, waktu)
    values ('iu_' || v_id, v_h, 'masuk', p_jml, 'Iuran mingguan · ' || public.pj_mg(p_minggu), 'Iuran', v_ref, v_wkt);
  perform public.pj_log(public.pj_label() || ' mencatat iuran ' || v_nama || ' Rp ' || p_jml || ' (' || public.pj_mg(p_minggu) || ')');
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

create or replace function public.pj_iuran_batal(p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['bendahara']); v_h date := public.pj_wib(); o public.iuran%rowtype; v_id text; v_ref text; v_wkt timestamptz; v_nama text;
begin
  select * into o from public.iuran where id = p_id;
  if not found then raise exception 'Pembayaran tidak ditemukan'; end if;
  select nama into v_nama from public.siswa where id = o.sid and kelas = v_k;
  if v_nama is null then raise exception 'Siswa bukan anggota kelas Anda'; end if;
  if o.rev_of is not null or o.minggu is null then raise exception 'Hanya pembayaran iuran mingguan yang dapat dibatalkan'; end if;
  if o.created_by is distinct from auth.uid() then raise exception 'Anda hanya dapat membatalkan pembayaran yang Anda catat sendiri'; end if;
  if (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < v_h then raise exception 'Pembatalan lintas hari hanya dapat dilakukan admin'; end if;
  v_id := 'pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  begin
    insert into public.iuran (id, sid, bulan, jml, tgl, minggu, cat, rev_of)
      values (v_id, o.sid, o.bulan, -o.jml, v_h, o.minggu, 'Pembatalan oleh bendahara kelas', o.id)
      returning ref, waktu into v_ref, v_wkt;
  exception when unique_violation then raise exception 'Pembayaran ini sudah dibatalkan';
  end;
  insert into public.kas (id, tgl, jenis, jml, ket, kat, ref, waktu)
    values ('iu_' || v_id, v_h, 'masuk', -o.jml, 'Pembatalan iuran mingguan · ' || public.pj_mg(o.minggu), 'Iuran', v_ref, v_wkt);
  perform public.pj_log(public.pj_label() || ' membatalkan iuran ' || v_nama || ' Rp ' || o.jml || ' (' || public.pj_mg(o.minggu) || ')');
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ---------- Kas manual (Bendahara) ----------
create or replace function public.pj_kas_catat(p_jenis text, p_jml bigint, p_ket text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['bendahara']); v_h date := public.pj_wib(); v_ket text := btrim(coalesce(p_ket, ''));
        v_batas bigint; v_pakai bigint; v_id text; v_ref text;
begin
  if p_jenis is null or p_jenis not in ('masuk','keluar') then raise exception 'Jenis harus masuk atau keluar'; end if;
  if p_jml is null or p_jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  if length(v_ket) < 3 or length(v_ket) > 200 then raise exception 'Keterangan wajib diisi (3 sampai 200 karakter)'; end if;
  select coalesce(batas_bendahara, 0) into v_batas from public.pengaturan where id = 1;
  if coalesce(v_batas, 0) <= 0 then raise exception 'Pencatatan kas manual oleh bendahara belum diizinkan. Hubungi guru atau admin'; end if;
  select coalesce(sum(k2.jml), 0) into v_pakai from public.kas k2
   where k2.created_by = auth.uid() and k2.jenis = p_jenis and k2.rev_of is null and k2.id not like 'iu\_%'
     and (coalesce(k2.waktu, k2.created_at) at time zone 'Asia/Jakarta')::date = v_h
     and not exists (select 1 from public.kas r where r.rev_of = k2.id);
  if v_pakai + p_jml > v_batas then
    raise exception 'Melebihi batas harian bendahara Rp % (sudah terpakai Rp % untuk %). Hubungi guru atau pengurus', v_batas, v_pakai, p_jenis; end if;
  v_id := 'pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  insert into public.kas (id, tgl, jenis, jml, ket, kat) values (v_id, v_h, p_jenis, p_jml, v_ket, 'Bendahara kelas') returning ref into v_ref;
  perform public.pj_log(public.pj_label() || ' mencatat kas ' || p_jenis || ' Rp ' || p_jml || ': ' || left(v_ket, 80));
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

create or replace function public.pj_kas_batal(p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_h date := public.pj_wib(); o public.kas%rowtype; v_id text; v_ref text;
begin
  perform public.pj_perlu(array['bendahara']);
  select * into o from public.kas where id = p_id;
  if not found then raise exception 'Catatan kas tidak ditemukan'; end if;
  if o.id like 'iu\_%' then raise exception 'Catatan ini berasal dari Iuran. Batalkan pembayarannya di tab Iuran'; end if;
  if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
  if o.created_by is distinct from auth.uid() then raise exception 'Anda hanya dapat membatalkan catatan kas yang Anda buat sendiri'; end if;
  if (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < v_h then raise exception 'Pembatalan lintas hari hanya dapat dilakukan admin'; end if;
  v_id := 'pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
  begin
    insert into public.kas (id, tgl, jenis, jml, ket, kat, rev_of)
      values (v_id, v_h, o.jenis, -o.jml, 'Pembatalan: ' || left(coalesce(o.ket, ''), 150), o.kat, o.id) returning ref into v_ref;
  exception when unique_violation then raise exception 'Catatan ini sudah dibatalkan';
  end;
  perform public.pj_log(public.pj_label() || ' membatalkan kas ' || o.jenis || ' Rp ' || o.jml);
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end $$;

-- ---------- Pengumuman dan agenda (Ketua, Sekretaris) ----------
create or replace function public.pj_info_simpan(p_jenis text, p_id text, p_tgl date, p_judul text, p_isi text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_k text := public.pj_perlu(array['ketua','sekretaris']); v_h date := public.pj_wib(); v_j text := btrim(coalesce(p_judul, '')); v_i text := btrim(coalesce(p_isi, ''));
        v_src text; v_id text := p_id; v_n int; v_max int;
begin
  if p_jenis is null or p_jenis not in ('pengumuman','agenda') then raise exception 'Jenis harus pengumuman atau agenda'; end if;
  if length(v_j) < 3 or length(v_j) > 120 then raise exception 'Judul wajib diisi (3 sampai 120 karakter)'; end if;
  v_max := case when p_jenis = 'agenda' then 500 else 2000 end;
  if length(v_i) > v_max then raise exception 'Isi terlalu panjang'; end if;
  select string_agg(initcap(x), ' & ' order by x) || ' kelas ' || v_k into v_src from unnest(public.my_jabatan()) x where x in ('ketua','sekretaris');
  if p_jenis = 'agenda' and (p_tgl is null or p_tgl < v_h - 30 or p_tgl > v_h + 365) then raise exception 'Tanggal agenda harus antara 30 hari lalu dan 1 tahun ke depan'; end if;
  if v_id is null then
    select count(*) into v_n from (
      select 1 from public.pengumuman where oleh = auth.uid() and created_at >= now() - interval '1 day'
      union all select 1 from public.agenda where oleh = auth.uid() and created_at >= now() - interval '1 day') t;
    if v_n >= 10 then raise exception 'Batas 10 pengumuman/agenda per hari tercapai'; end if;
    v_id := 'pj' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    if p_jenis = 'pengumuman' then
      insert into public.pengumuman (id, tgl, judul, isi, oleh, sumber) values (v_id, v_h, v_j, v_i, auth.uid(), v_src);
    else
      insert into public.agenda (id, tgl, judul, ket, oleh, sumber) values (v_id, p_tgl, v_j, v_i, auth.uid(), v_src);
    end if;
  else
    if p_jenis = 'pengumuman' then
      update public.pengumuman set judul = v_j, isi = v_i where id = v_id and oleh = auth.uid();
    else
      update public.agenda set tgl = p_tgl, judul = v_j, ket = v_i where id = v_id and oleh = auth.uid();
    end if;
    if not found then raise exception 'Hanya pengumuman atau agenda yang Anda buat sendiri yang dapat diubah'; end if;
  end if;
  perform public.pj_log(public.pj_label() || case when p_id is null then ' membuat ' else ' mengubah ' end || p_jenis || ': ' || left(v_j, 80));
  return v_id;
end $$;

create or replace function public.pj_info_hapus(p_jenis text, p_id text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_t text;
begin
  perform public.pj_perlu(array['ketua','sekretaris']);
  if p_jenis = 'pengumuman' then
    delete from public.pengumuman where id = p_id and oleh = auth.uid() returning judul into v_t;
  elsif p_jenis = 'agenda' then
    delete from public.agenda where id = p_id and oleh = auth.uid() returning judul into v_t;
  else raise exception 'Jenis harus pengumuman atau agenda'; end if;
  if v_t is null then raise exception 'Hanya yang Anda buat sendiri yang dapat dihapus'; end if;
  perform public.pj_log(public.pj_label() || ' menghapus ' || p_jenis || ': ' || left(v_t, 80));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'pj_absensi_kelas(date)', 'pj_absensi_simpan(date,jsonb)', 'pj_absensi_rekap(text)',
    'pj_iuran_kelas(date)', 'pj_iuran_catat(text,date,bigint)', 'pj_iuran_batal(text)',
    'pj_kas_catat(text,bigint,text)', 'pj_kas_batal(text)',
    'pj_info_simpan(text,text,date,text,text)', 'pj_info_hapus(text,text)',
    'my_jabatan()', 'has_jabatan(text)', 'my_kelas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
