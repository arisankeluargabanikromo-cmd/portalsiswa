# SekolahHub

Aplikasi grup sekolah dan tabungan siswa. Frontend statis (HTML, CSS, JS), database dan login di **Supabase**, kode di **GitHub**, hosting di **Vercel**.

## Struktur folder

```
sekolahhub/
├─ public/                 ← folder yang dipublikasikan
│  ├─ index.html
│  ├─ css/style.css        ← tampilan desktop + SEMUA token warna tema terang & gelap (glassmorphism)
│  ├─ css/mobile.css       ← tampilan mobile gaya Android (Material 3), aktif di layar ≤ 860px
│  ├─ css/idcard.css       ← tab Kartu ID (antarmuka, memakai token tema) + desain kartu CR80 dan aturan cetak
│  ├─ js/app.js            ← logika aplikasi (UI, tabungan, voting, laporan)
│  ├─ js/data.js           ← lapisan Supabase (login, sinkronisasi, realtime)
│  ├─ js/theme.js          ← pemilih tema terang / gelap / ikuti perangkat (dimuat di <head>)
│  ├─ js/pengaturan.js     ← halaman Pengaturan: identitas + logo, hak akses, data & cadangan, akun, reset
│  ├─ js/import.js         ← impor data dari Excel (.xlsx) / CSV + template
│  ├─ js/idcard.js         ← kartu ID siswa: pembuat QR, desain kartu, galeri, sistem cetak A4 / CR80
│  ├─ vendor/fflate.min.js ← pustaka zip (MIT) untuk membaca/menulis .xlsx
│  ├─ js/auth.js           ← layar masuk / daftar / menunggu persetujuan
│  ├─ js/mobile.js         ← navigasi bawah, app bar, FAB, halaman Menu, tabel jadi kartu
│  ├─ manifest.webmanifest ← agar bisa dipasang ke layar utama Android (PWA)
│  ├─ sw.js                ← service worker (jaringan dulu, cache sebagai cadangan)
│  ├─ icons/               ← ikon aplikasi (192, 512, maskable)
│  ├─ js/config.js         ← URL dan anon key Supabase
│  └─ vendor/supabase.js   ← supabase-js 2.45.4 (di-host sendiri)
├─ supabase/schema.sql     ← tabel, aturan keamanan (RLS), peran
├─ supabase/migrations/    ← migrasi untuk database yang sudah berjalan (006 = tema per akun, 007 = logo & identitas)
├─ supabase/tests/         ← skrip uji keamanan (RLS)
├─ scripts/gen-config.js   ← menulis config.js dari environment variable
├─ vercel.json             ← build dan header keamanan
└─ package.json
```

## 1. Siapkan Supabase

1. Buat project baru di supabase.com.
2. Buka **SQL Editor → New query**, tempel isi `supabase/schema.sql`, lalu **Run**.
3. Buka **Project Settings → API**, salin **Project URL** dan **anon public key**.
4. Buka **Authentication → Providers → Email** (aktif). Untuk sekolah, disarankan mengaktifkan konfirmasi email.

## 2. Jalankan di komputer sendiri

1. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `public/js/config.js`.
2. Jalankan `npx serve public`, lalu buka alamat yang tampil.
3. Daftar akun pertama. **Akun pertama otomatis menjadi admin.**

## 3. GitHub dan Vercel

