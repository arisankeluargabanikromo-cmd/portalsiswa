-- SekolahHub: uji akses akun siswa (migrasi 010). Jalankan di SQL Editor setelah migrasi 010.
-- Membuat data uji sementara (id berawalan t_ / akun uji.*@test.local) lalu SELALU membatalkannya lewat error di akhir.
-- Hasil ada pada pesan "HASIL UJI AKSES SISWA". Error itu disengaja, data asli tidak berubah.
do $$
declare
  adm uuid := '00000000-0000-4000-8000-0000000000e1';  -- admin uji
  s1  uuid := '00000000-0000-4000-8000-0000000000e2';  -- akun siswa t_s1
  s2  uuid := '00000000-0000-4000-8000-0000000000e3';  -- akun siswa t_s2
  o1  uuid := '00000000-0000-4000-8000-0000000000e4';  -- orang tua (t_s1 + t_s2)
  vw  uuid := '00000000-0000-4000-8000-0000000000e5';  -- viewer
  px  uuid := '00000000-0000-4000-8000-0000000000e6';  -- pending, mengklaim siswa
  py  uuid := '00000000-0000-4000-8000-0000000000e7';  -- pending, klaim berbahaya
  n int; n2 int; res text := ''; ok boolean; msg text;

  -- Jalankan sebagai pengguna (RLS berlaku) / kembali sebagai pemilik.
  procedure_dummy int;
