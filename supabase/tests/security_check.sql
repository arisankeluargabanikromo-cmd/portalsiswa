-- SekolahHub: uji keamanan data (RLS). Jalankan di SQL Editor setelah semua migrasi.
-- Skrip membuat data uji sementara lalu SELALU membatalkannya lewat error di akhir.
-- Hasil ada pada pesan "HASIL UJI KEAMANAN". Error itu disengaja, data asli tidak berubah.
create or replace function pg_temp.cek(t text, ok boolean) returns text language sql as
$$ select '- ' || t || ': ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n' $$;

do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1';  -- orang tua anak 1
  b uuid := '00000000-0000-4000-8000-0000000000b2';  -- orang tua anak 2
  v uuid := '00000000-0000-4000-8000-0000000000c3';  -- viewer
  p uuid := '00000000-0000-4000-8000-0000000000d4';  -- pending
  n int; r text; ok boolean; res text := '';
begin
  insert into auth.users (id, email) values
    (a,'uji.a@test.local'),(b,'uji.b@test.local'),(v,'uji.v@test.local'),(p,'uji.p@test.local');
  update public.profiles set role='ortu' where id in (a,b);
  update public.profiles set role='viewer' where id = v;
  update public.profiles set role='pending' where id = p;
  insert into public.siswa (id,nama,nis,kelas) values ('t_s1','Uji Satu','UJI-1','T'),('t_s2','Uji Dua','UJI-2','T');
  insert into public.tabungan (id,sid,tgl,jenis,jml) values
    ('t_t1','t_s1',current_date,'setor',5000),('t_t2','t_s2',current_date,'setor',7000);
  insert into public.kas (id,tgl,jenis,jml,ket) values ('t_k1',current_date,'masuk',1000,'uji');
  insert into public.pengumuman (id,tgl,judul) values ('t_p1',current_date,'Uji');
  insert into public.wali_siswa (uid,sid) values (a,'t_s1'),(b,'t_s2');
  insert into storage.objects (bucket_id,name) values ('foto-siswa','t_s1/foto-uji.jpg'),('foto-siswa','t_s2/foto-uji.jpg');

  -- ===== Orang tua A (anak: t_s1) =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa;                                  reset role; res := res || pg_temp.cek('Ortu: hanya melihat 1 siswa (anaknya)', n = 1);
  set local role authenticated;
  select count(*) into n from public.tabungan;                               reset role; res := res || pg_temp.cek('Ortu: hanya melihat tabungan anaknya', n = 1);
  set local role authenticated;
  select count(*) into n from public.tabungan where sid = 't_s2';            reset role; res := res || pg_temp.cek('Ortu: tidak bisa membuka tabungan anak lain', n = 0);
  set local role authenticated;
  select count(*) into n from public.kas;                                    reset role; res := res || pg_temp.cek('Ortu: tidak bisa membaca kas kelas', n = 0);
  set local role authenticated;
  select count(*) into n from public.pengumuman where id = 't_p1';           reset role; res := res || pg_temp.cek('Ortu: bisa membaca pengumuman', n = 1);
  set local role authenticated;
  select count(*) into n from public.wali_siswa;                             reset role; res := res || pg_temp.cek('Ortu: hanya melihat tautannya sendiri', n = 1);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'foto-siswa' and name like 't\_s%';
  reset role; res := res || pg_temp.cek('Ortu: hanya bisa membuka foto anaknya', n = 1);
  ok := false;
  begin set local role authenticated;
    insert into public.tabungan (id,sid,tgl,jenis,jml) values ('t_x','t_s1',current_date,'setor',1);
  exception when others then ok := true; end;
  reset role; res := res || pg_temp.cek('Ortu: tidak bisa menambah tabungan', ok);
  set local role authenticated;
  update public.profiles set role = 'admin' where id = a; get diagnostics n = row_count;
  reset role; select role into r from public.profiles where id = a;
  res := res || pg_temp.cek('Ortu: tidak bisa menaikkan perannya sendiri', n = 0 and r = 'ortu');

  -- ===== Viewer =====
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa where id like 't\_s%';            reset role; res := res || pg_temp.cek('Viewer: bisa melihat semua siswa', n = 2);
  ok := false;
  begin set local role authenticated;
    insert into public.kas (id,tgl,jenis,jml,ket) values ('t_k2',current_date,'masuk',1,'x');
  exception when others then ok := true; end;
  reset role; res := res || pg_temp.cek('Viewer: tidak bisa menulis data', ok);

  -- ===== Pending (belum disetujui) =====
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa;                                  reset role; res := res || pg_temp.cek('Pending: tidak melihat data siswa', n = 0);
  set local role authenticated;
  select count(*) into n from public.pengumuman;                             reset role; res := res || pg_temp.cek('Pending: tidak melihat pengumuman', n = 0);

  -- ===== Tanpa login (anon) =====
  ok := false;
  begin set local role anon;
    select count(*) into n from public.siswa; ok := (n = 0);
  exception when others then ok := true; end;
  reset role; res := res || pg_temp.cek('Tanpa login: tidak bisa membaca data', ok);

  -- ===== Aturan saldo di database =====
  ok := false;
  begin insert into public.tabungan (id,sid,tgl,jenis,jml) values ('t_y','t_s1',current_date,'tarik',999999);
  exception when others then ok := true; end;
  res := res || pg_temp.cek('Penarikan melebihi saldo ditolak', ok);

  raise exception E'HASIL UJI KEAMANAN (data uji dibatalkan otomatis):\n%', res;
end $$;
