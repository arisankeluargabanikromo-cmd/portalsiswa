-- SekolahHub: uji buku besar standar perbankan (migrasi 013). Jalankan di SQL Editor setelah migrasi 013.
-- Skrip membuat data uji sementara lalu SELALU membatalkannya lewat error di akhir.
-- Hasil ada pada pesan "HASIL UJI BUKU BESAR". Error itu disengaja, data asli tidak berubah.
-- Setiap baris harus bertuliskan LULUS.
create or replace function pg_temp.cek(t text, ok boolean) returns text language sql as
$$ select '- ' || t || ': ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n' $$;

-- Menjalankan satu perintah sebagai peran tertentu; mengembalikan pesan error (kosong bila berhasil).
create or replace function pg_temp.sebagai(u uuid, sql text) returns text language plpgsql as $$
declare m text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    execute sql;
  exception when others then m := coalesce(sqlerrm, 'error');
  end;
  reset role;
  return m;
end $$;

do $$
declare
  ad uuid := '00000000-0000-4000-8000-0000000000e1';  -- admin
  pg uuid := '00000000-0000-4000-8000-0000000000e2';  -- pengurus
  vw uuid := '00000000-0000-4000-8000-0000000000e3';  -- viewer
  ot uuid := '00000000-0000-4000-8000-0000000000e4';  -- orang tua siswa 1
  m text; n int; v text; res text := '';
  hari date := (now() at time zone 'Asia/Jakarta')::date;
