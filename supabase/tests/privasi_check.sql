-- Uji migrasi 017. Tempel di SQL Editor lalu Run. Bila ada pelanggaran, muncul error berisi jumlahnya (error disengaja).
do $$
declare n int;
begin
  select count(*) into n from public.kas
   where id like 'iu\_%' and ket ~ '^((Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$';
  if n > 0 then raise exception 'GAGAL: % baris kas iuran masih memuat nama siswa', n; end if;
  if not exists (select 1 from pg_trigger where tgname = 'kas_ket_privasi' and not tgisinternal) then
    raise exception 'GAGAL: trigger kas_ket_privasi belum terpasang';
  end if;
  raise exception 'HASIL UJI PRIVASI KAS: LULUS (error ini disengaja agar tidak ada yang tersimpan)';
end $$;
