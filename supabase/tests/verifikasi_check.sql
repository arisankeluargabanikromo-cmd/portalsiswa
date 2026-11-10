-- Uji migrasi 018. Tempel di SQL Editor, Run. Hasil ada di pesan error terakhir (disengaja agar tidak ada yang tersimpan).
do $$
declare x jsonb; ref text; msg text := '';
begin
  -- 1. pola tidak sah ditolak
  x := public.verifikasi_transaksi('bukan-ref');            if (x->>'ada')::boolean then raise exception 'GAGAL: pola tidak sah diterima'; end if;
  x := public.verifikasi_transaksi('TRX260101-ZZZZZZZZ');   if (x->>'ada')::boolean then raise exception 'GAGAL: heksa tidak sah diterima'; end if;
  x := public.verifikasi_transaksi('''; drop table siswa;--'); if (x->>'ada')::boolean then raise exception 'GAGAL: injeksi'; end if;
  msg := msg || E'\n- pola tidak sah ditolak: OK';
  -- 2. ref yang ada: ambil satu transaksi tabungan
  select t.ref into ref from public.tabungan t where t.ref is not null and t.rev_of is null limit 1;
  if ref is null then msg := msg || E'\n- (tidak ada transaksi untuk diuji, lewati bagian data)';
  else
    x := public.verifikasi_transaksi(lower(ref));
    if not (x->>'ada')::boolean then raise exception 'GAGAL: ref % tidak ditemukan', ref; end if;
    if x ? 'saldo' or x ? 'nis' or x ? 'kelas' or x ? 'cat' or x ? 'ket' then raise exception 'GAGAL: kolom sensitif bocor: %', x; end if;
    if x->>'siswa' ~ '^\S+ \S+\S' and (x->>'siswa') !~ '\.' then raise exception 'GAGAL: nama siswa tidak tersamar: %', x->>'siswa'; end if;
    msg := msg || E'\n- ref ada, kolom sensitif tidak bocor, nama tersamar: OK  -> ' || x::text;
  end if;
  -- 3. anon boleh memanggil
  if not has_function_privilege('anon', 'public.verifikasi_transaksi(text)', 'execute') then raise exception 'GAGAL: anon tidak boleh execute'; end if;
  msg := msg || E'\n- anon dapat execute: OK';
  raise exception E'HASIL UJI VERIFIKASI: LULUS (error ini disengaja)%', msg;
end $$;