1. Buat repository di GitHub, lalu push seluruh isi folder ini.
2. Di vercel.com pilih **Add New → Project**, impor repository tersebut.
3. Framework Preset: **Other**. Build dan output sudah diatur oleh `vercel.json`.
4. Tambahkan **Environment Variables**: `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (lihat `.env.example`).
5. **Deploy**. Setelah dapat domain, tambahkan domain itu di Supabase pada **Authentication → URL Configuration → Site URL**.

## Fitur

- **Top bar:** pencarian global (tekan `/` atau Ctrl+K) untuk siswa, menu, dan aksi; tombol **Tambah** untuk aksi cepat; **notifikasi** (siswa belum menabung, iuran belum lunas, agenda hari ini dan besok, ulang tahun siswa, pengumuman baru, pemilihan yang dibuka); indikator status penyimpanan; dan menu akun.
- **Dasbor bergaya layar data:** tiga kolom dengan cincin distribusi tabungan per kelas, radar kesehatan kelas, grafik area halus setoran vs penarikan (6 atau 12 bulan), lima bulan terbaik, tiga indikator cincin (kehadiran, iuran, partisipasi menabung), status iuran, dan peringkat saldo. Grafik juga ada di profil siswa, portal orang tua, kas, iuran, dan laporan. Semua dibuat dengan SVG murni tanpa pustaka tambahan.
- **Tabungan:** setoran, penarikan, setoran massal per kelas, buku tabungan, bukti setoran yang bisa dicetak, dan target tabungan per siswa.
- **Iuran:** tabel pembayaran iuran per siswa per bulan. Nominal iuran diatur di Pengaturan.
- **Absensi:** kehadiran harian per kelas (Hadir, Sakit, Izin, Alpa) dengan rekap bulanan dan ringkasan di profil siswa.
- **Kas kelas, agenda, pengumuman, voting, struktur kelas, laporan** (bisa dicetak atau diekspor CSV), dan **riwayat aktivitas**.
- **Profil siswa** bergaya media sosial dengan data lengkap, foto, dan sampul.
- **Kartu ID siswa** (tab *Kartu ID* di Data Siswa): kartu pelajar berfoto ukuran CR80 dengan kode QR, siap cetak. Lihat bagian *Kartu ID siswa*.
- **Pengingat WhatsApp:** daftar siswa yang belum menabung atau belum lunas iuran bulan ini, lengkap dengan tombol kirim yang membuka WhatsApp dengan pesan terisi. Isi pesan bisa diubah di Pengaturan. Bukti setoran juga bisa dikirim ke wali.
- **Ekspor CSV** untuk data siswa, transaksi, dan rekap tabungan.

## Tampilan mobile (gaya Gojek)

Di layar ≤ 860px aplikasi tampil seperti aplikasi Android native bergaya Gojek. Desktop tidak berubah. Warna **diwarisi langsung dari token di `style.css`** (gelap + aksen teal, sama dengan desktop), jadi mengganti `--pr`, `--bg`, dll. di `style.css` otomatis mengubah desktop dan mobile sekaligus.

| Elemen | Perilaku |
|---|---|
| **Navigasi bawah** | Hanya 3 menu. Staf: Beranda, Aktivitas, Akun. Orang tua: Beranda, Info, Akun. |
| **Beranda** | Header teal + pencarian, kartu saldo dengan 4 aksi cepat (bisa disembunyikan dengan ikon mata), grid layanan, carousel Info & agenda, lalu ringkasan, daftar yang perlu ditindak, dan analitik. |
| **Grid layanan** | Maksimal 7 layanan + tombol **Lainnya**. Ketuk **Atur** (di Beranda atau di Akun) untuk menambah (+) atau menghapus (−) layanan. Pilihan tersimpan di perangkat per peran. Badge merah muncul pada Pengingat dan Pengumuman. |
| **Halaman dalam** | App bar putih dengan tombol kembali. Aksi utama halaman (mis. Catat transaksi) menjadi tombol FAB teal. |
| **Form** | Bottom sheet dengan tombol simpan yang selalu terlihat. |
| **Tabel** | Daftar kartu. Absensi memakai empat chip status. Matriks iuran bisa digeser dengan kolom nama menempel. |

**Pasang ke layar utama:** buka situs di Chrome Android, menu titik tiga, **Tambahkan ke layar utama**. Aplikasi terbuka layar penuh tanpa bilah browser (butuh HTTPS, otomatis di Vercel).

Menambah layanan baru: tambahkan satu entri di `NAV` pada `app.js`. Grid dan sheet **Semua layanan** mengambilnya otomatis. Warna ikon layanan di `COL` memakai token warna yang sama dan nama pendek di `SHORT` pada `mobile.js`.

## Portal orang tua

Orang tua mendaftar sendiri dari halaman login. Admin membuka menu **Pengguna**, mengubah peran akun itu menjadi `ortu`, lalu menekan **Atur** untuk menautkan satu atau lebih anak. Orang tua hanya melihat saldo, iuran, kehadiran, dan transaksi anaknya sendiri, ditambah pengumuman dan agenda. Pembatasan ini dijaga oleh Row Level Security di database, jadi orang tua tidak bisa membuka data siswa lain walau memakai alat selain aplikasi ini.

## Foto tidak tampil setelah deploy

Gejala klasik: foto tampil di localhost tetapi kosong di Vercel. Penyebabnya hampir selalu **Content-Security-Policy** di `vercel.json`: header itu hanya berlaku di Vercel, dan `img-src` harus memuat `https://*.supabase.co` karena foto disajikan dari Supabase Storage lewat URL bertanda tangan. Pastikan `vercel.json` versi terbaru ter-deploy, lalu bersihkan cache aplikasi.

