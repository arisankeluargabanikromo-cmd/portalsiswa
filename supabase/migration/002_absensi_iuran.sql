-- Migrasi 002: absensi, iuran bulanan, target tabungan.
-- Untuk project yang SUDAH menjalankan schema.sql versi awal: jalankan file ini sekali di SQL Editor.
-- (Instalasi baru tidak perlu: blok ini sudah termasuk di akhir schema.sql.)

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
