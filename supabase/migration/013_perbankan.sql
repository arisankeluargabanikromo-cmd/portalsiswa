-- Migrasi 013: standar perbankan untuk menu Keuangan (Tabungan, Iuran, Kas Kelas).
-- Untuk database yang sudah berjalan: jalankan sekali di SQL Editor SETELAH migrasi 012. Instalasi baru: sudah termasuk di akhir schema.sql.
-- Aman dijalankan ulang.
--
-- Prinsip yang ditegakkan DI DATABASE (bukan hanya di tampilan):
--   1. Buku besar permanen    : transaksi tabungan, pembayaran iuran, dan catatan kas manual tidak bisa diubah atau dihapus
--                               dari aplikasi. Kesalahan dikoreksi dengan PEMBATALAN (reversal): baris lawan bernilai negatif
--                               yang menunjuk transaksi asal lewat kolom rev_of. Satu transaksi hanya bisa dibatalkan satu kali.
--   2. Nomor referensi unik   : setiap transaksi punya ref (TRX/IUR/KAS + yymmdd + 8 karakter acak), waktu pembukuan dari server,
--                               dan petugas (email disamarkan). Diisi server bila klien tidak mengirim.
--   3. Tutup buku             : pengaturan.tutup_buku. Transaksi bertanggal <= tutup buku ditolak untuk semua peran.
--                               Koreksi atas periode tertutup dibukukan sebagai pembatalan bertanggal hari ini.
--   4. Saldo mengendap        : pengaturan.saldo_min. Penarikan tidak boleh menyisakan saldo di bawah nilai ini
--                               (kecuali layanan 'Tutup rekening' yang menarik seluruh saldo).
--   5. Kas tidak boleh minus  : pengeluaran kas dan pembatalan pemasukan ditolak bila membuat saldo kas negatif.
--   6. Pembatalan lintas hari : hanya admin. Pengurus hanya boleh membatalkan transaksi yang dibukukan hari yang sama.
--   7. Hapus/ubah             : UPDATE ditolak untuk semua. DELETE hanya admin (untuk reset, pemulihan, urungkan impor)
--                               atau lewat cascade penghapusan siswa. Baris kas 'iu_*' adalah turunan iuran dan tetap
--                               disinkronkan otomatis oleh aplikasi.

-- ---------- Kolom ----------
alter table public.tabungan
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text;
alter table public.iuran
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text,
  add column if not exists created_by uuid default auth.uid();
alter table public.kas
  add column if not exists ref text, add column if not exists rev_of text, add column if not exists kanal text default '',
  add column if not exists waktu timestamptz, add column if not exists petugas text,
  add column if not exists kat text default '', add column if not exists created_by uuid default auth.uid();
alter table public.pengaturan
  add column if not exists tutup_buku date,
  add column if not exists saldo_min bigint default 0,
  add column if not exists limit_otor bigint default 0;

-- ---------- Isi data lama (sebelum trigger dipasang) ----------
update public.tabungan set ref = 'TRX' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;
update public.iuran    set ref = 'IUR' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;
update public.kas k set ref = i.ref, kat = 'Iuran', waktu = coalesce(k.created_at, k.tgl::timestamptz)
  from public.iuran i where k.ref is null and k.id = 'iu_' || i.id;
update public.kas set ref = 'KAS' || to_char(tgl, 'YYMMDD') || '-' || upper(substr(md5(id), 1, 10)), waktu = coalesce(created_at, tgl::timestamptz) where ref is null;

-- ---------- Batasan ----------
alter table public.tabungan drop constraint if exists tabungan_jml_check;
alter table public.tabungan add constraint tabungan_jml_check check (jml <> 0);
alter table public.iuran drop constraint if exists iuran_jml_check;
alter table public.iuran add constraint iuran_jml_check check (jml <> 0);
alter table public.kas drop constraint if exists kas_jml_check;
alter table public.kas add constraint kas_jml_check check (jml <> 0);
alter table public.pengaturan drop constraint if exists pengaturan_bank_check;
alter table public.pengaturan add constraint pengaturan_bank_check check (coalesce(saldo_min, 0) >= 0 and coalesce(limit_otor, 0) >= 0);

create unique index if not exists tabungan_ref_uq on public.tabungan (ref) where ref is not null;
create unique index if not exists tabungan_rev_uq on public.tabungan (rev_of) where rev_of is not null;
create unique index if not exists iuran_ref_uq on public.iuran (ref) where ref is not null;
create unique index if not exists iuran_rev_uq on public.iuran (rev_of) where rev_of is not null;
create unique index if not exists kas_ref_uq on public.kas (ref) where ref is not null;
create unique index if not exists kas_rev_uq on public.kas (rev_of) where rev_of is not null;

