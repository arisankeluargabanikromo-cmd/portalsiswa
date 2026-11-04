-- Migrasi 006: simpan pilihan tema per akun. Untuk database yang sudah berjalan: jalankan sekali di SQL Editor.
-- Opsional: tanpa tabel ini aplikasi tetap berjalan dan tema hanya tersimpan per perangkat.
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
