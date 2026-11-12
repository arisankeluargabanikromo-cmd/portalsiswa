-- Uji migrasi 019 (struktur saja, tidak memakai data). Tempel di SQL Editor lalu Run. Error di akhir disengaja agar tidak ada yang tersimpan.
-- Pengujian per peran (login sebagai akun ortu sungguhan) tetap perlu dilakukan di staging: lihat README, bagian "Akun Orang tua".
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='kas' and policyname='kas_portal'
                 and qual ilike '%ortu%' and qual ilike '%siswa%') then raise exception 'GAGAL: policy kas_portal tidak mencakup ortu dan siswa'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='struktur' and policyname='struktur_portal'
                 and qual ilike '%ortu%' and qual ilike '%siswa%') then raise exception 'GAGAL: policy struktur_portal tidak mencakup ortu dan siswa'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename in ('kas','struktur') and policyname in ('kas_siswa','struktur_siswa')) then
    raise exception 'GAGAL: policy lama kas_siswa/struktur_siswa masih ada'; end if;
  -- Orang tua TIDAK boleh membaca tabel voting langsung (memuat siapa memilih siapa)
  if exists (select 1 from pg_policies where schemaname='public' and tablename='voting' and cmd in ('SELECT','ALL') and qual ilike '%ortu%') then
    raise exception 'GAGAL: tabel voting terbaca langsung oleh ortu'; end if;
  -- beri_suara tetap khusus siswa
  if (select pg_get_functiondef('public.beri_suara(text,text)'::regprocedure)) not ilike '%distinct from ''siswa''%' then
    raise exception 'GAGAL: beri_suara tidak lagi khusus siswa'; end if;
  if (select pg_get_functiondef('public.voting_siswa()'::regprocedure)) not ilike '%''ortu''%' then
    raise exception 'GAGAL: voting_siswa belum mencakup ortu'; end if;
  if (select pg_get_functiondef('public.rekan_kelas()'::regprocedure)) not ilike '%''ortu''%' then
    raise exception 'GAGAL: rekan_kelas belum mencakup ortu'; end if;
  raise exception 'HASIL UJI PORTAL ORTU: LULUS (error ini disengaja agar tidak ada yang tersimpan)';
end $$;