begin
  -- ===== Data uji =====
  insert into auth.users (id, email) values (adm,'uji.adm@test.local'),(s1,'uji.s1@test.local'),(s2,'uji.s2@test.local'),(o1,'uji.o1@test.local'),(vw,'uji.vw@test.local');
  insert into auth.users (id, email, raw_user_meta_data) values
    (px,'uji.px@test.local','{"klaim_jenis":"siswa","klaim_nis":"  UJI-3  "}'::jsonb),
    (py,'uji.py@test.local',('{"klaim_jenis":"admin","klaim_nis":"' || repeat('9', 90) || '"}')::jsonb);
  update public.profiles set role = 'admin' where id = adm;
  update public.profiles set role = 'viewer' where id = vw;
  insert into public.siswa (id,nama,nis,kelas) values ('t_s1','Uji Satu','UJI-1','T'),('t_s2','Uji Dua','UJI-2','T'),('t_s3','Uji Tiga','UJI-3','T');
  insert into public.tabungan (id,sid,tgl,jenis,jml) values ('t_t1','t_s1',current_date,'setor',5000),('t_t2','t_s2',current_date,'setor',7000),('t_t3','t_s1',current_date,'setor',1000);
  insert into public.iuran (id,sid,bulan,jml,tgl) values ('t_i1','t_s1','2026-01',10000,current_date),('t_i2','t_s2','2026-01',10000,current_date);
  insert into public.absensi (id,sid,tgl,st) values ('t_a1','t_s1',current_date,'H'),('t_a2','t_s2',current_date,'S');
  insert into public.kas (id,tgl,jenis,jml,ket) values ('t_k1',current_date,'masuk',1000,'uji');
  insert into public.struktur (id,jab,sid) values ('t_j1','Ketua','t_s2');
  insert into public.voting (id,judul,kand) values ('t_v1','Uji pemilihan','["t_s1","t_s2"]'::jsonb);
  insert into public.aktivitas (id,t,m) values ('t_l1',1,'Uji: menyetorkan Rp 1000 untuk Uji Dua');
  insert into public.pengumuman (id,tgl,judul) values ('t_p1',current_date,'Uji');
  insert into public.agenda (id,tgl,judul) values ('t_g1',current_date,'Uji');
  insert into storage.objects (bucket_id,name) values ('foto-siswa','t_s1/foto-uji.jpg'),('foto-siswa','t_s2/foto-uji.jpg');

  -- ===== Klaim saat mendaftar =====
  select (klaim_jenis = 'siswa' and klaim_nis = 'UJI-3') into ok from public.profiles where id = px;
  res := res || '- klaim jenis & NIS tersimpan (spasi dirapikan): ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select (klaim_jenis is null and length(klaim_nis) = 40) into ok from public.profiles where id = py;
  res := res || '- klaim jenis tak sah diabaikan, NIS dipotong 40 karakter: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select (role = 'pending') into ok from public.profiles where id in (px, py) group by 1 having count(*) = 2;
  res := res || '- klaim TIDAK memberi akses (tetap pending): ' || case when coalesce(ok,false) then 'LULUS' else 'GAGAL' end || E'\n';

  -- ===== Admin: persetujuan terpandu =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_account(s1, 'siswa', array['t_s1']);
  perform public.approve_account(s2, 'siswa', array['t_s2']);
  perform public.approve_account(o1, 'ortu', array['t_s1','t_s2']);
  select count(*) into n from public.wali_siswa where uid in (s1,s2,o1);
  select (count(*) = 4) into ok from public.wali_siswa where uid in (s1,s2,o1);
  res := res || '- approve_account menautkan siswa (1+1) dan orang tua (2): ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select (role = 'siswa' and disetujui_oleh = adm and disetujui_pada is not null) into ok from public.profiles where id = s1;
  res := res || '- jejak persetujuan (oleh & waktu) tercatat: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';

  -- validasi approve_account
  begin perform public.approve_account(px, 'siswa', '{}'); ok := false; exception when others then ok := sqlerrm like '%tepat satu siswa%'; end;
  res := res || '- siswa tanpa tautan ditolak: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'siswa', array['t_s2','t_s3']); ok := false; exception when others then ok := sqlerrm like '%tepat satu siswa%'; end;
  res := res || '- siswa dengan dua tautan ditolak: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'siswa', array['t_s1']); ok := false; exception when others then ok := sqlerrm like '%sudah memiliki akun%'; end;
  res := res || '- satu siswa tidak boleh punya dua akun siswa: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'siswa', array['t_tidak_ada']); ok := false; exception when others then ok := sqlerrm like '%tidak ditemukan%'; end;
  res := res || '- tautan ke siswa yang tidak ada ditolak: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'ortu', '{}'); ok := false; exception when others then ok := sqlerrm like '%minimal satu%'; end;
  res := res || '- orang tua tanpa tautan ditolak: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(adm, 'viewer', '{}'); ok := false; exception when others then ok := sqlerrm like '%sendiri%'; end;
  res := res || '- admin tidak bisa mengubah perannya sendiri: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'superadmin', '{}'); ok := false; exception when others then ok := sqlerrm like '%tidak dikenal%'; end;
  res := res || '- peran tak dikenal ditolak: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  perform public.approve_account(px, 'siswa', array['t_s3']);   -- px disetujui sebagai siswa t_s3
  reset role;

  -- ===== Akun siswa s1 (siswa t_s1) =====
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*), count(*) filter (where id = 't_s1') into n, n2 from public.siswa where id like 't\_%';
  res := res || '- siswa s1 hanya melihat DIRINYA di tabel siswa (1 baris): ' || case when n = 1 and n2 = 1 then 'LULUS' else 'GAGAL (' || n || ')' end || E'\n';
  select count(*) into n from public.tabungan where id like 't\_%' and sid <> 't_s1';
  select count(*) into n2 from public.tabungan where id like 't\_%' and sid = 't_s1';
  res := res || '- s1 hanya melihat tabungannya (2 baris miliknya, 0 milik lain): ' || case when n = 0 and n2 = 2 then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.iuran where id like 't\_%' and sid <> 't_s1';
  select count(*) into n2 from public.absensi where id like 't\_%' and sid <> 't_s1';
  res := res || '- s1 tidak melihat iuran/absensi siswa lain: ' || case when n = 0 and n2 = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.kas where id like 't\_%';
  res := res || '- s1 dapat MEMBACA kas kelas (migrasi 011): ' || case when n = 1 then 'LULUS' else 'GAGAL (jalankan migrasi 011)' end || E'\n';
  select count(*) into n from public.struktur where id like 't\_%'; select count(*) into n2 from public.voting where id like 't\_%';
  res := res || '- s1 dapat MEMBACA struktur kelas (011) tetapi TIDAK membaca tabel voting langsung (015, suara rahasia): ' || case when n = 1 and n2 = 0 then 'LULUS' else 'GAGAL (jalankan migrasi 015)' end || E'\n';
  select count(*), count(*) filter (where id = 't_s2') into n, n2 from public.rekan_kelas() where id like 't\_%';
  res := res || '- s1 melihat NAMA teman sekelas lewat rekan_kelas() (3 nama, termasuk t_s2): ' || case when n = 3 and n2 = 1 then 'LULUS' else 'GAGAL (' || n || ')' end || E'\n';
  begin
    insert into public.kas (id,tgl,jenis,jml,ket) values ('t_k9',current_date,'masuk',1,'coba');
    res := res || '- s1 tidak bisa menulis kas: GAGAL' || E'\n';
  exception when others then
    res := res || '- s1 tidak bisa menulis kas: LULUS' || E'\n';
  end;
  update public.voting set suara = '{"t_s1":"t_s2"}'::jsonb where id = 't_v1'; get diagnostics n = row_count;
  res := res || '- s1 tidak bisa menulis suara langsung ke tabel voting: ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  -- ===== Voting per akun (migrasi 015) =====
  begin perform public.beri_suara('t_v1', 't_s3'); ok := false; exception when others then ok := sqlerrm like '%bukan kandidat%'; end;
  res := res || '- s1 tidak bisa memilih bukan kandidat: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select public.beri_suara('t_v1', 't_s2') ->> 'ok' = 'true' into ok;
  res := res || '- s1 dapat memberi suara atas nama akunnya: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.beri_suara('t_v1', 't_s1'); ok := false; exception when others then ok := sqlerrm like '%sudah memberikan suara%'; end;
  res := res || '- s1 tidak bisa memilih dua kali atau mengubah suara: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select (r.j -> 0 ->> 'saya' = 't_s2' and r.j -> 0 -> 'hitung' ->> 't_s2' = '1' and (r.j -> 0 ->> 'total')::int = 1 and not (r.j -> 0 ? 'suara')) into ok from (select public.voting_siswa() as j) r;
  res := res || '- s1 melihat rekap dan pilihannya sendiri, bukan daftar siapa memilih siapa: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.aktivitas where id like 't\_%';
  res := res || '- s1 tidak melihat riwayat aktivitas (memuat nama siswa lain): ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.pengumuman where id like 't\_%'; select count(*) into n2 from public.agenda where id like 't\_%';
  res := res || '- s1 melihat pengumuman & agenda: ' || case when n = 1 and n2 = 1 then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.pengaturan;
  res := res || '- s1 membaca identitas sekolah: ' || case when n = 1 then 'LULUS' else 'GAGAL' end || E'\n';
  select count(*) into n from public.wali_siswa;
  res := res || '- s1 hanya melihat tautannya sendiri: ' || case when n = 1 then 'LULUS' else 'GAGAL (' || n || ')' end || E'\n';
  select count(*) into n from public.profiles;
  res := res || '- s1 hanya melihat profil akunnya sendiri: ' || case when n = 1 then 'LULUS' else 'GAGAL (' || n || ')' end || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'foto-siswa' and name like 't\_%';
  select count(*) into n2 from storage.objects where bucket_id = 'foto-siswa' and name like 't_s2/%';
  res := res || '- s1 hanya melihat foto miliknya: ' || case when n = 1 and n2 = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  -- tidak boleh menulis
  begin insert into public.tabungan (id,sid,tgl,jenis,jml) values ('t_x','t_s1',current_date,'setor',1); ok := false; exception when others then ok := true; end;
  res := res || '- s1 TIDAK dapat menambah tabungan: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  update public.siswa set nama = 'Diubah' where id = 't_s1'; get diagnostics n = row_count;
  res := res || '- s1 TIDAK dapat mengubah data siswa: ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  delete from public.tabungan where id = 't_t1'; get diagnostics n = row_count;
  res := res || '- s1 TIDAK dapat menghapus tabungan: ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  update public.profiles set role = 'admin' where id = s1; get diagnostics n = row_count;
  res := res || '- s1 TIDAK dapat menaikkan perannya sendiri: ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  begin insert into public.wali_siswa (uid, sid) values (s1, 't_s2'); ok := false; exception when others then ok := true; end;
  res := res || '- s1 TIDAK dapat menautkan dirinya ke siswa lain: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin perform public.approve_account(px, 'admin', '{}'); ok := false; exception when others then ok := sqlerrm like '%Hanya admin%'; end;
  res := res || '- s1 TIDAK dapat memanggil approve_account: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;
  update public.voting set suara = '{"palsu":"t_s1"}'::jsonb where id = 't_v1';
  select count(*) into n from public.voting where id = 't_v1' and suara = jsonb_build_object('t_s1','t_s2');
  res := res || '- penulisan langsung ke kolom suara (admin/pemulihan) diabaikan trigger: ' || case when n = 1 then 'LULUS' else 'GAGAL (jalankan migrasi 015)' end || E'\n';
  update public.voting set open = false where id = 't_v1';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.beri_suara('t_v1', 't_s1'); ok := false; exception when others then ok := sqlerrm like '%sudah ditutup%'; end;
  res := res || '- suara ditolak setelah pemilihan ditutup: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;
  update public.voting set open = true where id = 't_v1';
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.beri_suara('t_v1', 't_s1'); ok := false; exception when others then ok := sqlerrm like '%Hanya akun Siswa%'; end;
  res := res || '- orang tua tidak dapat memberi suara: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;

  -- ===== Akun siswa baru px (t_s3) dan orang tua o1 =====
  perform set_config('request.jwt.claims', json_build_object('sub', px, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa where id like 't\_%'; select count(*) into n2 from public.siswa where id = 't_s3';
  res := res || '- px (disetujui lewat klaim) hanya melihat t_s3: ' || case when n = 1 and n2 = 1 then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa where id like 't\_%';
  res := res || '- orang tua o1 tetap melihat 2 anaknya: ' || case when n = 2 then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', vw, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa where id like 't\_%';
  res := res || '- viewer tetap melihat seluruh kelas (3 siswa): ' || case when n = 3 then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;

  -- ===== Pencabutan & penegakan di tingkat tabel =====
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_account(s1, 'pending', '{}');
  reset role;
  select count(*) into n from public.wali_siswa where uid = s1;
  res := res || '- pencabutan (pending) menghapus tautan: ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.siswa where id like 't\_%'; select count(*) into n2 from public.tabungan where id like 't\_%';
  res := res || '- akun yang dicabut tidak melihat data apa pun: ' || case when n = 0 and n2 = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  reset role;
  update public.profiles set role = 'viewer' where id = s2;   -- jalur lama (tanpa RPC)
  select count(*) into n from public.wali_siswa where uid = s2;
  res := res || '- ganti peran lewat UPDATE langsung ikut menghapus tautan (trigger): ' || case when n = 0 then 'LULUS' else 'GAGAL' end || E'\n';
  begin update public.profiles set role = 'siswa' where id = o1; ok := false; exception when others then ok := sqlerrm like '%satu siswa%'; end;
  res := res || '- ortu dengan 2 anak tidak bisa dijadikan siswa: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin insert into public.wali_siswa (uid, sid) values (vw, 't_s1'); ok := false; exception when others then ok := sqlerrm like '%orang tua atau siswa%'; end;
  res := res || '- akun viewer tidak dapat ditautkan: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';
  begin insert into public.wali_siswa (uid, sid) values (px, 't_s2'); ok := false; exception when others then ok := sqlerrm like '%satu siswa%'; end;
  res := res || '- akun siswa tidak dapat memiliki dua tautan: ' || case when ok then 'LULUS' else 'GAGAL' end || E'\n';

  raise exception E'HASIL UJI AKSES SISWA\n%', res;
end $$;
