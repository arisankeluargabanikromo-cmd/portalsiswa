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
