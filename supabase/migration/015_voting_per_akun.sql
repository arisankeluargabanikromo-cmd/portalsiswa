-- Migrasi 015: voting berdasarkan akun login masing-masing.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 011. Instalasi baru: sudah termasuk di akhir schema.sql. Aman dijalankan ulang.
--
-- Aturan baru:
--   1. Yang memberi suara adalah akun Siswa yang sedang login, atas nama siswa yang tertaut ke akunnya. Admin/pengurus tidak lagi memilihkan suara.
--   2. Satu akun satu suara per pemilihan, tidak dapat diubah, hanya selama pemilihan dibuka.
--   3. Hanya siswa dari kelas kandidat yang berhak memilih.
--   4. Pemungutan suara rahasia: akun Siswa tidak lagi membaca isi tabel voting (yang memuat siapa memilih siapa).
--      Siswa hanya menerima hasil rekap dan pilihannya sendiri lewat voting_siswa().
--   5. Suara hanya dapat ditulis lewat beri_suara(). Tulis langsung ke kolom suara (termasuk oleh admin, pemulihan cadangan, atau
--      simpan ulang dari aplikasi) diabaikan oleh trigger, sehingga suara tidak bisa dipalsukan maupun tertimpa.

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