Untuk mengetahui penyebab pastinya tanpa membuka console, buka *Pengaturan > Data > Tes tampilan foto*. Alat ini membuat URL foto, memeriksa respons server, dan mendeteksi pelanggaran CSP, lalu menyebut langkah perbaikannya. Bila foto gagal dimuat karena alasan apa pun, avatar kini kembali menampilkan inisial dan sampul menampilkan gradien (bukan lingkaran/area kosong).

## Foto dan kinerja

Foto profil dan sampul disimpan di **Supabase Storage** (bucket privat `foto-siswa`, maksimal 1 MB per file, hanya JPEG). Di database hanya tersimpan nama file, jadi data siswa tetap ringan. Foto diakses lewat URL bertanda tangan yang berlaku 24 jam, dan orang tua hanya bisa membuka foto anaknya. Foto lama yang masih tersimpan langsung di database bisa dipindahkan lewat tombol di **Pengaturan**. Pembaruan realtime hanya memuat ulang tabel yang berubah.

## Kartu ID siswa

Buka **Data Siswa → tab Kartu ID**. Kartu juga bisa dibuka per siswa lewat tombol **Kartu** di tabel dan **Kartu ID** di profil siswa. Tidak perlu migrasi database.

**Isi kartu**

| Sisi | Isi |
|---|---|
| Depan | Logo dan nama sekolah, foto siswa (kembali ke inisial bila foto kosong atau gagal dimuat), nama, kelas, NIS, NISN, tahun ajaran |
| Belakang | Kode QR berisi NIS, tempat/tanggal lahir, jenis kelamin, golongan darah, alamat, kontak wali (tiga yang terakhir bisa dimatikan), keterangan bila kartu ditemukan (alamat dan telepon sekolah), nama kepala sekolah dengan ruang tanda tangan |

Data diambil dari data siswa dan *Pengaturan > Umum* (logo, nama sekolah, tahun ajaran, kepala sekolah, alamat, telepon). Karena itu isi lengkap lebih dulu bila ingin sisi belakang terisi penuh. Nama panjang mengecil otomatis dan membungkus hingga tiga baris.

**Tampilan:** enam pilihan warna, orientasi potret atau lanskap, pratinjau depan atau belakang, dan pilihan data di sisi belakang. Pilihan disimpan per perangkat (`localStorage`, kunci `sh.idcard`). Pencarian, saringan kelas, dan saringan **Belum ada foto** memudahkan memeriksa kelengkapan sebelum mencetak. Tombol cetak berbunyi *Cetak semua* atau *Cetak terpilih* sesuai pilihan.

**Mencetak** (hanya admin dan pengurus; peran lain bisa melihat pratinjau):

| Media | Hasil |
|---|---|
| Kertas A4 (potong manual) | Potret 9 kartu per lembar (3 x 3), lanskap 10 kartu (2 x 5), dengan garis potong tipis. Cocok untuk dilaminasi |
| Printer kartu PVC (CR80) | Satu kartu per halaman seukuran kartu (54 x 85,6 mm), untuk printer kartu (Evolis, Zebra, HiTi, dan sejenisnya) |

Sisi yang dicetak: depan dan belakang, depan saja, atau belakang saja. Pada A4, sisi belakang **sudah dicerminkan** agar pas dengan sisi depan saat dicetak bolak-balik (pilih *dua sisi, balik pada sisi panjang*). Siswa tanpa foto bisa dilewati otomatis (bawaan: dilewati). Setiap pencetakan dicatat di *Aktivitas*.

