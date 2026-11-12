-- Uji struktur migrasi 020 (tanpa data). Tempel di SQL Editor lalu Run. Error di akhir disengaja agar tidak ada yang tersimpan.
-- Pengujian per akun (bendahara, sekretaris, ketua, siswa biasa) tetap perlu dilakukan di staging dengan akun sungguhan: lihat CHANGELOG_2.23.0.md.
do $$
declare f text;
begin
  foreach f in array array['pj_absensi_kelas(date)','pj_absensi_simpan(date,jsonb)','pj_absensi_rekap(text)','pj_iuran_kelas(date)','pj_iuran_catat(text,date,bigint)',
                           'pj_iuran_batal(text)','pj_kas_catat(text,bigint,text)','pj_kas_batal(text)','pj_info_simpan(text,text,date,text,text)','pj_info_hapus(text,text)'] loop
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'GAGAL: authenticated tidak dapat menjalankan %', f; end if;
    if has_function_privilege('anon', 'public.' || f, 'execute') then raise exception 'GAGAL: anon dapat menjalankan %', f; end if;
    if not (select prosecdef from pg_proc where oid = ('public.' || f)::regprocedure) then raise exception 'GAGAL: % bukan security definer', f; end if;
  end loop;
  -- fungsi bantu internal tidak boleh dipanggil langsung oleh pengguna
  foreach f in array array['pj_perlu(text[])','pj_log(text)','pj_label()','pj_mg(date)','pj_wib()'] loop
    if has_function_privilege('authenticated', 'public.' || f, 'execute') then raise exception 'GAGAL: fungsi internal % terbuka untuk authenticated', f; end if;
  end loop;
  -- tabel TIDAK dibuka untuk ditulis akun siswa (hanya lewat fungsi)
  if exists (select 1 from pg_policies where schemaname='public' and tablename in ('absensi','iuran','kas','agenda','pengumuman')
             and cmd in ('INSERT','UPDATE','DELETE','ALL') and (qual ilike '%siswa%' or with_check ilike '%siswa%')) then
    raise exception 'GAGAL: ada policy tulis yang menyebut peran siswa'; end if;
  -- jabatan hanya nilai yang dikenal dan hanya berlaku untuk peran siswa
  if not exists (select 1 from pg_constraint where conname = 'profiles_jabatan_check') then raise exception 'GAGAL: constraint jabatan tidak ada'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_jabatan_trg') then raise exception 'GAGAL: trigger jabatan tidak ada'; end if;
  if exists (select 1 from public.profiles where cardinality(jabatan) > 0 and role <> 'siswa') then raise exception 'GAGAL: ada jabatan pada akun non-siswa'; end if;
  -- approve_account hanya satu tanda tangan (4 argumen)
  if (select count(*) from pg_proc where proname = 'approve_account' and pronamespace = 'public'::regnamespace) <> 1 then raise exception 'GAGAL: approve_account ganda'; end if;
  raise exception 'HASIL UJI PENGURUS KELAS: LULUS (error ini disengaja agar tidak ada yang tersimpan)';
end $$;
