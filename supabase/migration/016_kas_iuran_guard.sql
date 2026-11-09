-- Migrasi 016: tutup celah baris kas turunan iuran ('iu_*').
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 013. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang.
--
-- Masalah (migrasi 013): trigger ledger_kas melewati SEMUA pemeriksaan untuk baris yang id-nya diawali 'iu_' (turunan iuran).
-- Karena id ditentukan klien, akun pengurus dapat menyisipkan catatan kas dengan id 'iu_xxx' untuk menghindari batas saldo kas,
-- tutup buku, dan penanda petugas, lalu mengubah atau menghapusnya kembali.
-- Perbaikan: baris 'iu_<id iuran>' hanya sah bila ada pembayaran iuran mingguan dengan id tersebut, berjenis 'masuk',
-- dan bernilai sama persis dengan iuran itu (pembatalan iuran = nilai negatif, sama seperti di tabel iuran).
-- Konteks sistem (SQL Editor / service role, auth.uid() kosong) tetap dilewati. Aplikasi menyisipkan iuran lebih dulu daripada kas
-- (urutan tabel di data.js), sehingga alur normal tidak terpengaruh.
create or replace function public.ledger_kas() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.kas%rowtype; i public.iuran%rowtype; sal bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    if old.id like 'iu\_%' then
      if new.id <> old.id then raise exception 'ID catatan kas turunan iuran tidak boleh diubah'; end if;
      if not sys then
        select * into i from public.iuran where id = substr(new.id, 4);
        if not found or i.minggu is null or new.jenis <> 'masuk' or new.jml <> i.jml then
          raise exception 'Catatan kas turunan iuran harus cocok dengan pembayaran iuran mingguan asalnya';
        end if;
      end if;
      return new;   -- turunan iuran: disinkronkan aplikasi
    end if;
    raise exception 'Catatan kas bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if old.id like 'iu\_%' or sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Catatan kas tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  new.waktu := coalesce(new.waktu, now());
  if new.id like 'iu\_%' then
    if not sys then
      select * into i from public.iuran where id = substr(new.id, 4);
      if not found or i.minggu is null or new.jenis <> 'masuk' or new.jml <> i.jml then
        raise exception 'Catatan kas turunan iuran harus cocok dengan pembayaran iuran mingguan asalnya';
      end if;
    end if;
    new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('IUR', new.tgl));
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('kas'));
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('KAS', new.tgl));
  select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) into sal from public.kas;
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
    if new.jenis = 'keluar' and sal - new.jml < 0 then raise exception 'Saldo kas tidak cukup. Saldo kas saat ini Rp %', sal; end if;
  else
    select * into o from public.kas where id = new.rev_of;
    if not found then raise exception 'Catatan kas asal pembatalan tidak ditemukan'; end if;
    if o.id like 'iu\_%' then raise exception 'Catatan ini berasal dari Iuran. Batalkan pembayarannya di menu Iuran'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.jenis <> new.jenis or new.jml <> -o.jml then raise exception 'Data pembatalan tidak cocok dengan catatan asal'; end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan catatan kas lintas hari hanya dapat dilakukan admin';
    end if;
    if new.jenis = 'masuk' and sal + new.jml < 0 then raise exception 'Saldo kas tidak cukup untuk membatalkan pemasukan ini (dana sudah dipakai)'; end if;
  end if;
  return new;
end $$;
-- (trigger kas_ledger dari migrasi 013 otomatis memakai versi fungsi terbaru)
