/* SekolahHub: halaman Pengaturan (identitas + logo, keuangan, hak akses, tampilan, data & cadangan, akun, reset).
   Dimuat setelah app.js dan sebelum mobile.js. Memakai global dari app.js: db, load, save, go, V, A, Data, Theme, Brand,
   $, esc, rp, fd, today, toast, logA, ico, sis, saldo, total, kelasList, csv, WA_TAB, WA_IUR. */
(() => {
  'use strict';
  const VER = '2.3.0';
  const adm = () => Data.role == 'admin';
  const ROLE = { admin: 'Admin', pengurus: 'Pengurus', viewer: 'Hanya lihat', ortu: 'Orang tua', pending: 'Menunggu' };
  /* Koleksi data yang dapat dihapus. DEP = ikut terhapus bila data siswa dihapus. */
  const COLL = [['siswa', 'Data siswa'], ['tab', 'Transaksi tabungan'], ['iuran', 'Pembayaran iuran'], ['absensi', 'Absensi'], ['kas', 'Kas kelas'], ['agenda', 'Agenda'], ['info', 'Pengumuman'], ['vote', 'Voting'], ['struktur', 'Struktur kelas']];
  const DEP = ['tab', 'iuran', 'absensi', 'struktur', 'vote'];
  const blank = () => ({ siswa: [], tab: [], iuran: [], absensi: [], kas: [], agenda: [], info: [], vote: [], struktur: [] });
  const fix = d => { const b = blank(); Object.keys(b).forEach(k => { if (!Array.isArray(d[k])) d[k] = b[k] }); if (!Array.isArray(d.log)) d.log = []; d.cfg = d.cfg || {}; return d };
  const P = p => `<svg viewBox='0 0 24 24' width='20' height='20' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${p}</svg>`;
  const IC = {
    umum: `<path d='M3 21h18M5 21V9l7-5 7 5v12'/><path d='M9 21v-6h6v6'/>`,
    keuangan: `<rect x='3' y='6' width='18' height='14' rx='3'/><path d='M3 10h18M16 15h2'/>`,
    akses: `<path d='M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z'/><path d='M9 12l2 2 4-4'/>`,
    tampilan: `<circle cx='12' cy='12' r='4'/><path d='M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4'/>`,
    data: `<ellipse cx='12' cy='6' rx='7' ry='3'/><path d='M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3'/>`,
    akun: `<circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/>`,
    reset: `<path d='M12 3.5l9.5 16.5h-19z'/><path d='M12 10v4.5M12 17.2v.01'/>`,
    ok: `<path d='M5 12.5l4.5 4.5L19 7.5'/>`
  };
  const SEC = [['umum', 'Umum', 0], ['keuangan', 'Keuangan', 0], ['akses', 'Hak akses', 1], ['tampilan', 'Tampilan', 0], ['data', 'Data', 0], ['akun', 'Akun', 0], ['reset', 'Reset', 1]];
  const secs = () => SEC.filter(s => !s[2] || adm());
  let SD = false, lastTA = null, io = null, USERS = [];
  window.PGD = () => SD;

  /* ---------- Util ---------- */
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) };
  const dlg = (html, wire) => { const d = $('#dlg'); d.innerHTML = html; d.showModal(); const x = d.querySelector('#x'); if (x) x.onclick = () => d.close(); if (wire) wire(d); return d };
  /* Dialog tindakan berisiko: tombol baru aktif setelah pengguna mengetik kata kunci. */
  const danger = o => dlg(`<h3>${o.title}</h3>${o.body}<label style='margin-top:14px'>Ketik <b>${o.kw}</b> untuk melanjutkan<input id='dk' autocomplete='off' autocapitalize='characters' spellcheck='false'></label><div class='msg' id='dm'></div><div class='acts'><button id='x'>Batal</button><button class='p dng' id='ok' disabled>${o.ok}</button></div>`, d => {
    const i = d.querySelector('#dk'), b = d.querySelector('#ok');
    i.oninput = () => { b.disabled = i.value.trim().toUpperCase() != o.kw };
    b.onclick = async () => { b.disabled = true; try { await o.run(d) } catch (e) { d.querySelector('#dm').textContent = e.message || String(e); b.disabled = false } };
    setTimeout(() => i.focus(), 60);
  });
  const nextK = k => { const m = String(k).match(/^(\d+)(.*)$/); return m ? (+m[1] + 1) + m[2] : k };
  const nextT = t => { const m = String(t).match(/^(\d{4})\s*[\/\-]\s*(\d{4})$/); return m ? (+m[1] + 1) + '/' + (+m[2] + 1) : t };
  const cnt = k => (db[k] || []).length;
  const wipe = ks => { const S = new Set(ks); if (S.has('siswa')) { DEP.forEach(k => S.add(k)); db.siswa.forEach(s => { Data.drop(s.foto); Data.drop(s.cover) }) } S.forEach(k => { db[k] = [] }); return [...S] };
  const lbl = k => (COLL.find(c => c[0] == k) || [0, k])[1];

  /* ---------- Tampilan halaman ---------- */
  const inp = (k, l, o = {}) => `<label>${l}<input data-cfg='${k}' type='${o.t || 'text'}' value='${esc(db.cfg[k])}' ${o.t == 'number' ? "min='0' inputmode='numeric'" : ''} ${adm() ? '' : 'disabled'} ${o.ph ? `placeholder='${esc(o.ph)}'` : ''}></label>`;
  const head = (id, t, d, ic, c) => `<div class='sth'><span class='sti ${c || ''}'>${P(IC[ic || id])}</span><div><h3>${t}</h3><p class='lab'>${d}</p></div></div>`;
  const sec = (id, inner, c) => `<section class='card stc ${c || ''}' id='st-${id}'>${inner}</section>`;
  const note = t => `<div class='nt'>${t}</div>`;

  const MX = [
    ['Melihat data siswa, tabungan, iuran, dan absensi', 'yyya'], ['Melihat pengumuman dan agenda', 'yyyy'],
    ['Mencatat tabungan, iuran, absensi, dan kas', 'yynn'], ['Mengelola siswa, pengumuman, agenda, voting, dan struktur', 'yynn'],
    ['Mengunduh cadangan dan ekspor CSV', 'yyyn'], ['Mengubah identitas, logo, dan pengaturan sekolah', 'ynnn'],
    ['Menyetujui akun, mengatur peran, menautkan orang tua', 'ynnn'], ['Memulihkan cadangan dan mereset data', 'ynnn']
  ];
  const mx = () => `<div class='mx' role='table' aria-label='Hak akses per peran'><div class='mh' role='columnheader'>Kemampuan</div>${['Admin', 'Pengurus', 'Lihat', 'Ortu'].map(h => `<div class='mh c' role='columnheader'>${h}</div>`).join('')}`
    + MX.map(r => `<div class='mc' role='cell'>${r[0]}</div>${[...r[1]].map(c => `<div class='c ${c}' role='cell'>${c == 'y' ? `<span class='sr'>Ya</span>${P(IC.ok)}` : c == 'a' ? 'Anak' : `<span class='sr'>Tidak</span>–`}</div>`).join('')}`).join('') + `</div>`;

  V.pengaturan = () => {
    SD = false;
    const a = adm(), c = db.cfg, ext = Data.cfgExt;
    const migr = db.siswa.reduce((n, s) => n + (String(s.foto).startsWith('data:') ? 1 : 0) + (String(s.cover).startsWith('data:') ? 1 : 0), 0);
    const size = Math.round(JSON.stringify(db).length / 1024);
    const kv = (k, v) => `<div class='kv'><span class='mu'>${k}</span><b>${v}</b></div>`;
    const nav = `<div class='sx' id='sx' role='navigation' aria-label='Bagian pengaturan'>${secs().map(s => `<button type='button' data-sx='${s[0]}'>${P(IC[s[0]])}${s[1]}</button>`).join('')}</div>`;
    let h = `<h2>Pengaturan</h2><p class='sub'>Identitas, logo, hak akses, data, dan keamanan akun.</p>${nav}`;
    if (!a) h += note('Pengaturan sekolah hanya dapat diubah oleh <b>admin</b>. Anda tetap dapat mengatur tampilan, mengunduh cadangan, dan mengganti kata sandi.');

    /* Umum */
    h += sec('umum', head('umum', 'Umum', 'Identitas sekolah yang tampil di menu, layar masuk, dan cetakan.')
      + `<div class='lgr'><div class='lgp' id='lgp'>${Brand.tile(88)}</div><div class='lgi'><b>Logo sekolah</b><p class='lab'>PNG, JPG, atau WebP. Otomatis diperkecil. Tampil di menu samping, layar masuk, ikon tab, dan cetakan.</p>`
      + (a ? `<div class='pbar'><button type='button' class='p' onclick='A.logo()' ${ext ? '' : 'disabled'}>Unggah logo</button><button type='button' class='d' id='lgd' onclick='A.logoDel()' ${c.logo ? '' : 'hidden'}>Hapus</button></div>` : '')
      + (a && !ext ? note('Fitur logo dan kolom tambahan butuh migrasi <b>007</b> di Supabase. Lihat README, bagian Pengaturan.') : '') + `</div></div>`
      + `<div class='fg'>${inp('sekolah', 'Nama sekolah')}${inp('tahun', 'Tahun ajaran', { ph: '2026/2027' })}${inp('walikelas', 'Wali kelas')}${ext ? inp('kepsek', 'Kepala sekolah') + inp('telp', 'Telepon', { t: 'tel' }) + `<label>Alamat<textarea data-cfg='alamat' rows='2' ${a ? '' : 'disabled'}>${esc(c.alamat)}</textarea></label>` : ''}</div>`);

    /* Keuangan */
    h += sec('keuangan', head('keuangan', 'Keuangan', 'Iuran kelas dan pesan pengingat untuk wali murid.')
      + `<div class='fg'>${inp('iuran', 'Iuran kelas per bulan (Rp)', { t: 'number' })}</div>`
      + `<label>Pesan pengingat tabungan<textarea data-cfg='watab' rows='3' placeholder='${esc(WA_TAB)}' ${a ? '' : 'disabled'}>${esc(c.watab)}</textarea></label>`
      + `<label>Pesan pengingat iuran<textarea data-cfg='waiuran' rows='3' placeholder='${esc(WA_IUR)}' ${a ? '' : 'disabled'}>${esc(c.waiuran)}</textarea></label>`
      + (a ? `<p class='lab'>Ketuk kata kunci untuk menyisipkannya ke pesan. Kosongkan pesan untuk memakai teks bawaan.</p><div class='chips'>${['{nama}', '{kelas}', '{sekolah}', '{saldo}', '{bulan}', '{nominal}', '{kekurangan}'].map(t => `<button type='button' class='s chip' onclick="A.ins('${t}')">${t}</button>`).join('')}</div>` : ''));

    /* Hak akses */
    if (a) h += sec('akses', head('akses', 'Hak akses', 'Aturan ditegakkan di database (RLS), bukan hanya di tampilan. Akun baru berstatus Menunggu sampai disetujui.')
      + `<div class='tw'>${mx()}</div><h4 class='sh4'>Akun menunggu persetujuan</h4><div id='pu'><div class='empty'>Memuat…</div></div><div id='rc' class='chips rc'></div>`
      + `<div class='pbar'><a class='btn' href='#pengguna'>Kelola semua pengguna</a></div>`);

    /* Tampilan */
    h += sec('tampilan', head('tampilan', 'Tampilan', 'Terang, gelap, atau mengikuti pengaturan perangkat. Tersimpan di akun Anda.')
      + Theme.picker() + `<div class='pbar mob-only'><button type='button' data-edit>Atur layanan Beranda</button></div>`);

    /* Data */
    h += sec('data', head('data', 'Data dan cadangan', 'Unduh cadangan berkala. Cadangan memuat seluruh data sekolah dalam satu berkas.')
      + kv('Siswa', cnt('siswa') + ' siswa · ' + kelasList().length + ' kelas') + kv('Transaksi tabungan', cnt('tab')) + kv('Pembayaran iuran', cnt('iuran')) + kv('Absensi', cnt('absensi'))
      + kv('Kas kelas', cnt('kas')) + kv('Agenda · Pengumuman · Voting', cnt('agenda') + ' · ' + cnt('info') + ' · ' + cnt('vote')) + kv('Ukuran data', size + ' KB')
      + `<div class='pbar' style='margin-top:14px'><button type='button' class='p' onclick='A.unduh()'>Unduh cadangan (.json)</button>${a ? `<button type='button' onclick='A.pulihkan()'>Pulihkan dari berkas</button>` : ''}</div>`
      + `<h4 class='sh4'>Ekspor CSV (Excel / Sheets)</h4><div class='pbar'><button type='button' onclick='A.csvSiswa()'>Data siswa</button><button type='button' onclick='A.csvTrx()'>Transaksi</button><button type='button' onclick='A.csvIuran()'>Iuran</button><button type='button' onclick='A.csvKas()'>Kas</button><button type='button' onclick='A.csvAbsen()'>Absensi</button></div>`
      + (migr && Data.canWrite() ? `<h4 class='sh4'>Foto siswa</h4><p class='lab'>${migr} foto lama masih tersimpan langsung di database sehingga memperberat pemuatan. Pindahkan ke Supabase Storage.</p><div class='pbar'><button type='button' class='p' onclick='A.migrasiFoto()'>Pindahkan ke Storage</button></div>` : '')
      + `<h4 class='sh4'>Pemeliharaan</h4><div class='pbar'><button type='button' onclick='A.muat()'>Muat ulang data dari server</button><button type='button' onclick='A.cache()'>Bersihkan cache aplikasi</button></div><p class='lab'>Bersihkan cache bila tampilan tidak ikut berubah setelah pembaruan aplikasi.</p>`);

    /* Akun */
    h += sec('akun', head('akun', 'Akun', 'Keamanan dan informasi aplikasi.')
      + kv('Email', esc(Data.user && Data.user.email || '')) + kv('Peran', ROLE[Data.role] || esc(Data.role)) + kv('Versi aplikasi', 'SekolahHub ' + VER)
      + kv('Sinkronisasi', { ok: 'Tersimpan', saving: 'Menyimpan…', error: 'Gagal menyimpan', offline: 'Offline' }[Data.status] || 'Tersimpan')
      + `<div class='pbar' style='margin-top:14px'><button type='button' onclick='A.sandi()'>Ganti kata sandi</button><a class='btn' href='#aktivitas'>Riwayat aktivitas</a><button type='button' class='d' onclick='Data.logout()'>Keluar</button></div>`);

    /* Reset */
    if (a) h += sec('reset', head('reset', 'Zona berisiko', 'Tindakan di sini mengubah atau menghapus data. Cadangan otomatis diunduh sebelum dijalankan.', 'reset', 'd')
      + `<div class='drw'><div><b>Mulai tahun ajaran baru</b><p class='lab'>Naikkan kelas, luluskan siswa, dan bersihkan data musiman. Saldo tabungan tetap dibawa.</p></div><button type='button' class='p' onclick='A.tahunBaru()'>Mulai</button></div>`
      + `<div class='drw'><div><b>Hapus data terpilih</b><p class='lab'>Pilih data yang dikosongkan, atau pilih semua untuk mengosongkan seluruh data sekolah. Pengaturan tetap ada.</p></div><button type='button' class='d' onclick='A.resetPilih()'>Pilih data</button></div>`
      + `<p class='lab' style='margin-bottom:0'>Riwayat aktivitas tidak dapat dihapus dari aplikasi, agar jejak perubahan tetap terjaga.</p>`, 'dz');

    h += `<div class='sav' id='sv' hidden><span class='mu'>Ada perubahan yang belum disimpan</span><span class='sp'></span><button type='button' onclick='A.cfgUndo()'>Batalkan</button><button type='button' class='p' onclick='A.cfgSave()'>Simpan perubahan</button></div>`;
    return h;
  };

  /* ---------- Perilaku halaman ---------- */
  const PG = window.PG = {
    chk() { const els = [...document.querySelectorAll('#app [data-cfg]')]; SD = els.some(e => PG.val(e) !== PG.cur(e.dataset.cfg)); const s = $('#sv'); if (s) s.hidden = !SD },
    val(e) { return e.dataset.cfg == 'iuran' ? String(+e.value || 0) : e.value.trim() },
    cur(k) { return k == 'iuran' ? String(+db.cfg.iuran || 0) : String(db.cfg[k] || '').trim() },
    jump(id) { const e = document.getElementById('st-' + id); if (e) e.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth', block: 'start' }) },
    init() {
      const app = $('#app');
      app.querySelectorAll('[data-cfg]').forEach(e => { e.addEventListener('input', PG.chk); if (e.tagName == 'TEXTAREA') e.addEventListener('focus', () => { lastTA = e }) });
      app.querySelectorAll('[data-sx]').forEach(b => { b.onclick = () => PG.jump(b.dataset.sx) });
      if (io) io.disconnect();
      const bs = [...app.querySelectorAll('[data-sx]')], vis = new Map(), atBot = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 6;
      io = new IntersectionObserver(es => {
        es.forEach(e => vis.set(e.target.id.slice(3), e.isIntersecting ? e.boundingClientRect.top : null));
        const on = atBot() ? [bs[bs.length - 1].dataset.sx] : [...vis].filter(v => v[1] !== null).sort((x, y) => x[1] - y[1])[0];
        if (on) bs.forEach(b => { const o = b.dataset.sx == on[0]; b.classList.toggle('on', o); if (o) { const sx = $('#sx'); if (sx) sx.scrollTo({ left: b.offsetLeft - (sx.clientWidth - b.offsetWidth) / 2 }) } });
      }, { rootMargin: '-130px 0px -55% 0px' });
      app.querySelectorAll('.stc').forEach(s => io.observe(s));
      /* Di dasar halaman bagian terakhir tak sempat melewati zona pengamat; tandai manual */
      const bot = () => { if (!$('#sx')) return removeEventListener('scroll', bot); if (atBot()) bs.forEach((b, i) => b.classList.toggle('on', i == bs.length - 1)) };
      removeEventListener('scroll', PG._bot); PG._bot = bot; addEventListener('scroll', bot, { passive: true });
      if (adm()) PG.users();
    },
    paintLogo() {
      Brand.sync();
      const g = $('#lgp'); if (g) g.innerHTML = Brand.tile(88);
      const d = $('#lgd'); if (d) d.hidden = !db.cfg.logo;
      const t = document.querySelector('#nav .brand .bt'); if (t) t.outerHTML = Brand.tile(36);
    },
    users() {
      const pu = $('#pu'); if (!pu) return;
      Data.users().then(u => {
        USERS = u; const by = r => u.filter(x => x.role == r).length;
        const rc = $('#rc'); if (rc) rc.innerHTML = ['admin', 'pengurus', 'viewer', 'ortu', 'pending'].map(r => `<span class='tag'>${ROLE[r]} · ${by(r)}</span>`).join('');
        const p = u.filter(x => x.role == 'pending');
        pu.innerHTML = p.length ? p.map(x => `<div class='item pnd'><div class='pni'><b>${esc(x.email)}</b><div class='lab'>Mendaftar ${fd(String(x.created_at).slice(0, 10))}</div></div><div class='pnr'><select id='pr_${x.id}' aria-label='Peran untuk ${esc(x.email)}'>${[['viewer', 'Hanya lihat'], ['pengurus', 'Pengurus'], ['ortu', 'Orang tua'], ['admin', 'Admin']].map(r => `<option value='${r[0]}'>${r[1]}</option>`).join('')}</select><button type='button' class='p s' onclick="A.setuju('${x.id}')">Setujui</button></div></div>`).join('')
          : `<div class='empty'>Tidak ada akun yang menunggu persetujuan.</div>`;
      }).catch(e => { pu.innerHTML = `<div class='empty'>${esc(e.message)}</div>` });
    }
  };

  /* ---------- Aksi ---------- */
  Object.assign(A, {
    cfgSave() {
      if (!adm()) return toast('Hanya admin yang dapat mengubah pengaturan');
      const o = {}; document.querySelectorAll('#app [data-cfg]').forEach(e => { o[e.dataset.cfg] = e.dataset.cfg == 'iuran' ? (+e.value || 0) : e.value.trim() });
      if ('sekolah' in o && !o.sekolah) return toast('Nama sekolah wajib diisi');
      Object.assign(db.cfg, o); logA('Pengaturan sekolah diperbarui'); SD = false; save(); go(); toast('Pengaturan disimpan');
    },
    cfgUndo() { SD = false; go() },
    ins(t) {
      const ta = lastTA && document.contains(lastTA) ? lastTA : document.querySelector('[data-cfg=watab]'); if (!ta || ta.disabled) return;
      const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s; ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
      ta.focus(); ta.setSelectionRange(s + t.length, s + t.length); ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
    /* Logo */
    logo() {
      if (!adm()) return; if (!Data.cfgExt) return toast('Jalankan migrasi 007 di Supabase terlebih dahulu');
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp';
      i.onchange = () => {
        const f = i.files[0]; if (!f) return; if (f.size > 8 * 1048576) return toast('Gambar terlalu besar (maksimal 8 MB)');
        const url = URL.createObjectURL(f), im = new Image();
        im.onload = () => {
          URL.revokeObjectURL(url);
          const q = Math.min(1, 256 / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * q)), h = Math.max(1, Math.round(im.height * q)), c = document.createElement('canvas');
          c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
          c.toBlob(async b => {
            try { const old = db.cfg.logo; db.cfg.logo = await Data.uploadLogo(b); Data.dropLogo(old); logA('Logo sekolah diperbarui'); save(); PG.paintLogo(); toast('Logo diperbarui') }
            catch (e) { toast('Gagal mengunggah logo: ' + e.message) }
          }, 'image/png');
        };
        im.onerror = () => { URL.revokeObjectURL(url); toast('File bukan gambar yang valid') };
        im.src = url;
      };
      i.click();
    },
    logoDel() {
      dlg(`<h3>Hapus logo?</h3><p>Logo diganti lambang bawaan SekolahHub di semua tempat.</p><div class='acts'><button id='x'>Batal</button><button class='p dng' id='ok'>Hapus logo</button></div>`, d => {
        d.querySelector('#ok').onclick = () => { Data.dropLogo(db.cfg.logo); db.cfg.logo = ''; logA('Logo sekolah dihapus'); save(); d.close(); PG.paintLogo(); toast('Logo dihapus') };
      });
    },
    /* Hak akses */
    setuju(id) {
      const u = USERS.find(x => x.id == id), r = $('#pr_' + id).value; if (!u) return;
      Data.setRole(id, r).then(() => { logA('Akun ' + u.email + ' disetujui sebagai ' + ROLE[r]); save(); toast(r == 'ortu' ? 'Disetujui. Tautkan ke siswa lewat Kelola pengguna.' : 'Akun disetujui'); PG.users() }, e => toast(e.message));
    },
    /* Cadangan */
    unduh(tag) {
      const j = { app: 'sekolahhub', versi: VER, dibuat: new Date().toISOString(), sekolah: db.cfg.sekolah, db };
      dl('sekolahhub-cadangan' + (tag ? '-' + tag : '') + '-' + today() + '.json', JSON.stringify(j), 'application/json');
      if (!tag) toast('Cadangan diunduh');
    },
    pulihkan() {
      if (!adm()) return;
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = async () => {
        const f = i.files[0]; if (!f) return; let j;
        try { j = JSON.parse(await f.text()) } catch (e) { return toast('Berkas bukan JSON yang valid') }
        const src = j && j.db ? j.db : j;
        if (!src || !Array.isArray(src.siswa) || !Array.isArray(src.tab)) return toast('Berkas bukan cadangan SekolahHub');
        danger({
          title: 'Pulihkan dari cadangan', kw: 'PULIHKAN', ok: 'Pulihkan data',
          body: `<p>Seluruh data saat ini akan <b>diganti</b> dengan isi cadangan${j.dibuat ? ' (dibuat ' + esc(new Date(j.dibuat).toLocaleString('id-ID')) + ')' : ''}:</p><div class='kv'><span class='mu'>Siswa</span><b>${src.siswa.length}</b></div><div class='kv'><span class='mu'>Transaksi tabungan</span><b>${src.tab.length}</b></div><div class='kv'><span class='mu'>Iuran · Absensi · Kas</span><b>${(src.iuran || []).length} · ${(src.absensi || []).length} · ${(src.kas || []).length}</b></div><p class='lab'>Cadangan data saat ini otomatis diunduh lebih dulu.</p>`,
          run: d => { A.unduh('sebelum-pemulihan'); const nd = fix(JSON.parse(JSON.stringify(src))); nd.cfg = Object.assign({}, db.cfg, nd.cfg, { logo: db.cfg.logo }); load(nd); logA('Data dipulihkan dari cadangan'); save(); d.close(); go(); toast('Data dipulihkan') }
        });
      };
      i.click();
    },
    /* Ekspor CSV */
    csvIuran() { csv('iuran-kelas', [['Bulan', 'Nama', 'NIS', 'Kelas', 'Jumlah', 'Tanggal bayar', 'Catatan'], ...db.iuran.slice().sort((a, b) => a.bulan.localeCompare(b.bulan)).map(x => { const s = sis(x.sid); return [x.bulan, s.nama, s.nis, s.kelas, x.jml, x.tgl, x.cat] })]) },
    csvKas() { csv('kas-kelas', [['Tanggal', 'Jenis', 'Jumlah', 'Keterangan'], ...db.kas.slice().sort((a, b) => a.tgl.localeCompare(b.tgl)).map(k => [k.tgl, k.jenis == 'masuk' ? 'Masuk' : 'Keluar', k.jml, k.ket])]) },
    csvAbsen() { const N = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' }; csv('absensi', [['Tanggal', 'Nama', 'NIS', 'Kelas', 'Status'], ...db.absensi.slice().sort((a, b) => a.tgl.localeCompare(b.tgl)).map(x => { const s = sis(x.sid); return [x.tgl, s.nama, s.nis, s.kelas, N[x.st] || x.st] })]) },
    /* Pemeliharaan */
    async muat() { try { load(await Data.pull()); go(); toast('Data dimuat ulang') } catch (e) { toast('Gagal memuat: ' + e.message) } },
    async cache() {
      try { const r = (navigator.serviceWorker && await navigator.serviceWorker.getRegistrations()) || []; await Promise.all(r.map(x => x.unregister())); const k = await caches.keys(); await Promise.all(k.map(x => caches.delete(x))) } catch (e) {}
      location.reload();
    },
    sandi() {
      dlg(`<h3>Ganti kata sandi</h3><label>Kata sandi baru<input id='pw1' type='password' autocomplete='new-password'></label><label>Ulangi kata sandi<input id='pw2' type='password' autocomplete='new-password'></label><div class='msg' id='pwe'></div><div class='acts'><button id='x'>Batal</button><button class='p' id='ok'>Simpan</button></div>`, d => {
        const ok = d.querySelector('#ok'), er = t => { $('#pwe').textContent = t };
        ok.onclick = async () => {
          const a = $('#pw1').value, b = $('#pw2').value;
          if (a.length < 6) return er('Minimal 6 karakter.'); if (a !== b) return er('Kata sandi tidak sama.');
          ok.disabled = true; er('Menyimpan…');
          try { await Data.changePassword(a); d.close(); toast('Kata sandi diperbarui') } catch (e) { er(e.message); ok.disabled = false }
        };
      });
    },
    /* Tahun ajaran baru */
    tahunBaru() {
      if (!adm()) return;
      const ks = kelasList(), n = k => db.siswa.filter(s => s.kelas == k).length;
      const CL = [['absensi', true, 'Absensi harian'], ['agenda', true, 'Agenda'], ['info', true, 'Pengumuman'], ['vote', true, 'Voting'], ['struktur', true, 'Struktur kelas'], ['iuran', false, 'Riwayat iuran (tersimpan per tahun, aman dibiarkan)'], ['kas', false, 'Kas kelas'], ['tab', false, 'Transaksi tabungan (saldo siswa hilang)']];
      danger({
        title: 'Mulai tahun ajaran baru', kw: 'TAHUN BARU', ok: 'Jalankan',
        body: `<p class='lab'>Cadangan otomatis diunduh sebelum perubahan. Siswa yang tidak diluluskan tetap membawa saldo tabungannya.</p><label>Tahun ajaran baru<input id='tb_ta' value='${esc(nextT(db.cfg.tahun))}'></label>`
          + `<h4 class='sh4'>Naik kelas</h4>${ks.length ? ks.map(k => `<div class='nk'><span class='nkk'>${esc(k)}<small class='mu'>${n(k)} siswa</small></span><span class='mu'>→</span><input data-nk='${esc(k)}' value='${esc(nextK(k))}' aria-label='Kelas baru untuk ${esc(k)}'><label class='chk lul'><input type='checkbox' data-lul='${esc(k)}'>Lulus</label></div>`).join('') + `<p class='lab'>“Lulus” menghapus siswa kelas itu beserta seluruh datanya.</p>` : `<p class='lab'>Belum ada siswa.</p>`}`
          + `<h4 class='sh4'>Bersihkan data</h4>${CL.map(c => `<label class='chk'><input type='checkbox' data-cl='${c[0]}' ${c[1] ? 'checked' : ''}>${c[2]} <small class='mu'>(${cnt(c[0])})</small></label>`).join('')}`,
        run: d => {
          A.unduh('sebelum-tahun-baru');
          const ta = $('#tb_ta').value.trim(), lul = new Set([...d.querySelectorAll('[data-lul]:checked')].map(e => e.dataset.lul)), ren = {};
          d.querySelectorAll('[data-nk]').forEach(e => { const v = e.value.trim(); if (v) ren[e.dataset.nk] = v });
          const gone = new Set(db.siswa.filter(s => lul.has(s.kelas)).map(s => s.id));
          db.siswa.filter(s => gone.has(s.id)).forEach(s => { Data.drop(s.foto); Data.drop(s.cover) });
          db.siswa = db.siswa.filter(s => !gone.has(s.id));
          ['tab', 'iuran', 'absensi'].forEach(k => { db[k] = db[k].filter(x => !gone.has(x.sid)) }); db.struktur = db.struktur.filter(x => !gone.has(x.sid));
          db.siswa.forEach(s => { if (!lul.has(s.kelas) && ren[s.kelas]) s.kelas = ren[s.kelas] });
          const cl = [...d.querySelectorAll('[data-cl]:checked')].map(e => e.dataset.cl); cl.forEach(k => { db[k] = [] });
          if (ta) db.cfg.tahun = ta;
          logA('Tahun ajaran baru ' + (ta || '') + ': ' + gone.size + ' siswa lulus, dibersihkan: ' + (cl.map(lbl).join(', ') || 'tidak ada'));
          save(); d.close(); go(); toast('Tahun ajaran baru dimulai');
        }
      });
    },
    /* Hapus data terpilih */
    resetPilih() {
      if (!adm()) return;
      danger({
        title: 'Hapus data terpilih', kw: 'RESET', ok: 'Hapus data',
        body: `<p class='lab'>Cadangan otomatis diunduh sebelum penghapusan. Tindakan ini tidak bisa dibatalkan.</p><div class='pbar'><button type='button' class='s' id='ra'>Pilih semua</button><button type='button' class='s' id='rn'>Kosongkan pilihan</button></div>`
          + COLL.map(c => `<label class='chk'><input type='checkbox' data-rc='${c[0]}'>${c[1]} <small class='mu'>(${cnt(c[0])})</small></label>`).join('')
          + `<p class='lab' id='rh'>Memilih <b>Data siswa</b> juga menghapus tabungan, iuran, absensi, struktur, dan voting.</p>`,
        run: d => {
          const ks = [...d.querySelectorAll('[data-rc]:checked')].map(e => e.dataset.rc); if (!ks.length) throw new Error('Pilih minimal satu data.');
          A.unduh('sebelum-hapus'); const done = wipe(ks); logA('Data dihapus: ' + done.map(lbl).join(', ')); save(); d.close(); go(); toast('Data dihapus');
        }
      });
      const d = $('#dlg'), box = k => d.querySelector(`[data-rc=${k}]`), sync = () => { const s = box('siswa').checked; DEP.forEach(k => { box(k).disabled = s; if (s) box(k).checked = true }) };
      box('siswa').onchange = sync; d.querySelector('#ra').onclick = () => { COLL.forEach(c => { box(c[0]).checked = true }); sync() }; d.querySelector('#rn').onclick = () => { COLL.forEach(c => { box(c[0]).checked = false }); sync() };
    }
  });
})();
