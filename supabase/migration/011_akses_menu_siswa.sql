-- Migrasi 011: akses menu keuangan dan kelas untuk akun Siswa (hanya-baca).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 010.
-- Instalasi baru: sudah termasuk di akhir schema.sql. Aman dijalankan ulang.
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
