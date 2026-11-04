/* SekolahHub: layar masuk, daftar, dan menunggu persetujuan.
   Dimuat setelah app.js; boot() (app.js) memanggil authScreen() setelah semua skrip siap.
   Memakai global: $, esc, Data, Brand, Theme, boot. Logo & nama sekolah diambil dari cache perangkat (Brand.cached),
   karena data sekolah belum bisa dibaca sebelum login. */
(() => {
  'use strict';
  const P = (p, n = 18) => `<svg viewBox='0 0 24 24' width='${n}' height='${n}' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${p}</svg>`;
  const IC = {
    mail: `<rect x='3' y='5' width='18' height='14' rx='3'/><path d='M3.5 7.5l8.5 6 8.5-6'/>`,
    lock: `<rect x='4.5' y='10.5' width='15' height='10' rx='3'/><path d='M8 10.5V8a4 4 0 018 0v2.5'/>`,
    eye: `<path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>`,
    eyeoff: `<path d='M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.3 4.2M6.5 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 004.2 4.2'/>`,
    wallet: `<rect x='3' y='6' width='18' height='14' rx='3'/><path d='M3 10h18M16 15h2'/>`,
    clip: `<rect x='5' y='4' width='14' height='17' rx='2.5'/><path d='M9 4h6v3H9zM9 14l2 2 4-4'/>`,
    users: `<circle cx='9' cy='8' r='3.5'/><path d='M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5M16 4.6a3.5 3.5 0 010 6.8M18.5 14.8c1.9.7 3 2.2 3 4.7'/>`,
    clock: `<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>`
  };
  const FEAT = [
    ['wallet', 'Tabungan siswa', 'Setoran, penarikan, dan buku tabungan siap cetak.'],
    ['clip', 'Iuran dan absensi', 'Pantau pembayaran dan kehadiran setiap bulan.'],
    ['users', 'Portal orang tua', 'Wali murid melihat perkembangan anak dari rumah.']
  ];
  /* Terjemahan pesan galat Supabase/jaringan yang paling sering muncul */
  const friendly = m => {
    m = String(m || '');
    if (/invalid login|salah/i.test(m)) return 'Email atau kata sandi salah.';
    if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Periksa kotak masuk Anda.';
    if (/already registered|already been registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Tidak dapat terhubung. Periksa koneksi internet Anda.';
    if (/password should|weak/i.test(m)) return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    if (/signups? not allowed|disabled/i.test(m)) return 'Pendaftaran akun baru sedang dinonaktifkan.';
    return m || 'Terjadi kesalahan. Coba lagi.';
  };
  let tab = 'login', mail = '';

  function logoTile(bc, n) {
    const i = bc.u ? `<img src='${esc(bc.u)}' alt='' width='${n}' height='${n}' onerror='Brand.bad(this)'>` : Brand.mark();
    return `<span class='bt ${bc.u ? 'has' : ''}' style='width:${n}px;height:${n}px'>${i}</span>`;
  }
  function shell(inner, bc) {
    return `<div class='ash'><div class='abr'><div class='abt'>${logoTile(bc, 46)}<div><b>SekolahHub</b>${bc.n ? `<small>${esc(bc.n)}</small>` : ''}</div></div>`
      + `<div class='abh'><p class='abh2'>Kelola tabungan dan data kelas dengan rapi.</p><p class='abh3'>Satu tempat untuk setoran, iuran, absensi, dan komunikasi dengan wali murid.</p></div>`
      + `<ul class='abf'>${FEAT.map(f => `<li><span class='abi'>${P(IC[f[0]], 20)}</span><div><b>${f[1]}</b><small>${f[2]}</small></div></li>`).join('')}</ul></div>`
      + `<div class='afm'>${inner}</div></div><button type='button' class='thf' data-theme-cycle aria-label='Ganti tampilan'><span data-theme-icon></span></button>`;
  }

  function authScreen(mode, msg) {
    const a = $('#auth'); a.hidden = false; a.classList.remove('has-logo');
    const bc = Brand.cached();

    /* ----- Menunggu persetujuan ----- */
    if (mode == 'pending') {
      a.innerHTML = shell(`<div class='afc'><span class='aic'>${P(IC.clock, 28)}</span><h1>Menunggu persetujuan</h1>`
        + `<p class='afs'>Akun sudah terdaftar. Admin perlu menyetujui akun ini sebelum data sekolah dapat dibuka.</p>`
        + `<div class='aem'>${P(IC.mail, 16)}<span>${esc(Data.user.email)}</span></div>`
        + `<button class='p afb' id='re' type='button'>Periksa lagi</button><button class='afb afg' id='lo' type='button'>Keluar</button>`
        + `<p class='afn'>Anda akan bisa masuk setelah admin menetapkan peran untuk akun ini. Hubungi admin atau wali kelas bila terlalu lama.</p></div>`, bc);
      Theme.refresh(); $('#re').onclick = () => location.reload(); $('#lo').onclick = () => Data.logout(); return;
    }

    /* ----- Masuk / Daftar ----- */
    const reg = tab == 'daftar';
    a.innerHTML = shell(`<div class='afc'><h1>${reg ? 'Buat akun baru' : 'Selamat datang kembali'}</h1><p class='afs'>${reg ? 'Daftar lalu tunggu persetujuan admin.' : 'Masuk untuk mengelola tabungan dan data kelas.'}</p>`
      + `<div class='aseg' role='tablist' aria-label='Masuk atau daftar'><button type='button' role='tab' data-tab='login' aria-selected='${!reg}'>Masuk</button><button type='button' role='tab' data-tab='daftar' aria-selected='${reg}'>Daftar</button></div>`
      + `<form id='af' novalidate>`
      + `<div class='af'><label for='em'>Email</label><div class='afi'>${P(IC.mail)}<input id='em' type='email' inputmode='email' autocomplete='username' autocapitalize='off' spellcheck='false' placeholder='nama@email.com' value='${esc(mail)}' required></div></div>`
      + `<div class='af'><label for='pw'>Kata sandi</label><div class='afi pw'>${P(IC.lock)}<input id='pw' type='password' autocomplete='${reg ? 'new-password' : 'current-password'}' placeholder='Minimal 6 karakter' required><button type='button' class='eye' id='ey' aria-label='Tampilkan kata sandi' aria-pressed='false'>${P(IC.eye)}</button></div><div class='cap' id='cap' role='status'>Caps Lock sedang aktif</div></div>`
      + (reg ? `<div class='af'><label for='pw2'>Ulangi kata sandi</label><div class='afi pw'>${P(IC.lock)}<input id='pw2' type='password' autocomplete='new-password' placeholder='Ketik ulang kata sandi' required></div></div>` : '')
      + `<div id='aerr' class='amsg' role='alert' aria-live='polite'></div>`
      + `<button class='p afb' id='sb' type='submit'><span class='lb'>${reg ? 'Buat akun' : 'Masuk'}</span></button></form>`
      + `<p class='afn'>${reg ? 'Akun baru perlu disetujui admin sebelum dapat membuka data. Akun pertama yang mendaftar otomatis menjadi admin.' : 'Belum punya akun? Pilih <b>Daftar</b>. Lupa kata sandi? Hubungi admin sekolah.'}</p></div>`, bc);
    Theme.refresh();

    const em = $('#em'), pw = $('#pw'), err = $('#aerr'), sb = $('#sb');
    const note = (t, ok) => { err.textContent = t || ''; err.classList.toggle('ok', !!ok) };
    if (msg) note(msg.t || msg, !!msg.ok);
    const fail = (t, el) => { note(t); if (el) { el.setAttribute('aria-invalid', 'true'); el.focus() } };
    const busy = b => { sb.disabled = b; sb.classList.toggle('busy', b); sb.querySelector('.lb').textContent = b ? 'Memproses…' : (reg ? 'Buat akun' : 'Masuk') };

    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { if (b.dataset.tab == tab) return; mail = em.value.trim(); tab = b.dataset.tab; authScreen('login') } });
    [em, pw, $('#pw2')].forEach(el => { if (el) el.addEventListener('input', () => { el.removeAttribute('aria-invalid'); if (!err.classList.contains('ok')) note('') }) });
    $('#ey').onclick = () => {
      const show = pw.type == 'password'; pw.type = show ? 'text' : 'password';
      const p2 = $('#pw2'); if (p2) p2.type = pw.type;
      $('#ey').innerHTML = P(show ? IC.eyeoff : IC.eye); $('#ey').setAttribute('aria-pressed', show); $('#ey').setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    };
    const caps = e => { const on = !!(e.getModifierState && e.getModifierState('CapsLock')); $('#cap').style.display = on ? 'block' : 'none' };
    pw.addEventListener('keydown', caps); pw.addEventListener('keyup', caps); pw.addEventListener('blur', () => { $('#cap').style.display = 'none' });

    $('#af').onsubmit = async ev => {
      ev.preventDefault();
      const e = em.value.trim(), p = pw.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return fail('Masukkan alamat email yang valid.', em);
      if (p.length < 6) return fail('Kata sandi minimal 6 karakter.', pw);
      if (reg && p !== $('#pw2').value) return fail('Kata sandi tidak sama.', $('#pw2'));
      note(''); busy(true);
      try {
        const m = await (reg ? Data.signup : Data.login)(e, p);
        if (m) { mail = e; tab = 'login'; authScreen('login', { t: m, ok: true }) } else boot();
      } catch (x) { busy(false); fail(friendly(x.message)) }
    };
    if (matchMedia('(pointer:fine)').matches) (mail ? pw : em).focus();
  }
  window.authScreen = authScreen;
})();
