/* SekolahHub: lapisan tampilan mobile bergaya Gojek.
   Tidak mengubah logika data. Menambah navigasi, Beranda berbasis layanan, dan mendekorasi hasil render app.js.
   Memakai global dari app.js: NAV, TB, V, A, db, cur, PID, Data, ico, navOk, rp, fd, total, net, mk, today, toast, esc, $. */
(() => {
  'use strict';
  const S = p => `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>${p}</svg>`;
  const IC = {
    back: `<path d='M19 12H5M12 19l-7-7 7-7'/>`,
    search: `<circle cx='11' cy='11' r='7'/><path d='M20 20l-3.5-3.5'/>`,
    plus: `<path d='M12 5v14M5 12h14'/>`,
    apps: `<rect x='4' y='4' width='6.5' height='6.5' rx='1.7'/><rect x='13.5' y='4' width='6.5' height='6.5' rx='1.7'/><rect x='4' y='13.5' width='6.5' height='6.5' rx='1.7'/><rect x='13.5' y='13.5' width='6.5' height='6.5' rx='1.7'/>`,
    home: `<path d='M3 11.5L12 4l9 7.5'/><path d='M5.5 10v10h13V10'/><path d='M10 20v-5h4v5'/>`,
    clock: `<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>`,
    user: `<circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/>`,
    userPlus: `<circle cx='10' cy='8' r='3.5'/><path d='M3 20c0-3.5 3-6 7-6'/><path d='M18 8v6M15 11h6'/>`,
    chev: `<path d='M9 6l6 6-6 6'/>`,
    cog: `<circle cx='12' cy='12' r='3'/><path d='M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'/>`,
    eye: `<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>`,
    eyeOff: `<path d='M3 3l18 18'/><path d='M10.6 6.1A9.6 9.6 0 0112 6c6.5 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.6C3.9 9.3 2 12 2 12s3.5 6 10 6a9.7 9.7 0 004-.9'/>`,
    sliders: `<path d='M4 7h10M18 7h2M4 17h2M10 17h10'/><circle cx='16' cy='7' r='2'/><circle cx='8' cy='17' r='2'/>`
  };
  const LOGO = `<svg class='logo' viewBox='0 0 64 64'><rect class='lr' width='64' height='64' rx='16'/><path class='lg' d='M32 17l20 9-20 9-20-9z'/><path class='lg' d='M20 34v8c0 3 6 6 12 6s12-3 12-6v-8l-12 5.5z'/><path class='lt' d='M52 26v14' fill='none' stroke-width='3' stroke-linecap='round'/></svg>`;
  const nv = id => (NAV.find(n => n[0] == id) || [])[3] || IC.apps;
  const nn = id => (NAV.find(n => n[0] == id) || [])[1] || '';
  const ortu = () => Data.role == 'ortu' || Data.role == 'siswa';   // peran portal: orang tua dan siswa
  const homeId = () => ortu() ? 'portal' : 'dashboard';
  const lsGet = k => { try { return localStorage.getItem(k) } catch (e) { return null } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} };

  /* ---------- Layanan (grid Beranda) ---------- */
  const COL = { tabungan: 'var(--pr)', kas: 'var(--ok)', iuran: 'var(--ac)', pengingat: 'var(--er)', siswa: 'var(--inf)', struktur: 'var(--rose)', absensi: 'var(--pr2)', agenda: 'var(--rose)', pengumuman: 'var(--ac)', voting: 'var(--inf)', laporan: 'var(--mu)', pengguna: 'var(--inf)', pengaturan: 'var(--mu)' };
  const SHORT = { tabungan: 'Tabungan', kas: 'Kas Kelas', iuran: 'Iuran', pengingat: 'Pengingat', siswa: 'Siswa', struktur: 'Struktur', absensi: 'Absensi', agenda: 'Agenda', pengumuman: 'Pengumuman', voting: 'Voting', laporan: 'Laporan', pengguna: 'Pengguna' };
  const DESC = { pengaturan: 'Identitas sekolah dan data', pengguna: 'Setujui akun dan atur peran' };
  const NOSV = ['dashboard', 'portal', 'aktivitas'];
  const MAXP = 7, DEF = ['tabungan', 'iuran', 'absensi', 'kas', 'siswa', 'pengingat', 'agenda'];
  const svAll = () => NAV.filter(n => navOk(n) && !NOSV.includes(n[0])).map(n => ({ id: n[0], label: SHORT[n[0]] || n[1], grp: n[2], ic: n[3] }));
  const pk = () => 'sh.pins.' + Data.role;
  function pins() {
    const all = svAll().map(s => s.id);
    if (ortu()) return all;
    let p = null; try { p = JSON.parse(lsGet(pk())) } catch (e) {}
    p = (Array.isArray(p) ? p : DEF).filter(x => all.includes(x)).slice(0, MAXP);
    return p.length ? p : all.slice(0, MAXP);
  }
  const setPins = p => lsSet(pk(), JSON.stringify(p));
  function badge(id) {
    try {
      if (id == 'pengingat' && Data.canWrite()) { const m = today().slice(0, 7); return db.siswa.filter(s => !db.tab.some(t => t.sid == s.id && t.jenis == 'setor' && t.tgl.slice(0, 7) == m)).length }
      if (id == 'pengumuman') { const d = new Date(); d.setDate(d.getDate() - 3); const lim = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return db.info.filter(i => i.tgl >= lim).length }
    } catch (e) {}
    return 0;
  }
  const tileInner = s => { const b = badge(s.id); return `<i>${ico(s.ic)}${b ? `<em>${b > 99 ? '99+' : b}</em>` : ''}</i><span>${esc(s.label)}</span>` };
  const tile = s => `<a class='sv' href='#${s.id}' style='--c:${COL[s.id] || 'var(--pr)'}'>${tileInner(s)}</a>`;

  /* ---------- Halaman Akun ---------- */
  const ROLE = ROLEL;
  V.menu = () => {
    const email = Data.user?.email || '', has = id => svAll().find(s => s.id == id);
    const link = (id, label, ic, d) => `<a class='mn-r' href='#${id}' style='--c:${COL[id]}'><span class='mn-i'>${ico(ic)}</span><span><b>${label}</b><small>${esc(d)}</small></span>${S(IC.chev)}</a>`;
    let g = '';
    if (!ortu()) {
      const rows = [link('pengaturan', 'Pengaturan', IC.cog, DESC.pengaturan)];
      if (has('pengguna')) rows.push(link('pengguna', 'Kelola pengguna', nv('pengguna'), DESC.pengguna));
      g += `<section class='mn-g'><h4>Pengaturan</h4><div class='mn-l'>${rows.join('')}</div></section>`
        + `<section class='mn-g'><h4>Beranda</h4><div class='mn-l'><button type='button' class='mn-r' data-edit style='--c:var(--pr)'><span class='mn-i'>${S(IC.sliders)}</span><span><b>Atur layanan Beranda</b><small>Pilih menu yang tampil di layar utama</small></span>${S(IC.chev)}</button></div></section>`;
    }
    g += `<section class='mn-g'><h4>Tampilan</h4><div class='mn-l mn-p'>${Theme.picker()}<p class='mn-n'>Terang, gelap, atau mengikuti pengaturan perangkat. Pilihan tersimpan di perangkat ini.</p></div></section>`;
    return `<div class='mn-h'><div class='mn-a'>${esc((email[0] || '?').toUpperCase())}</div><div><b>${esc(email)}</b><small>${esc(db.cfg.sekolah || 'SekolahHub')}</small><span class='tag'>${esc(ROLE[Data.role] || Data.role)}</span></div></div>`
      + g + `<button class='mn-out' onclick='Data.logout()'>Keluar dari akun</button><p class='mn-v'>SekolahHub · ${esc(db.cfg.sekolah || '')}</p>`;
  };

  /* ---------- Navigasi bawah: hanya 3 menu ---------- */
  const dest = () => ortu()
    ? [['portal', 'Beranda', IC.home], ['pengumuman', 'Info', nv('pengumuman')], ['menu', 'Akun', IC.user]]
    : [['dashboard', 'Beranda', IC.home], ['aktivitas', 'Aktivitas', IC.clock], ['menu', 'Akun', IC.user]];
  const isTop = c => dest().some(d => d[0] == c);
  const destOf = c => c == 'pengaturan' ? 'menu' : isTop(c) ? c : homeId();
  function buildNav() {
    let b = $('#bnav');
    if (!b) { b = document.createElement('div'); b.id = 'bnav'; b.setAttribute('role', 'navigation'); b.setAttribute('aria-label', 'Navigasi utama'); document.body.appendChild(b) }
    const on = destOf(cur);
    b.innerHTML = dest().map(d => `<a href='#${d[0]}' class='${d[0] == on ? 'on' : ''}' ${d[0] == on ? "aria-current='page'" : ''}><i>${S(d[2])}</i><span>${d[1]}</span></a>`).join('');
  }

  /* ---------- App bar ---------- */
  let hops = 0;
  function titles() {
    const s = db.siswa.find(x => x.id == PID), sk = db.cfg.sekolah || 'SekolahHub';
    if (cur == 'dashboard' || cur == 'portal') return [sk, db.cfg.tahun ? 'Tahun ajaran ' + db.cfg.tahun : ''];
    if (cur == 'menu') return ['Akun', ''];
    if (cur == 'profil') return [s ? s.nama : 'Profil siswa', s ? 'Kelas ' + s.kelas : ''];
    if (cur == 'ubah') return ['Ubah profil', s ? s.nama : ''];
    if (cur == 'pengaturan') return ['Pengaturan', ''];
    return [nn(cur), ''];
  }
  function head() {
    const t = $('#top'); if (!t || t.hidden) return;
    if (!$('#mlead')) {
      t.insertAdjacentHTML('afterbegin', `<div id='mlead'></div><div id='mtt'><b></b><span></span></div>`);
      const ta = t.querySelector('.ta'), ts = t.querySelector('.ts');
      if (ta) ta.insertAdjacentHTML('beforebegin', `<button id='msb' type='button' aria-label='Cari'>${S(IC.search)}</button>`);
      if (ts) ts.insertAdjacentHTML('afterbegin', `<button id='msx' type='button' aria-label='Tutup pencarian'>${S(IC.back)}</button>`);
    }
    const home = cur == 'dashboard' || cur == 'portal';
    document.body.classList.toggle('home', home);
    $('#mlead').innerHTML = isTop(cur) ? (Brand.url() ? Brand.tile(36, 'mlt') : LOGO) : `<button type='button' data-back aria-label='Kembali'>${S(IC.back)}</button>`;
    const [a, b] = titles(); $('#mtt b').textContent = a; $('#mtt span').textContent = b;
    document.title = (a || 'SekolahHub') + ' – SekolahHub';
    if (window.Theme) Theme.meta();
  }
  function goBack() {
    if (cur == 'ubah') location.hash = 'profil-' + PID;
    else if (hops > 0) history.back();
    else location.hash = cur == 'pengaturan' ? 'menu' : homeId();
  }

  /* ---------- Pencarian layar penuh ---------- */
  function openSearch() { const ts = $('#top .ts'); if (!ts) return; TB.close(); ts.classList.add('open'); document.body.classList.add('so'); $('#gs').focus(); TB.search() }
  function closeSearch() { const ts = $('#top .ts'); if (!ts || !ts.classList.contains('open')) return; ts.classList.remove('open'); document.body.classList.remove('so'); const g = $('#gs'); g.value = ''; g.blur(); $('#gr').hidden = true }

  /* ---------- Beranda ala Gojek ---------- */
  const hide = () => lsGet('sh.hide') == '1';
  const sec = (t, r, c) => `<div class='sec ${c || ''}'><h3>${t}</h3>${r || ''}</div>`;
  const ACT = { trx: ['Setor / Tarik', 'tabungan', 'var(--pr)'], massal: ['Setoran massal', 'siswa', 'var(--inf)'], kas: ['Catat kas', 'kas', 'var(--ok)'], siswa: ['Tambah siswa', '+', 'var(--ac)'] };
  function promos() {
    const t = today(), mk2 = (k, x, href, g) => ({ k, t: x.judul, d: x.tgl, href, g });
    const inf = db.info.slice().sort((a, b) => b.tgl.localeCompare(a.tgl)).slice(0, 3).map(x => mk2('Pengumuman', x, '#pengumuman', ['var(--pa1)', 'var(--pa2)']));
    const ag = db.agenda.filter(a => a.tgl >= t).sort((a, b) => a.tgl.localeCompare(b.tgl)).slice(0, 3).map(x => mk2('Agenda', x, '#agenda', ['var(--pi1)', 'var(--pi2)']));
    const out = []; for (let i = 0; i < 3; i++) { if (ag[i]) out.push(ag[i]); if (inf[i]) out.push(inf[i]) }
    return out;
  }
  function homeHTML() {
    const dash = cur == 'dashboard', w = Data.canWrite(), p = pins(), all = svAll();
    const sw = Data.role == 'siswa' && window.SWV && db.siswa.length;   // akun Siswa: kartu pelajar (lanskap, depan) di bagian paling atas
    let h = `<section id='hm'><div class='hg ${dash || sw ? '' : 's'}'><button type='button' class='srch' data-search>${S(IC.search)}<span>Cari siswa, layanan, atau aksi</span></button></div>`;
    if (sw) h += `<div class='swm-h'>${SWV.hero()}</div>`;
    if (dash) {
      let d = 0; try { d = total() - net(mk(-1)) } catch (e) {}
      const hid = hide(), acts = w
        ? Object.keys(ACT).map(k => `<button type='button' class='ba' data-act='${k}' style='--c:${ACT[k][2]}'><i>${ACT[k][1] == '+' ? S(IC.userPlus) : ico(nv(ACT[k][1]))}</i>${ACT[k][0]}</button>`)
        : ['tabungan', 'kas', 'iuran', 'laporan'].filter(id => all.find(s => s.id == id)).map(id => `<a class='ba' href='#${id}' style='--c:${COL[id]}'><i>${ico(nv(id))}</i>${SHORT[id]}</a>`);
      h += `<div class='bal'><div class='bal-t'><div><small>${ico(nv('tabungan'))}Total tabungan siswa</small><b>${hid ? 'Rp ••••••' : rp(total())}</b><span class='dl ${d < 0 ? 'n' : ''}'>${hid ? 'Saldo disembunyikan' : (d < 0 ? '−' : '+') + rp(Math.abs(d)).replace('Rp ', 'Rp ') + ' bulan ini'}</span></div><button type='button' class='eye' data-eye aria-label='${hid ? 'Tampilkan' : 'Sembunyikan'} saldo'>${S(hid ? IC.eyeOff : IC.eye)}</button></div><div class='bal-a'>${acts.join('')}</div></div>`;
    }
    const sv = p.map(id => all.find(s => s.id == id)).filter(Boolean).map(tile).join('')
      + (!ortu() ? `<button type='button' class='sv more' data-more><i>${S(IC.apps)}</i><span>Lainnya</span></button>` : '');
    h += sec('Layanan', !ortu() ? `<button type='button' data-edit>Atur</button>` : '') + `<div class='svc'>${sv}</div>`;
    const pr = promos();
    h += sec('Info &amp; agenda', `<a href='#pengumuman'>Lihat semua</a>`) + `<div class='scr'>${pr.length
      ? pr.map(x => `<a class='pc' href='${x.href}' style='--g1:${x.g[0]};--g2:${x.g[1]}'><small>${x.k}</small><b>${esc(x.t)}</b><span>${esc(fd(x.d))}</span></a>`).join('')
      : `<div class='pc empty'>Belum ada pengumuman atau agenda.</div>`}</div></section>`;
    return h;
  }
  function home(force) {
    if (cur != 'dashboard' && cur != 'portal') return;
    const old = $('#hm');
    if (old && !force) return;
    if (old) { old.outerHTML = homeHTML(); return }
    const app = $('#app'); app.insertAdjacentHTML('afterbegin', homeHTML());
    if (cur != 'dashboard') return;
    const place = (sel, o, title) => { const e = app.querySelector(':scope>' + sel); if (!e) return; e.classList.add('o' + (o + 1)); if (title) e.insertAdjacentHTML('beforebegin', sec(title, '', 'o' + o)) };
    place('.grid', 1, 'Ringkasan bulan ini');
    place('.chg', 3, 'Perlu perhatian');
    place('.board', 5, 'Analitik kelas');
  }

  /* ---------- Sheet semua layanan / atur layanan ---------- */
  let svEdit = false;
  function renderSheet() {
    const q = $('#qs'), all = svAll(), p = pins();
    const grps = ['Keuangan', 'Kelas', 'Sistem'].filter(g => all.some(s => s.grp == g));
    const t = s => svEdit
      ? `<button type='button' class='sv ed ${p.includes(s.id) ? 'on' : ''}' data-pin='${s.id}' style='--c:${COL[s.id] || 'var(--pr)'}'><i>${ico(s.ic)}</i><span>${esc(s.label)}</span><b class='bd'>${p.includes(s.id) ? '−' : '+'}</b></button>`
      : tile(s);
    q.innerHTML = `<div class='sh-h'><div class='sh-t'>${svEdit ? 'Atur layanan Beranda' : 'Semua layanan'}</div>${svEdit ? '' : `<button type='button' data-sv-toggle>Atur</button>`}</div>`
      + (svEdit ? `<p class='sh-n'>Ketuk untuk menambah (+) atau menghapus (−) layanan di Beranda. Terpilih ${p.length} dari maksimal ${MAXP}.</p>` : '')
      + grps.map(g => `<h4>${g}</h4><div class='svc'>${all.filter(s => s.grp == g).map(t).join('')}</div>`).join('')
      + (svEdit ? `<div class='sh-f'><button type='button' data-sv-reset>Atur ulang</button><button type='button' class='p' data-sv-toggle>Selesai</button></div>` : '');
  }
  function openSheet(edit) {
    let q = $('#qs');
    if (!q) { q = document.createElement('dialog'); q.id = 'qs'; q.setAttribute('aria-label', 'Layanan'); document.body.appendChild(q) }
    svEdit = !!edit; renderSheet(); if (!q.open) q.showModal();
  }
  function pin(id) {
    let p = pins();
    if (p.includes(id)) p = p.filter(x => x != id);
    else { if (p.length >= MAXP) return toast('Maksimal ' + MAXP + ' layanan di Beranda'); p.push(id) }
    setPins(p); renderSheet(); home(true);
  }

  /* ---------- FAB: aksi utama halaman dalam ---------- */
  const PRIMARY = ['tabungan', 'siswa', 'kas', 'agenda', 'pengumuman', 'voting', 'struktur'];
  function fab() {
    let f = $('#fab');
    if (!f) { f = document.createElement('button'); f.id = 'fab'; f.type = 'button'; f.innerHTML = S(IC.plus) + '<span></span>'; document.body.appendChild(f) }
    let btn = null;
    if (Data.canWrite() && !ortu() && PRIMARY.includes(cur)) btn = $('#app>.bar button.p');
    f.hidden = !btn; f._btn = btn; document.body.classList.toggle('hf', !!btn);
    if (!btn) return;
    const label = btn.textContent.trim(); f.querySelector('span').textContent = label; f.setAttribute('aria-label', label);
    btn.classList.add('fb');
    const bar = btn.parentElement; if ([...bar.children].every(c => c === btn || c.classList.contains('sp'))) bar.classList.add('eb');
  }

  /* ---------- Dekorasi tabel ---------- */
  function tables() {
    $('#app').querySelectorAll('table').forEach(t => {
      const rows = [...t.rows], hr = rows.find(r => r.querySelector('th')); if (!hr) return;
      const hs = [...hr.cells].map(c => c.textContent.trim());
      const abs = !!t.querySelector('input[type=radio]'), wide = hs.includes('Jan') && hs.includes('Des');
      hr.classList.add('thr'); t.classList.add(abs ? 'abs' : wide ? 'wide' : 'stk');
      rows.forEach(r => {
        if (r === hr) return; const n = r.cells.length;
        [...r.cells].forEach((c, i) => {
          c.setAttribute('data-label', hs[i] || '');
          if (!i) c.classList.add('ttl');
          if (!hs[i]) c.classList.add('act');
          if (abs && c.querySelector('input[type=radio]')) c.classList.add('opt');
          if (abs && i == n - 1) c.classList.add('rkp');
        });
      });
    });
  }
  let last = '';
  function anim() {
    const k = cur + (cur == 'profil' || cur == 'ubah' ? PID : ''); if (k === last) return; last = k;
    const a = $('#app'); a.classList.remove('pgin'); void a.offsetWidth; a.classList.add('pgin');
  }
  function enhance() { try { buildNav(); head(); fab(); tables(); home(); anim() } catch (e) { console.warn('mobile.js', e) } }

  /* ---------- Pengait ---------- */
  new MutationObserver(() => { if (typeof db !== 'undefined' && db) enhance() }).observe($('#app'), { childList: true });
  if (typeof db !== 'undefined' && db) enhance();

  document.addEventListener('click', e => {
    const t = e.target, c = s => t.closest(s);
    if (c('#msb') || c('[data-search]')) return openSearch();
    if (c('#msx')) return closeSearch();
    if (c('[data-back]')) return goBack();
    if (c('#fab')) { const f = $('#fab'); return f._btn && f._btn.click() }
    let x;
    if ((x = c('[data-act]'))) { const k = x.dataset.act; return ACT[k] && A[k]() }
    if (c('[data-more]')) return openSheet(false);
    if (c('[data-edit]')) return openSheet(true);
    if (c('[data-eye]')) { lsSet('sh.hide', hide() ? '0' : '1'); return home(true) }
    if (c('[data-sv-toggle]')) { svEdit = !svEdit; return renderSheet() }
    if (c('[data-sv-reset]')) { setPins(DEF); renderSheet(); return home(true) }
    if ((x = c('[data-pin]'))) return pin(x.dataset.pin);
    if (c('#qs a.sv')) return $('#qs').close();
    if (t === $('#qs')) { const r = t.getBoundingClientRect(); if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) t.close(); return }
    if (c('#gr a,#gr .pi')) setTimeout(closeSearch, 0);
  });
  addEventListener('brandchange', () => { try { head() } catch (e) {} });
  addEventListener('hashchange', () => { hops++; closeSearch(); const q = $('#qs'); if (q && q.open) q.close() });
  addEventListener('scroll', () => {
    const t = $('#top'); if (t) t.classList.toggle('sc', scrollY > 4);
    const f = $('#fab'); if (f) f.classList.toggle('sm', scrollY > 60);
  }, { passive: true });

  /* PWA */
  if ('serviceWorker' in navigator && (location.protocol == 'https:' || location.hostname == 'localhost'))
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
