-- Migrasi 014: nama aplikasi yang dapat diubah (default "SekolahHub") + data merek publik untuk layar masuk.
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor. Instalasi baru: sudah termasuk di schema.sql.
-- Opsional: tanpa migrasi ini aplikasi tetap berjalan memakai nama "SekolahHub"; menu Pengaturan > Umum > Nama aplikasi disembunyikan.
-- Sebaiknya migrasi 007 (logo) dan 008 (instansi) sudah dijalankan agar kop sekolah lengkap.
alter table public.pengaturan
  add column if not exists app_nama text default 'SekolahHub';

-- Layar masuk perlu menampilkan logo dan kop sekolah SEBELUM pengguna login, termasuk di perangkat yang baru dipakai.
-- Fungsi ini hanya mengembalikan 6 data non-sensitif (nama aplikasi, nama sekolah, path logo, instansi, alamat, telepon).
-- Logo sendiri sudah berada di bucket publik. Data siswa dan keuangan TIDAK ikut terbuka.
-- Dibaca lewat to_jsonb agar tetap berjalan walau migrasi 007/008 belum dijalankan (kolom yang tidak ada menjadi null).
create or replace function public.brand_publik()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'app_nama', nullif(j->>'app_nama', ''),
    'sekolah',  j->>'sekolah',
    'logo',     coalesce(j->>'logo', ''),
    'instansi', coalesce(j->>'instansi', ''),
    'alamat',   coalesce(j->>'alamat', ''),
    'telp',     coalesce(j->>'telp', ''))
  from (select to_jsonb(p) as j from public.pengaturan p where p.id = 1) x
$$;
revoke all on function public.brand_publik() from public;
grant execute on function public.brand_publik() to anon, authenticated;

-- Ubah nama sekali di sini, atau nanti lewat Pengaturan > Umum > Nama aplikasi:
-- update public.pengaturan set app_nama = 'Portal SDN 1 Contoh' where id = 1;