Pengaturan di jendela cetak peramban: skala **100%**, margin **Tidak ada**, aktifkan **Grafik latar belakang**. Hasil bisa disimpan sebagai PDF untuk dikirim ke percetakan.

**Catatan teknis**

- Kode QR dibuat oleh `idcard.js` sendiri (mode byte, koreksi kesalahan M, versi 1 sampai 6) tanpa pustaka luar. Isinya hanya NIS, tanpa data pribadi lain, sehingga bisa dipakai untuk pemindaian absensi di kemudian hari. Pembuat QR sudah diuji terbaca pemindai untuk semua versi.
- Ukuran kartu memakai satuan milimeter yang diturunkan dari lebar kartu (`cqw`), jadi desain yang sama tampil identik di layar dan di kertas. Warna kartu sengaja tetap (tidak mengikuti tema terang/gelap) karena kartu adalah media cetak.
- Semua kelas CSS internal kartu berawalan `ic-` agar tidak bentrok dengan kelas lain (`style.css` sudah memakai `.hd`, `.kv`, `.pg`, dan `.fr` untuk profil siswa).
- Foto kartu diambil dari URL bertanda tangan Supabase Storage yang sama dengan profil. Bila foto tidak tampil di kartu, jalankan *Pengaturan > Data > Tes tampilan foto*.
- Format foto tersimpan persegi (320 x 320 px) dan ditampilkan dengan rasio 4:5, sehingga sedikit bagian samping terpotong. Gunakan foto dengan wajah di tengah.

## Uji keamanan

Setelah semua migrasi dijalankan, buka `supabase/tests/security_check.sql`, tempel di SQL Editor, lalu Run. Skrip membuat akun dan data uji sementara, memeriksa apakah orang tua, viewer, akun pending, dan pengunjung tanpa login hanya bisa mengakses yang seharusnya, lalu **membatalkan semuanya**. Hasilnya tampil sebagai pesan error berjudul `HASIL UJI KEAMANAN`. Error itu disengaja. Setiap baris harus bertuliskan `LULUS`. Jalankan ulang setiap kali aturan akses diubah.

## Upgrade dari versi sebelumnya

Jika database sudah dibuat dengan `schema.sql` versi awal, jalankan migrasi yang belum pernah dijalankan, berurutan, di SQL Editor: `002_absensi_iuran.sql` (versi 1.1) lalu `003_portal_ortu.sql` (versi 1.2), `004_pengingat_wa.sql` (versi 1.3), `005_foto_storage.sql` (versi 1.4), `006_preferensi_tema.sql` (tema per akun, opsional), dan `007_logo_identitas.sql` (logo sekolah, versi 2.3). Instalasi baru cukup menjalankan `schema.sql`.

## Impor data dari Excel

Tombol **Impor Excel** ada di halaman Data Siswa, Tabungan, Iuran, Absensi, Kas Kelas, Agenda, dan Pengumuman, juga di *Pengaturan > Data*. Hanya admin dan pengurus yang dapat mengimpor.

Alurnya tiga langkah di dalam satu dialog: **pilih berkas** (.xlsx atau .csv, seret atau pilih, maksimal 5 MB dan 3.000 baris) → **petakan kolom** (judul kolom dikenali otomatis, bisa diubah; baris judul dan lembar kerja bisa dipilih) → **pratinjau** (tiap baris diberi status *Baru*, *Ubah*, *Lewati*, atau *Masalah* beserta alasannya, laporan masalah bisa diunduh) → impor. Setelah impor muncul tombol **Urungkan impor** untuk mengembalikan keadaan sebelumnya.

