-- Migrasi 019: akun Orang tua memakai tampilan dan akses baca yang sama dengan akun Siswa (v2.22).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 011 dan 015. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang. BELUM DIUJI di Postgres: coba di proyek staging lebih dulu, lalu jalankan supabase/tests/portal_ortu_check.sql.
--
-- Yang dibuka untuk peran 'ortu' (semuanya SELECT saja, sama seperti 'siswa'):
--   kas           : seluruh catatan kas kelas (uraian iuran sudah tanpa nama siswa, migrasi 017)
--   struktur      : seluruh jabatan pengurus kelas
--   rekan_kelas() : id, nama, kelas siswa yang sekelas dengan anak yang tertaut (untuk nama pengurus dan kandidat)
--   voting_siswa(): rekap pemilihan untuk kelas anak (jumlah suara; 'saya' selalu kosong untuk Orang tua)
-- Yang TETAP tertutup untuk Orang tua:
--   beri_suara()  : hanya akun Siswa yang memberi suara (satu siswa satu suara, rahasia). Tidak diubah di migrasi ini.
--   tabel voting  : tidak dibaca langsung (memuat siapa memilih siapa).
--   data pribadi, tabungan, iuran, absensi siswa lain; aktivitas; profil akun.
-- Orang tua dengan beberapa anak: kelas yang dicakup adalah gabungan kelas semua anak yang tertaut.

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
