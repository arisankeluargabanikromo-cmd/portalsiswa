/* SekolahHub v2.19: halaman "Akun Saya" (grup Sistem) untuk akun portal: Siswa dan Orang tua.
 * Staf (admin, pengurus, hanya lihat) memakai Pengaturan > Akun, jadi menu ini tidak ditampilkan untuk mereka (lihat navOk di app.js).
 * Prinsip hak akses (least privilege): halaman ini hanya menyentuh akun SENDIRI.
 *   Boleh : lihat email/peran/tautan siswa (hanya-baca), ganti kata sandi, keluar (perangkat ini / semua perangkat), tema tampilan,
 *           muat ulang data dan bersihkan cache aplikasi.
 *   Tidak : identitas sekolah, cadangan/ekspor data, impor, reset, kelola pengguna, riwayat aktivitas, pengaturan keuangan.
 * Semua aksi di database tetap ditegakkan oleh RLS/trigger; halaman ini tidak memberi izin apa pun, hanya menampilkan pintu masuk.
 * Memakai global: db, Data, V, A, Theme, Brand, ROLEL, esc, $, toast, portal. Dimuat setelah pengaturan.js.
 */
(() => {
  'use strict';
  const E = x => (typeof esc == 'function' ? esc(x) : String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const kv = (k, v) => `<div class='kv'><span class='mu'>${k}</span><b>${v}</b></div>`;
  /* Ikon bagian (memakai ico() dari app.js; jalur 24x24) */
  const IC = {
    user: `<circle cx='12' cy='8' r='3.5'/><path d='M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5'/>`,
    lock: `<rect x='5' y='11' width='14' height='9' rx='2'/><path d='M8 11V8a4 4 0 0 1 8 0v3'/>`,
    sun: `<circle cx='12' cy='12' r='4'/><path d='M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4'/>`,
    app: `<rect x='4' y='3' width='16' height='18' rx='3'/><path d='M9 8h6M9 12h6M9 16h3'/>`
  };
  const ic = k => (typeof ico == 'function' ? ico(IC[k]) : '');
  const sec = (k, h, d, body) => `<section class='card stc aks-s'><div class='sth'><span class='sti'>${ic(k)}</span><div><h3>${h}</h3><p class='lab'>${d}</p></div></div>${body}</section>`;
  const dlg = (html, wire) => { const d = $('#dlg'); d.innerHTML = html; d.showModal(); const x = d.querySelector('#x'); if (x) x.onclick = () => d.close(); if (wire) wire(d); return d };

  /* Ringkasan peran dan hak akses yang ditampilkan ke pengguna (transparansi) */
  const AKSES = {
    siswa: 'Anda dapat melihat data dan transaksi milik Anda sendiri serta informasi kelas. Anda tidak dapat mengubah data.',
    ortu: 'Anda dapat melihat data anak yang ditautkan ke akun ini serta informasi kelas (kas, struktur, agenda, pengumuman, dan jalannya voting). Anda tidak dapat mengubah data dan tidak dapat memberi suara; suara diberikan siswa dari akunnya sendiri.'
  };

  function hero() {
    const r = Data.role, em = Data.user && Data.user.email || '', kids = db.siswa || [];
    const nama = r == 'siswa' && kids[0] ? kids[0].nama : (em.split('@')[0] || 'Akun');
    const ini = String(nama).trim().charAt(0).toUpperCase() || '?';
    return `<div class='card aks-hero'><div class='aks-av' aria-hidden='true'>${E(ini)}</div><div class='aks-id'><b>${E(nama)}</b><span class='mu'>${E(em)}</span></div><span class='aks-role'>${E((ROLEL && ROLEL[r]) || r)}${r == 'siswa' && Data.jabatan && Data.jabatan.length ? ' · ' + E(Data.jabatan.map(j => JABL[j] || j).join(' & ')) : ''}</span></div>`;
  }
  function profil() {
    const r = Data.role, kids = db.siswa || [];
    let h = kv('Sekolah', E(db.cfg.sekolah || ''));
    if (r == 'siswa' && kids[0]) h += kv('Nama siswa', E(kids[0].nama)) + kv('Kelas', E(kids[0].kelas)) + kv('NIS', E(kids[0].nis));
    else if (r == 'ortu' && kids.length) h += kv('Anak yang ditautkan', kids.map(s => E(s.nama) + ' (' + E(s.kelas) + ')').join('<br>'));
    else h += `<p class='aks-note'>Akun ini belum ditautkan ke data siswa. Hubungi ${db.cfg.walikelas ? 'wali kelas (' + E(db.cfg.walikelas) + ')' : 'wali kelas'} atau admin sekolah.</p>`;
    return sec('user', 'Profil akun', 'Data siswa hanya dapat diubah oleh wali kelas atau admin.', h + `<p class='aks-note'>${E(AKSES[r] || '')}${r == 'siswa' && Data.pejabat() ? ' Sebagai ' + E(Data.jabatan.map(j => JABL[j]).join(' & ')) + ' kelas, Anda juga mendapat wewenang terbatas pada kelas Anda (menu Tugas Kelas).' : ''}</p>`);
  }
  const keamanan = () => sec('lock', 'Keamanan', 'Jaga akun tetap aman, terutama di perangkat bersama.',
    `<div class='pbar'><button type='button' onclick='A.sandi()'>Ganti kata sandi</button><button type='button' onclick='AKS.semua()'>Keluar dari semua perangkat</button><button type='button' class='d' onclick='Data.logout()'>Keluar</button></div>`
    + `<p class='aks-note'>Gunakan kata sandi yang unik dan jangan dibagikan. Bila akun pernah dipakai di perangkat orang lain, pilih <b>Keluar dari semua perangkat</b>, lalu ganti kata sandi.</p>`);
  const tampilan = () => sec('sun', 'Tampilan', 'Terang, gelap, atau mengikuti perangkat.', Theme.picker());
  const aplikasi = () => sec('app', 'Aplikasi', 'Informasi dan pemeliharaan ringan.',
    kv('Versi aplikasi', E(Brand.name()) + ' ' + E(window.APP_VER || '')) + kv('Sinkronisasi', { ok: 'Tersimpan', saving: 'Menyimpan…', error: 'Gagal menyimpan', offline: 'Offline' }[Data.status] || 'Tersimpan')
    + `<div class='pbar' style='margin-top:12px'><button type='button' onclick='A.muat()'>Muat ulang data</button><button type='button' onclick='A.cache()'>Bersihkan cache</button></div>`
    + `<p class='aks-note'>Bersihkan cache bila tampilan tidak ikut berubah setelah pembaruan aplikasi.</p>`);

  V.akun = () => `<h2>Akun Saya</h2><p class='sub'>Informasi akun, keamanan, dan tampilan. Perubahan data siswa atau iuran dilakukan oleh wali kelas atau admin.</p>${hero()}<div class='aks-grid'><div>${profil()}${tampilan()}</div><div>${keamanan()}${aplikasi()}</div></div>`;

  window.AKS = {
    semua() {
      dlg(`<h3>Keluar dari semua perangkat?</h3><p>Seluruh sesi akun ini di semua perangkat akan diakhiri, termasuk perangkat ini. Anda perlu masuk kembali.</p><div class='acts'><button id='x'>Batal</button><button class='p' id='ya'>Keluar dari semua</button></div>`, d => {
        d.querySelector('#ya').onclick = () => { d.querySelector('#ya').disabled = true; Data.logoutAll() };
      });
    }
  };
})();
