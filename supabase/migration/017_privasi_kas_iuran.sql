-- Migrasi 017: nama siswa tidak lagi disimpan pada uraian kas turunan iuran (audit #15).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 016. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang. BELUM DIUJI di Postgres: coba di proyek staging lebih dulu, lalu jalankan supabase/tests/privasi_check.sql.
--
-- Masalah: kas.ket pada baris 'iu_*' berbunyi "Iuran mingguan · <Nama> · Mg 2 Nov 2026". RLS kas_siswa mengizinkan akun Siswa membaca
-- seluruh kas (transparansi kas kelas), sehingga lewat API mereka bisa melihat siapa saja yang sudah membayar iuran.
-- Perbaikan:
--   1) Pembersihan data lama: nama dibuang dari uraian baris 'iu_*'.
--   2) Trigger penjaga: setiap INSERT/UPDATE baris 'iu_*' otomatis membuang nama, jadi klien lama atau cache lama pun tidak bisa membocorkannya.
--   3) Aplikasi v2.16+ memasang nama hanya di memori staf (dari tabel iuran + siswa yang memang tidak terbuka bagi akun Siswa).
-- Catatan: catatan kas MANUAL (id bukan 'iu_*') tidak disentuh. Jangan menulis nama siswa di uraian kas manual.

create or replace function public.kas_ket_privasi() returns trigger
language plpgsql as $$
begin
  if new.id like 'iu\_%' then
    new.ket := regexp_replace(coalesce(new.ket, ''), '^((Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$', '\1 · \3');
  end if;
  return new;
end $$;

drop trigger if exists kas_ket_privasi on public.kas;
create trigger kas_ket_privasi before insert or update of ket on public.kas
  for each row execute function public.kas_ket_privasi();

-- Pembersihan data lama. Dijalankan dari SQL Editor (auth.uid() kosong), sehingga lolos penjaga buku besar seperti migrasi 013.
update public.kas
   set ket = regexp_replace(ket, '^((Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$', '\1 · \3')
 where id like 'iu\_%'
   and ket ~ '^((Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$';