| Data | Kunci pencocokan | Yang istimewa |
|---|---|---|
| Siswa | NIS | Siswa yang sudah ada diperbarui (hanya kolom berisi) atau dilewati. Jenis kelamin, agama, golongan darah, dan tanggal dinormalkan. Angka 0 di depan nomor HP yang hilang di Excel dikembalikan. Penulisan kelas diseragamkan dengan data yang ada |
| Tabungan | Siswa (NIS, atau nama) + tanggal + jenis + jumlah | Kolom *Jenis + Jumlah* atau *Setoran/Penarikan* terpisah. Saldo dihitung berjalan sehingga penarikan yang melebihi saldo ditolak sebelum dikirim ke server. Baris identik yang sudah ada dilewati (aman diimpor dua kali) |
| Iuran | Siswa + bulan | Format daftar, atau **matriks** (kolom Jan sampai Des): angka = nominal, tanda `v`/`lunas` = iuran per bulan di Pengaturan |
| Absensi | Siswa + tanggal | Format daftar, atau **matriks** (kolom berjudul tanggal) berisi H/S/I/A |
| Kas | Tanggal + jenis + jumlah + keterangan | Kolom *Pemasukan/Pengeluaran* terpisah didukung |
| Agenda, Pengumuman | Tanggal + judul | Tanggal pengumuman kosong memakai hari ini |

Setiap wizard punya **Unduh template Excel**: kolom NIS/NISN/HP sudah berformat Teks, daftar siswa terisi otomatis pada template tabungan, iuran, dan absensi, dan lembar *Petunjuk* menjelaskan tiap kolom.

Catatan teknis:
- Pembaca .xlsx ditulis di atas `fflate` (disertakan di `public/vendor/`, lisensi MIT) tanpa SheetJS, dan hanya membaca nilai tersimpan: formula dan makro tidak dijalankan. Tanggal Excel (termasuk sistem 1904), angka berformat Indonesia (`Rp 1.250.000`), CSV dengan pemisah `,` `;` atau tab, dan encoding Windows-1252 didukung. Format lama **.xls tidak didukung**; simpan ulang sebagai .xlsx.
- Penarikan tabungan dikirim berurutan menurut tanggal (setoran lebih dulu pada hari yang sama) agar lolos penjaga saldo di server (`guard_saldo`).
- Urungkan hanya tersedia di layar hasil impor. Setelah dialog ditutup, gunakan cadangan (*Pengaturan > Data*) bila perlu mengembalikan data.

## Layar masuk

Tampilan dua kolom di desktop: panel merek (logo dan nama sekolah dari cache perangkat, nilai jual, tiga fitur utama) dan form di sisi kanan. Di ponsel berubah menjadi header merek dengan lembar form di bawahnya. Mengikuti tema terang/gelap dan memuat tombol ganti tema di pojok.

- Tab **Masuk / Daftar** dalam satu form; email terbawa saat berpindah tab, daftar menambah kolom *Ulangi kata sandi*.
- Validasi per kolom (format email, panjang sandi, kecocokan sandi) dengan penanda `aria-invalid` dan fokus otomatis ke kolom yang salah.
- Ikon mata untuk menampilkan sandi, peringatan **Caps Lock**, tombol dengan status *Memproses…* (mencegah kirim ganda), dan atribut `autocomplete` yang benar agar pengelola kata sandi peramban bekerja.
- Pesan galat Supabase diterjemahkan ke bahasa Indonesia (sandi salah, email sudah terdaftar, terlalu banyak percobaan, tidak ada koneksi, dan lainnya).
- Layar *Menunggu persetujuan* memakai tampilan yang sama.
- Logo sekolah tampil di layar masuk setelah login pertama di perangkat tersebut (disimpan di cache karena data sekolah belum bisa dibaca sebelum login).

## Pengaturan

Halaman Pengaturan dibagi menjadi tujuh bagian dengan pil navigasi yang ikut menandai posisi saat digulir. Perubahan isian ditampung dulu dan baru disimpan lewat bar **Simpan perubahan** (bisa dibatalkan), serta tidak tertimpa pembaruan realtime saat sedang mengetik.

| Bagian | Isi | Siapa |
|---|---|---|
| Umum | **Logo sekolah** (unggah, hapus), nama sekolah, tahun ajaran, wali kelas, kepala sekolah, alamat, telepon | Admin mengubah; peran lain hanya melihat |
| Keuangan | Iuran per bulan, pesan pengingat WhatsApp dengan tombol sisip kata kunci | Admin mengubah |
| Hak akses | Matriks kemampuan per peran, persetujuan akun baru langsung dari sini, ringkasan jumlah akun per peran | Admin |
| Tampilan | Terang / gelap / ikuti perangkat, atur layanan Beranda (mobile) | Semua |
| Data | Ringkasan data, **unduh cadangan (.json)**, **pulihkan dari berkas**, ekspor CSV (siswa, transaksi, iuran, kas, absensi), pindah foto ke Storage, muat ulang data, bersihkan cache | Semua mengunduh; admin memulihkan |
| Akun | Email, peran, **ganti kata sandi**, versi aplikasi, status sinkronisasi, keluar | Semua |
| Zona berisiko | **Mulai tahun ajaran baru** (naik kelas, luluskan siswa, bersihkan data musiman), **hapus data terpilih** | Admin |