-- ---------- Fungsi bantu ----------
create or replace function public.ledger_ref(p text, d date) returns text language sql volatile as
$$ select p || to_char(d, 'YYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) $$;

-- Email petugas disamarkan agar tidak terbaca akun siswa/orang tua yang boleh melihat barisnya.
create or replace function public.petugas_label() returns text
language sql stable security definer set search_path = public as
$$ select left(split_part(email, '@', 1), 2) || '***@' || split_part(email, '@', 2) from public.profiles where id = auth.uid() $$;

-- Tanggal transaksi: tidak boleh melewati tutup buku, tidak boleh di masa depan (toleransi 1 hari untuk zona WITA/WIT).
-- Konteks sistem (SQL Editor, service role: auth.uid() kosong) dilewati.
create or replace function public.ledger_open(d date) returns void
language plpgsql stable security definer set search_path = public as $$
declare tb date;
begin
  if auth.uid() is null then return; end if;
  if d > (now() at time zone 'Asia/Jakarta')::date + 1 then raise exception 'Tanggal transaksi tidak boleh di masa depan'; end if;
  select tutup_buku into tb from public.pengaturan where id = 1;
  if tb is not null and d <= tb then
    raise exception 'Periode sampai % sudah ditutup (tutup buku). Transaksi harus bertanggal setelahnya.', to_char(tb, 'DD-MM-YYYY');
  end if;
end $$;

-- ---------- Tabungan ----------
create or replace function public.ledger_tab() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.tabungan%rowtype; sal bigint; mn bigint := 0;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Buku tabungan bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Transaksi tabungan tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  perform pg_advisory_xact_lock(hashtext('tab:' || new.sid));
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('TRX', new.tgl));
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  else
    select * into o from public.tabungan where id = new.rev_of;
    if not found then raise exception 'Transaksi asal pembatalan tidak ditemukan'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.sid <> new.sid or o.jenis <> new.jenis or new.jml <> -o.jml then raise exception 'Data pembatalan tidak cocok dengan transaksi asal'; end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan transaksi lintas hari hanya dapat dilakukan admin';
    end if;
  end if;
  select coalesce(sum(case when jenis = 'setor' then jml else -jml end), 0) into sal from public.tabungan where sid = new.sid;
  if new.jenis = 'tarik' and new.rev_of is null then
    if coalesce(new.kanal, '') <> 'Tutup rekening' then select coalesce(saldo_min, 0) into mn from public.pengaturan where id = 1; end if;
    if sal - new.jml < mn then
      raise exception '%', case when mn > 0 then 'Saldo tidak cukup. Saldo mengendap minimal Rp ' || mn else 'Saldo tidak cukup' end;
    end if;
  elsif new.jenis = 'setor' and new.rev_of is not null and sal + new.jml < 0 then
    raise exception 'Saldo tidak cukup untuk membatalkan setoran ini (dana sudah ditarik)';
  end if;
  return new;
end $$;
drop trigger if exists tabungan_ledger on public.tabungan;
create trigger tabungan_ledger before insert or update or delete on public.tabungan
  for each row execute function public.ledger_tab();

-- ---------- Iuran ----------
create or replace function public.ledger_iuran() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.iuran%rowtype; ks bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Catatan iuran bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Pembayaran iuran tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  perform public.ledger_open(new.tgl);
  new.waktu := now();
  new.petugas := public.petugas_label();
  new.ref := coalesce(nullif(btrim(new.ref), ''), public.ledger_ref('IUR', new.tgl));
  if new.rev_of is null then
    if new.jml <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  else
    select * into o from public.iuran where id = new.rev_of;
    if not found then raise exception 'Pembayaran asal pembatalan tidak ditemukan'; end if;
    if o.rev_of is not null then raise exception 'Pembatalan tidak dapat dibatalkan lagi'; end if;
    if o.sid <> new.sid or o.bulan <> new.bulan or o.minggu is distinct from new.minggu or new.jml <> -o.jml then
      raise exception 'Data pembatalan tidak cocok dengan pembayaran asal';
    end if;
    if not sys and r <> 'admin' and (coalesce(o.waktu, o.created_at) at time zone 'Asia/Jakarta')::date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'Pembatalan pembayaran lintas hari hanya dapat dilakukan admin';
    end if;
    if o.minggu is not null then   -- pembayaran mingguan masuk ke Kas Kelas; dananya harus masih ada
      select coalesce(sum(case when jenis = 'masuk' then jml else -jml end), 0) into ks from public.kas;
      if ks + new.jml < 0 then raise exception 'Saldo Kas Kelas tidak cukup untuk membatalkan pembayaran ini (dana sudah dipakai)'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists iuran_ledger on public.iuran;
create trigger iuran_ledger before insert or update or delete on public.iuran
  for each row execute function public.ledger_iuran();

-- ---------- Kas kelas ----------
create or replace function public.ledger_kas() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.kas%rowtype; sal bigint;
        r text := public.my_role(); sys boolean := auth.uid() is null;
begin
  if tg_op = 'UPDATE' then
    if old.id like 'iu\_%' then return new; end if;   -- turunan iuran: disinkronkan aplikasi
    raise exception 'Catatan kas bersifat permanen dan tidak dapat diubah. Gunakan pembatalan (reversal).';
  elsif tg_op = 'DELETE' then
    if old.id like 'iu\_%' or sys or pg_trigger_depth() > 1 or r = 'admin' then return old; end if;
    raise exception 'Catatan kas tidak boleh dihapus. Gunakan pembatalan (reversal).';
  end if;
  new.waktu := coalesce(new.waktu, now());
  if new.id like 'iu\_%' then
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
drop trigger if exists kas_ledger on public.kas;
create trigger kas_ledger before insert or update or delete on public.kas
  for each row execute function public.ledger_kas();

-- ---------- Pengaturan: tutup buku ----------
create or replace function public.pengaturan_bank_guard() returns trigger language plpgsql as $$
begin
  if new.tutup_buku is not null and new.tutup_buku > (now() at time zone 'Asia/Jakarta')::date + 1 then
    raise exception 'Tanggal tutup buku tidak boleh di masa depan';
  end if;
  return new;
end $$;
drop trigger if exists pengaturan_bank_trg on public.pengaturan;
create trigger pengaturan_bank_trg before insert or update on public.pengaturan
  for each row execute function public.pengaturan_bank_guard();