begin
  insert into auth.users (id, email) values (ad,'uji.ad@test.local'),(pg,'uji.pg@test.local'),(vw,'uji.vw@test.local'),(ot,'uji.ot@test.local');
  update public.profiles set role='admin' where id = ad;
  update public.profiles set role='pengurus' where id = pg;
  update public.profiles set role='viewer' where id = vw;
  update public.profiles set role='ortu' where id = ot;
  insert into public.siswa (id,nama,nis,kelas) values ('l_s1','Uji Satu','LDG-1','T'),('l_s2','Uji Dua','LDG-2','T');
  insert into public.wali_siswa (uid,sid) values (ot,'l_s1');

  -- ===== Tabungan: pencatatan dan stempel server =====
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t1','l_s1','%s','setor',10000)$q$, hari));
  res := res || pg_temp.cek('Pengurus: setoran berhasil dicatat', m = '');
  select ref into v from public.tabungan where id = 'l_t1';
  res := res || pg_temp.cek('Server mengisi nomor referensi TRX', v like 'TRX%');
  select petugas into v from public.tabungan where id = 'l_t1';
  res := res || pg_temp.cek('Petugas disamarkan (bukan email penuh)', v like '%***@%' and v not like '%uji.pg%');
  res := res || pg_temp.cek('Waktu pembukuan diisi server', (select waktu is not null from public.tabungan where id = 'l_t1'));

  -- ===== Tabungan: buku besar permanen =====
  m := pg_temp.sebagai(pg, $q$update public.tabungan set jml = 1 where id = 'l_t1'$q$);
  res := res || pg_temp.cek('Pengurus: tidak bisa mengubah transaksi', m like '%permanen%');
  m := pg_temp.sebagai(ad, $q$update public.tabungan set jml = 1 where id = 'l_t1'$q$);
  res := res || pg_temp.cek('Admin: juga tidak bisa mengubah transaksi', m like '%permanen%');
  m := pg_temp.sebagai(pg, $q$delete from public.tabungan where id = 'l_t1'$q$);
  res := res || pg_temp.cek('Pengurus: tidak bisa menghapus transaksi', m like '%tidak boleh dihapus%');
  select count(*) into n from public.tabungan where id = 'l_t1';
  res := res || pg_temp.cek('Transaksi tetap ada setelah percobaan hapus', n = 1);
  m := pg_temp.sebagai(pg, $q$insert into public.tabungan (id,sid,tgl,jenis,jml,ref) values ('l_t1b','l_s1',current_date,'setor',1,(select ref from public.tabungan where id='l_t1'))$q$);
  res := res || pg_temp.cek('Nomor referensi ganda ditolak', m <> '');

  -- ===== Tabungan: pembatalan (reversal) =====
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r1','l_s1','%s','setor',-9999,'l_t1')$q$, hari));
  res := res || pg_temp.cek('Pembatalan dengan nominal berbeda ditolak', m like '%tidak cocok%');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r1','l_s2','%s','setor',-10000,'l_t1')$q$, hari));
  res := res || pg_temp.cek('Pembatalan lintas rekening ditolak', m like '%tidak cocok%');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r1','l_s1','%s','setor',-10000,'l_t1')$q$, hari));
  res := res || pg_temp.cek('Pengurus: pembatalan hari yang sama berhasil', m = '');
  select coalesce(sum(case when jenis='setor' then jml else -jml end),0) into n from public.tabungan where sid = 'l_s1';
  res := res || pg_temp.cek('Saldo kembali 0 setelah pembatalan', n = 0);
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r2','l_s1','%s','setor',-10000,'l_t1')$q$, hari));
  res := res || pg_temp.cek('Transaksi yang sama tidak bisa dibatalkan dua kali', m <> '');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r3','l_s1','%s','setor',10000,'l_r1')$q$, hari));
  res := res || pg_temp.cek('Pembatalan tidak bisa dibatalkan lagi', m <> '');

  -- ===== Tabungan: saldo, saldo mengendap, tutup rekening =====
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t2','l_s1','%s','tarik',1)$q$, hari));
  res := res || pg_temp.cek('Penarikan melebihi saldo ditolak', m like '%Saldo tidak cukup%');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t3','l_s1','%s','setor',50000)$q$, hari));
  update public.pengaturan set saldo_min = 5000 where id = 1;
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t4','l_s1','%s','tarik',46000)$q$, hari));
  res := res || pg_temp.cek('Penarikan yang menembus saldo mengendap ditolak', m like '%mengendap%');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t5','l_s1','%s','tarik',45000)$q$, hari));
  res := res || pg_temp.cek('Penarikan sampai tepat saldo mengendap diizinkan', m = '');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,kanal) values ('l_t6','l_s1','%s','tarik',5000,'Tutup rekening')$q$, hari));
  res := res || pg_temp.cek('Tutup rekening boleh menarik seluruh saldo', m = '');
  update public.pengaturan set saldo_min = 0 where id = 1;
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r4','l_s1','%s','setor',-50000,'l_t3')$q$, hari));
  res := res || pg_temp.cek('Setoran yang dananya sudah ditarik tidak bisa dibatalkan', m like '%sudah ditarik%');

  -- ===== Tabungan: pembatalan lintas hari hanya admin =====
  insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t7','l_s2',current_date,'setor',20000);
  alter table public.tabungan disable trigger tabungan_ledger;
  update public.tabungan set waktu = now() - interval '2 days' where id = 'l_t7';
  alter table public.tabungan enable trigger tabungan_ledger;
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r5','l_s2','%s','setor',-20000,'l_t7')$q$, hari));
  res := res || pg_temp.cek('Pengurus: pembatalan lintas hari ditolak', m like '%lintas hari%');
  m := pg_temp.sebagai(ad, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml,rev_of) values ('l_r5','l_s2','%s','setor',-20000,'l_t7')$q$, hari));
  res := res || pg_temp.cek('Admin: pembatalan lintas hari berhasil', m = '');

  -- ===== Tutup buku dan tanggal =====
  update public.pengaturan set tutup_buku = hari - 1 where id = 1;
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t8','l_s2','%s','setor',1000)$q$, hari - 1));
  res := res || pg_temp.cek('Transaksi di periode tertutup ditolak (pengurus)', m like '%sudah ditutup%');
  m := pg_temp.sebagai(ad, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t8','l_s2','%s','setor',1000)$q$, hari - 1));
  res := res || pg_temp.cek('Transaksi di periode tertutup ditolak (admin juga)', m like '%sudah ditutup%');
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t8','l_s2','%s','setor',1000)$q$, hari));
  res := res || pg_temp.cek('Transaksi setelah tutup buku diizinkan', m = '');
  update public.pengaturan set tutup_buku = null where id = 1;
  m := pg_temp.sebagai(pg, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_t9','l_s2','%s','setor',1000)$q$, hari + 5));
  res := res || pg_temp.cek('Tanggal di masa depan ditolak', m like '%masa depan%');
  m := pg_temp.sebagai(ad, format($q$update public.pengaturan set tutup_buku = '%s' where id = 1$q$, hari + 9));
  res := res || pg_temp.cek('Tutup buku tidak boleh di masa depan', m like '%masa depan%');

  -- ===== Kas kelas =====
  select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) + 1 into n from public.kas;   -- tepat 1 rupiah di atas saldo kas
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket) values ('l_k0','%s','keluar',%s,'uji')$q$, hari, n));
  res := res || pg_temp.cek('Kas: pengeluaran melebihi saldo ditolak', m like '%Saldo kas tidak cukup%');
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket,kat) values ('l_k1','%s','masuk',100000,'Sumbangan','Sumbangan')$q$, hari));
  res := res || pg_temp.cek('Kas: pemasukan manual berhasil', m = '');
  select ref into v from public.kas where id = 'l_k1';
  res := res || pg_temp.cek('Kas: nomor bukti KAS diisi server', v like 'KAS%');
  m := pg_temp.sebagai(pg, $q$update public.kas set jml = 1 where id = 'l_k1'$q$);
  res := res || pg_temp.cek('Kas: catatan manual tidak bisa diubah', m like '%permanen%');
  m := pg_temp.sebagai(pg, $q$delete from public.kas where id = 'l_k1'$q$);
  res := res || pg_temp.cek('Kas: catatan manual tidak bisa dihapus', m like '%tidak boleh dihapus%');
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket) values ('l_k2','%s','keluar',60000,'ATK')$q$, hari));
  res := res || pg_temp.cek('Kas: pengeluaran dalam batas saldo berhasil', m = '');
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket,rev_of) values ('l_kr1','%s','masuk',-100000,'Batal','l_k1')$q$, hari));
  res := res || pg_temp.cek('Kas: pembatalan pemasukan yang dananya terpakai ditolak', m like '%dana sudah dipakai%' or m like '%tidak cukup%');
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket,rev_of) values ('l_kr2','%s','keluar',-60000,'Batal ATK','l_k2')$q$, hari));
  res := res || pg_temp.cek('Kas: pembatalan pengeluaran berhasil', m = '');
  m := pg_temp.sebagai(pg, format($q$insert into public.kas (id,tgl,jenis,jml,ket) values ('iu_l_i0','%s','masuk',5000,'Iuran uji')$q$, hari));
  res := res || pg_temp.cek('Kas: baris turunan iuran (iu_) boleh dibuat', m = '');
  m := pg_temp.sebagai(pg, $q$update public.kas set ket = 'Iuran uji 2' where id = 'iu_l_i0'$q$);
  res := res || pg_temp.cek('Kas: baris turunan iuran boleh disinkronkan', m = '');
  m := pg_temp.sebagai(pg, $q$delete from public.kas where id = 'iu_l_i0'$q$);
  res := res || pg_temp.cek('Kas: baris turunan iuran boleh dihapus sinkronisasi', m = '');

  -- ===== Iuran =====
  m := pg_temp.sebagai(pg, format($q$insert into public.iuran (id,sid,bulan,minggu,jml,tgl) values ('l_i1','l_s1',to_char(date '%1$s','YYYY-MM'),date '%1$s',2000,'%1$s')$q$, hari));
  res := res || pg_temp.cek('Iuran: pembayaran berhasil, nomor referensi IUR diisi', m = '' and (select ref like 'IUR%' from public.iuran where id = 'l_i1'));
  m := pg_temp.sebagai(pg, $q$update public.iuran set jml = 9 where id = 'l_i1'$q$);
  res := res || pg_temp.cek('Iuran: pembayaran tidak bisa diubah', m like '%permanen%');
  m := pg_temp.sebagai(pg, $q$delete from public.iuran where id = 'l_i1'$q$);
  res := res || pg_temp.cek('Iuran: pembayaran tidak bisa dihapus', m like '%tidak boleh dihapus%');
  insert into public.kas (id,tgl,jenis,jml,ket) values ('iu_l_i1',current_date,'masuk',2000,'turunan');
  -- saldo kas saat ini = 100000 - 60000 + 60000(batal) + 2000 = 102000 -> habiskan agar pembatalan iuran gagal
  insert into public.kas (id,tgl,jenis,jml,ket) values ('l_k3',current_date,'keluar',(select sum(case when jenis='masuk' then jml else -jml end) from public.kas),'Habiskan');
  m := pg_temp.sebagai(pg, format($q$insert into public.iuran (id,sid,bulan,minggu,jml,tgl,rev_of) values ('l_ir1','l_s1',to_char(date '%1$s','YYYY-MM'),date '%1$s',-2000,'%1$s','l_i1')$q$, hari));
  res := res || pg_temp.cek('Iuran: pembatalan ditolak bila Kas Kelas sudah terpakai', m like '%Kas Kelas%');
  insert into public.kas (id,tgl,jenis,jml,ket) values ('l_k4',current_date,'masuk',5000,'Tambah kas');
  m := pg_temp.sebagai(pg, format($q$insert into public.iuran (id,sid,bulan,minggu,jml,tgl,rev_of) values ('l_ir1','l_s1',to_char(date '%1$s','YYYY-MM'),date '%1$s',-2000,'%1$s','l_i1')$q$, hari));
  res := res || pg_temp.cek('Iuran: pembatalan berhasil bila dana kas tersedia', m = '');

  -- ===== Peran lain =====
  m := pg_temp.sebagai(vw, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_x1','l_s1','%s','setor',1)$q$, hari));
  res := res || pg_temp.cek('Viewer: tidak bisa mencatat tabungan', m <> '');
  m := pg_temp.sebagai(ot, format($q$insert into public.tabungan (id,sid,tgl,jenis,jml) values ('l_x2','l_s1','%s','setor',1)$q$, hari));
  res := res || pg_temp.cek('Orang tua: tidak bisa mencatat tabungan', m <> '');
  m := pg_temp.sebagai(ot, format($q$insert into public.iuran (id,sid,bulan,jml,tgl) values ('l_x3','l_s1','2026-01',1,'%s')$q$, hari));
  res := res || pg_temp.cek('Orang tua: tidak bisa mencatat iuran', m <> '');
  perform set_config('request.jwt.claims', json_build_object('sub', ot, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tabungan; reset role;
  res := res || pg_temp.cek('Orang tua: hanya melihat tabungan anaknya (termasuk baris pembatalan)', n = (select count(*) from public.tabungan where sid = 'l_s1'));

  -- ===== Hapus siswa: baris turunannya ikut terhapus lewat cascade =====
  m := pg_temp.sebagai(pg, $q$delete from public.siswa where id = 'l_s1'$q$);
  select count(*) into n from public.tabungan where sid = 'l_s1';
  res := res || pg_temp.cek('Hapus siswa membersihkan tabungan dan iurannya (cascade)', m = '' and n = 0 and not exists (select 1 from public.iuran where sid = 'l_s1'));

  raise exception E'HASIL UJI BUKU BESAR\n%\n(Error ini disengaja agar semua data uji dibatalkan. Setiap baris harus LULUS.)', res;
end $$;
