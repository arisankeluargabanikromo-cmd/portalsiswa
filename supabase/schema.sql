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
