# SekolahHub 2.24.x → 2.25.0: Lupa kata sandi

Pengguna yang lupa kata sandi kini bisa menggantinya sendiri lewat email, tanpa menunggu admin. Memakai fitur bawaan Supabase Auth (tidak ada tabel atau migrasi baru; **tidak perlu menjalankan SQL**).

## Alur
1. Layar masuk: tautan **Lupa kata sandi?** di bawah kolom sandi (hanya di tab Masuk). Email yang sudah diketik terbawa.
2. Layar **Lupa kata sandi?**: pengguna memasukkan email, aplikasi memanggil `resetPasswordForEmail`.
3. Layar **Periksa email Anda**: pesannya selalu sama, baik email terdaftar maupun tidak, sehingga orang luar tidak bisa menebak siapa yang punya akun. Tombol *Kirim ulang* terkunci 60 detik (sejalan dengan jeda per pengguna di Supabase).
4. Pengguna membuka tautan di email. Aplikasi mengenali tautan reset dan menampilkan layar **Buat kata sandi baru** *sebelum* data apa pun dibuka, termasuk bagi akun yang masih menunggu persetujuan.
5. Sandi disimpan, sesi di **perangkat lain dicabut** (bila sandi lama bocor, penyusup ikut keluar), lalu pengguna masuk di perangkat ini.

## Penanganan khusus
- **Tautan kedaluwarsa atau sudah dipakai:** pengguna diarahkan ke layar lupa dengan pesan jelas; hash galat dibersihkan dari URL.
- **Muat ulang di tengah proses:** layar sandi baru tetap tampil (penanda di `sessionStorage`), jadi tidak bisa "lolos" masuk tanpa mengganti sandi hanya dengan menyegarkan halaman.
- **Batal:** tombol *Batal* keluar dari sesi yang dibuat tautan.
- **Sesi pemulihan habis saat menyimpan:** pengguna diarahkan meminta tautan baru.
- **Sandi sama dengan yang lama:** pesan "harus berbeda dari yang lama" (bukan "terlalu lemah").
- Jenis tautan dibaca dari URL saat skrip dimuat. Event `PASSWORD_RECOVERY` milik supabase-js terkirim lewat `setTimeout` setelah `getSession()` selesai, sehingga tidak bisa diandalkan untuk menahan aplikasi agar tidak terbuka lebih dulu.

## Yang HARUS disiapkan di Supabase (tanpa ini email tidak sampai)
1. **SMTP kustom.** Layanan email bawaan Supabase hanya mengirim ke alamat anggota tim proyek (error `Email address not authorized` untuk yang lain) dan dibatasi sekitar 2 email per jam. Siswa dan orang tua **tidak akan menerima email** tanpa SMTP sendiri. Aktifkan di *Authentication → Emails → SMTP Settings* (mis. Brevo, Resend, Mailgun, atau SMTP domain sekolah). Pembatasan Supabase bisa berubah; cek dokumentasi resminya.
2. **Redirect URL.** *Authentication → URL Configuration*: isi **Site URL** dengan alamat produksi (mis. `https://nama-anda.vercel.app`) dan tambahkan `https://nama-anda.vercel.app/` ke **Redirect URLs** (untuk uji lokal tambahkan juga `http://localhost:3000/`). Tautan reset hanya mengarah ke alamat yang terdaftar; selain itu jatuh ke Site URL.
3. **Template email (opsional, perlu SMTP kustom).** Tempel `supabase/email-templates/reset-password.html` ke *Authentication → Emails → Templates → Reset password*. Pertahankan `{{ .ConfirmationURL }}` apa adanya.
4. **Batas kirim.** Setelah SMTP aktif, atur *Rate Limits* sesuai jumlah pengguna.

## Perlu diketahui
- Reset hanya bekerja bila pengguna masih bisa membuka email yang dipakai mendaftar. Bila email sudah tidak aktif, admin tetap perlu membantu (layar lupa menyebutnya).
- Pemindai tautan di beberapa layanan email sekolah/kantor membuka tautan lebih dulu dan menghanguskannya; pengguna lalu melihat "tautan kedaluwarsa". Bila sering terjadi, minta pengguna membuka email dari aplikasi email pribadi atau ganti ke alur kode OTP.
- Tautan reset yang dibuka lalu ditinggalkan tanpa mengganti sandi meninggalkan sesi masuk di peramban itu (sama seperti tautan masuk lewat email). Memuat ulang di tab yang sama tetap meminta sandi baru; membuka tab baru tidak.

## Berkas
- `public/js/data.js`: deteksi tautan reset, `forgot`, `setNewPassword`, `cancelRecovery`, `consumeLinkError`.
- `public/js/auth.js`: layar `lupa`, `terkirim`, `baru`; tautan di layar masuk; perbaikan urutan pesan galat.
- `public/js/app.js`: `boot()` mendahulukan layar sandi baru.
- `public/css/style.css`: gaya `.alk` dan `.afh0.plain`.
- `supabase/email-templates/reset-password.html`: template email.
- Uji: `tests_node/lupa_test.js` (ikut `npm test`) dan `tests_node/lupa_ui_test.js` (jsdom; `npm i jsdom`, tidak ikut `npm test`).

## Pengujian
`npm test` lulus (termasuk uji baru). `lupa_ui_test.js` lulus. Alur lengkap (masuk → lupa → terkirim → tautan reset → sandi baru → aplikasi) dijalankan di Chromium dengan Supabase palsu, desktop 1366 px (gelap) dan ponsel 390 px (terang), tanpa galat JavaScript. **Belum diuji terhadap proyek Supabase sungguhan** karena butuh SMTP dan akun nyata; lakukan satu kali uji dari ujung ke ujung dengan email pribadi setelah SMTP aktif.