Pengamanan tindakan berisiko: pemulihan, tahun ajaran baru, dan penghapusan meminta pengguna mengetik kata kunci (`PULIHKAN`, `TAHUN BARU`, `RESET`), dan **cadangan otomatis diunduh lebih dulu**. Memilih *Data siswa* untuk dihapus otomatis mengunci dan menghapus data turunannya (tabungan, iuran, absensi, struktur, voting) agar tidak ada data yatim. Riwayat aktivitas tidak dapat dihapus dari aplikasi.

Logo disimpan di bucket publik `logo-sekolah` (logo bukan data sensitif dan perlu tampil di layar masuk sebelum login). Gambar otomatis diperkecil ke sisi terpanjang 256 px. Logo tampil di menu samping, app bar mobile, layar masuk (disimpan di cache perangkat), ikon tab, buku tabungan, dan bukti setoran.

**Migrasi 007 (wajib untuk logo).** Database yang sudah berjalan: jalankan `supabase/migrations/007_logo_identitas.sql` sekali di SQL Editor (instalasi baru sudah termasuk di `schema.sql`). Tanpa migrasi, aplikasi tetap berjalan: tombol logo dan kolom tambahan dinonaktifkan dan identitas dasar tetap bisa disimpan.

Perbaikan terkait: CSP di `vercel.json` kini mengizinkan gambar dari `https://*.supabase.co` (sebelumnya foto siswa dari Storage dan logo akan diblokir peramban). Akun tidak lagi bisa mengubah perannya sendiri di halaman Pengguna. Reset lama membuat data tanpa koleksi iuran, absensi, dan log sehingga beberapa halaman bisa error sesudahnya; kini semua koleksi selalu dibuat ulang.

## Mode terang dan gelap

Pengguna dapat memilih **Terang**, **Gelap**, atau **Ikuti perangkat** (bawaan). Pilihan disimpan di perangkat (`localStorage`, kunci `sh.theme`) dan langsung berlaku tanpa memuat ulang.

| Tempat memilih | Keterangan |
|---|---|
| Top bar (desktop) | Ikon matahari/bulan, membuka daftar pilihan |
| Menu avatar | Baris "Tampilan" untuk berganti cepat (terang → gelap → ikuti perangkat) |
| Pengaturan (desktop) dan Akun (mobile) | Tiga kartu pratinjau, juga tersedia untuk peran orang tua |
| Layar masuk | Tombol bulat di pojok kanan atas |

Cara kerjanya:

- `js/theme.js` dimuat di `<head>` setelah CSS, sehingga atribut `data-theme="light|dark"` pada `<html>` terpasang **sebelum halaman pertama digambar** (tanpa kedipan).
- Di `css/style.css`, blok `:root` memuat token tema gelap dan `:root[data-theme=light]` memuat token tema terang. **Tidak ada warna mentah di komponen**: hover, isian, garis, bayangan, scrim, snackbar, dan gradien kartu promo semuanya berupa token (`--w1…--w4`, `--ln`, `--bd2`, `--sh*`, `--scrim`, `--snb`, `--pa1`, dll.). Komponen baru cukup memakai token yang ada.
- Grafik SVG di `app.js` memakai `var(--ok)`, `var(--er)`, dan seterusnya, sehingga ikut berganti otomatis. Pendar (`drop-shadow`) pada grafik hanya aktif di tema gelap.
- Saat memilih "Ikuti perangkat", aplikasi mengikuti perubahan tema sistem secara langsung. Antar tab di peramban yang sama juga tersinkron.
- Warna bilah status / address bar (`<meta name="theme-color">`) dan `color-scheme` (kontrol bawaan peramban seperti kalender dan scrollbar) ikut berganti.
- Cetak selalu terang (hitam di atas putih) pada kedua tema.

