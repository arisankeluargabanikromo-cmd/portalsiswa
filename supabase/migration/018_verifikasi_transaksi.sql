-- Migrasi 018: verifikasi keaslian bukti transaksi lewat QR (halaman publik /verifikasi).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 013. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang. BELUM DIUJI di Postgres: coba di staging dulu, lalu jalankan supabase/tests/verifikasi_check.sql.
--
-- Fungsi verifikasi_transaksi(p_ref) boleh dipanggil TANPA login (peran anon), karena orang tua memindai QR dari kertas.
-- Karena itu keluarannya sengaja minimal:
--   ada, tipe, ref, tanggal, waktu, jumlah (nilai mutlak), status (Berhasil / Dibatalkan / Pembatalan), nama sekolah,
--   nama siswa TERSAMAR ("Budi S."), petugas (sudah tersamar oleh petugas_label), dan nomor referensi pembatalan bila ada.
-- TIDAK dikembalikan: saldo, NIS, kelas, nomor rekening, keterangan/uraian, kontak, nama lengkap.
-- Hanya cocok pada nomor referensi persis (format TRX|IUR|KAS|REV + yymmdd + '-' + 8 hex acak); pola lain ditolak tanpa menyentuh tabel.
-- Batas yang perlu diketahui: tidak ada pembatasan laju (rate limit) di tingkat fungsi; 8 hex acak per hari membuat tebak-acak tidak praktis,
-- tetapi pasang pembatasan di Vercel/Supabase bila dipakai luas. Pemegang kertas yang sah memeriksa bahwa data di layar SAMA dengan yang tercetak.

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