Pilihan warna tema terang diukur dengan rasio kontras WCAG: seluruh teks, termasuk warna semantik (hijau, merah, amber, indigo) di atas kartu putih, berada di atas 4,5:1.

| Token | Gelap | Terang |
|---|---|---|
| `--bg` latar | `#0a1214` | `#edf4f4` |
| `--sf2` permukaan | `#142529` | `#ffffff` |
| `--tx` teks | `#e8f0f1` | `#0e2427` |
| `--mu` teks redup | `#8fa4a8` | `#4e676b` |
| `--pr` merek | `#5fd0cb` | `#0a7571` |
| `--pt` teks di atas isian merek | `#06201f` | `#ffffff` |
| `--ok` / `--er` / `--ac` / `--inf` | `#4cc58a` / `#ff8a84` / `#f0b72f` / `#8b9cff` | `#127a57` / `#c0362e` / `#9a6000` / `#4856c8` |

**Sinkron antar perangkat (opsional).** Jalankan `supabase/migrations/006_preferensi_tema.sql` sekali (instalasi baru sudah termasuk di `schema.sql`). Setelah itu pilihan tema tersimpan di akun dan ikut ke perangkat lain; bila akun sudah punya pilihan, itu yang dipakai. Tanpa migrasi, aplikasi tetap berjalan dan tema hanya tersimpan per perangkat. Tabelnya sengaja terpisah dari `profiles` agar pengguna tidak mendapat hak mengubah baris profilnya (yang memuat peran).

Catatan: `manifest.webmanifest` tidak bisa berganti warna per tema, jadi layar pembuka (splash) aplikasi yang dipasang ke layar utama tetap gelap sesaat sebelum aplikasi tampil.

## Panduan warna

Seluruh warna diatur dari token di bagian atas `public/css/style.css` (satu set untuk gelap, satu set untuk terang). Aturannya sama di semua halaman dan grafik:

| Makna | Token | Dipakai untuk |
|---|---|---|
| Merek, netral | `--pr` (teal) | Saldo, total, ranking, tombol utama, menu aktif |
| Masuk, baik | `--ok` (hijau) | Setoran, kas masuk, lunas, hadir, perubahan positif |
| Keluar, buruk | `--er` (koral) | Penarikan, kas keluar, belum bayar, alpa, perubahan negatif |
| Peringatan, sebagian | `--ac` (amber) | Iuran sebagian, sakit, target, peringatan |
| Kategori lain | `--inf` (indigo), `--rose` | Izin, kelas ketiga dan keempat pada grafik |

Untuk mengganti identitas warna sekolah, ubah `--pr`, `--pr2`, dan `--ac` **di kedua blok tema** (gelap: warna terang agar menyala di latar gelap; terang: warna lebih dalam agar teks tetap terbaca, rasio ≥ 4,5:1 di atas putih). Efek cahaya, batas, dan latar mengikuti otomatis.

## Peran pengguna

| Peran | Akses |
|---|---|
| pending | Akun baru, belum bisa membuka data |
| viewer | Hanya melihat |
| pengurus | Mengelola siswa, tabungan, kas, agenda, pengumuman, voting, struktur |
| ortu | Orang tua: hanya data anak yang ditautkan, plus pengumuman dan agenda |
| admin | Semua, termasuk pengaturan sekolah dan menu **Pengguna** untuk menyetujui akun |

Akun baru berstatus pending. Admin menyetujuinya lewat menu **Pengguna**.

## Catatan keamanan

- Anon key memang publik. Data dilindungi oleh Row Level Security di `schema.sql`, jadi jangan menonaktifkannya.
- Jangan pernah memasukkan `service_role` key ke frontend atau repository.
- Penarikan melebihi saldo ditolak oleh database (trigger `guard_saldo`), bukan hanya oleh tampilan.
- `vercel.json` memakai `'unsafe-inline'` pada script karena antarmuka memakai atribut `onclick`.
- Voting: suara disimpan dalam satu baris, jadi dua orang yang memilih pada detik yang sama bisa saling menimpa.
