/* SekolahHub: pengatur tema terang / gelap / ikuti perangkat.
   Dimuat di <head> (setelah CSS, sebelum <body>) sehingga atribut data-theme terpasang SEBELUM halaman pertama digambar: tanpa kedipan.
   - Pilihan disimpan di localStorage ('sh.theme': system | light | dark), bawaan: system.
   - Tema hasil akhir ditulis ke <html data-theme="light|dark">. Seluruh warna di CSS berasal dari token yang bergantung pada atribut ini.
   - Mengikuti perubahan tema OS secara langsung (saat memilih "Ikuti perangkat") dan sinkron antar tab.
   - Menyediakan pembuat HTML (picker, menu, ikon) yang dipakai app.js dan mobile.js. */
(() => {
  'use strict';
  const KEY = 'sh.theme', ORDER = ['system', 'light', 'dark'], SHOW = ['light', 'dark', 'system'];
  const LBL = { light: 'Terang', dark: 'Gelap', system: 'Ikuti perangkat' };
  const FALL = { dark: '#0a1214', light: '#edf4f4' };            // cadangan warna bilah sistem bila CSS belum terbaca
  const root = document.documentElement;
  const mqL = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  const mqM = window.matchMedia ? matchMedia('(max-width:860px)') : null;
  const mqR = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  const read = () => { try { const v = localStorage.getItem(KEY); return ORDER.includes(v) ? v : 'system' } catch (e) { return 'system' } };
  const write = v => { try { localStorage.setItem(KEY, v) } catch (e) {} };
  const resolve = p => p === 'system' ? (mqL && mqL.matches ? 'light' : 'dark') : p;   // tanpa dukungan = gelap (tampilan asli)
  let pref = read(), mode = resolve(pref), timer = 0, remote = null;   // remote = {get, set} dari akun (diikat setelah login)

  /* ---------- Ikon ---------- */
  const svg = (p, n) => `<svg viewBox='0 0 24 24' width='${n || 18}' height='${n || 18}' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${p}</svg>`;
  const P = {
    light: `<circle cx='12' cy='12' r='4'/><path d='M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4'/>`,
    dark: `<path d='M20.5 13.2A8.5 8.5 0 1110.8 3.5a6.8 6.8 0 009.7 9.7z'/>`,
    system: `<rect x='3' y='4' width='18' height='12.5' rx='2'/><path d='M8.5 20.5h7M12 16.5v4'/>`,
    check: `<path d='M5 12.5l4.5 4.5L19 7.5'/>`
  };

  /* ---------- Warna bilah status / address bar (PWA & peramban seluler) ---------- */
  function meta() {
    let m = document.querySelector('meta[name=theme-color]');
    if (!m && document.head) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m) }
    if (!m) return;
    const home = document.body && document.body.classList.contains('home');
    const key = mqM && mqM.matches ? (home ? '--hg' : '--s2') : '--bg';      // sama dengan logika app bar di mobile.css
    const v = getComputedStyle(root).getPropertyValue(key).trim();
    m.content = v || FALL[mode];
    const cs = document.querySelector('meta[name=color-scheme]');
    if (cs) cs.content = mode;
  }

  /* ---------- Sinkronkan semua kontrol tema yang sedang tampil ---------- */
  function refresh() {
    document.querySelectorAll('[data-theme-set]').forEach(b => {
      const on = b.dataset.themeSet === pref;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-theme-icon]').forEach(e => { e.innerHTML = svg(P[mode]) });
    document.querySelectorAll('[data-theme-label]').forEach(e => { e.textContent = pref === 'system' ? LBL.system + ' (' + LBL[mode] + ')' : LBL[pref] });
    document.querySelectorAll('[data-theme-cycle]').forEach(b => b.setAttribute('aria-label', 'Tampilan: ' + LBL[pref] + '. Ketuk untuk mengganti'));
  }

  /* ---------- Terapkan ---------- */
  function apply(animate) {
    mode = resolve(pref);
    if (animate && !(mqR && mqR.matches)) {                    // transisi halus hanya sesaat saat berganti, bukan permanen
      root.classList.add('tfx'); clearTimeout(timer); timer = setTimeout(() => root.classList.remove('tfx'), 380);
    }
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-pref', pref);
    meta(); refresh();
    try { dispatchEvent(new CustomEvent('themechange', { detail: { mode, pref } })) } catch (e) {}
  }
  function set(p) {
    if (!ORDER.includes(p)) return; pref = p; write(p); apply(true);
    if (remote) Promise.resolve().then(() => remote.set(p)).catch(() => {});   // simpan ke akun, kegagalan tidak mengganggu
  }
  // Ikat ke akun: pilihan di akun menang (agar sama di semua perangkat); bila akun belum punya dan perangkat sudah memilih, kirim ke akun.
  function bind(api) {
    remote = api;
    Promise.resolve().then(() => api.get()).then(v => {
      if (ORDER.includes(v)) { if (v !== pref) { pref = v; write(v); apply(true) } }
      else { let stored = null; try { stored = localStorage.getItem(KEY) } catch (e) {} if (ORDER.includes(stored)) return api.set(stored) }
    }).catch(() => {});
  }
  function cycle() { set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]) }

  /* ---------- Pembuat HTML ---------- */
  // Tiga kartu pratinjau (Pengaturan dan halaman Akun mobile)
  function pv(k) {
    const m = c => `<span class='pv ${c}' aria-hidden='true'><i class='pn'></i><i class='c1'></i><i class='c2'></i><i class='c3'></i></span>`;
    return k === 'system' ? `<span class='pvs' aria-hidden='true'>${m('l')}${m('d')}</span>` : m(k === 'dark' ? 'd' : 'l');
  }
  function picker() {
    return `<div class='tpk' role='radiogroup' aria-label='Tampilan'>${SHOW.map(k =>
      `<button type='button' class='tp ${k === pref ? 'on' : ''}' role='radio' aria-checked='${k === pref}' data-theme-set='${k}'>${pv(k)}<span class='pl'>${svg(P[k], 16)}${LBL[k]}</span></button>`).join('')}</div>`;
  }
  // Daftar pilihan untuk dropdown di top bar
  function menu() {
    return `<h4>Tampilan</h4>` + SHOW.map(k =>
      `<button type='button' class='pi tm ${k === pref ? 'on' : ''}' role='menuitemradio' aria-checked='${k === pref}' data-theme-set='${k}'>${svg(P[k])}<span>${LBL[k]}</span><span class='ck'>${svg(P.check, 16)}</span></button>`).join('');
  }

  /* ---------- Pengait ---------- */
  document.addEventListener('click', e => {
    const s = e.target.closest && e.target.closest('[data-theme-set]');
    if (s) { e.preventDefault(); set(s.dataset.themeSet); if (s.closest('.pop') && typeof TB !== 'undefined' && TB.close) TB.close(); return }   // TB = const global di app.js (bukan properti window)
    if (e.target.closest && e.target.closest('[data-theme-cycle]')) { e.preventDefault(); cycle() }
  });
  const onSys = () => { if (pref === 'system') apply(true) };
  if (mqL) { mqL.addEventListener ? mqL.addEventListener('change', onSys) : mqL.addListener && mqL.addListener(onSys) }
  if (mqM) { mqM.addEventListener ? mqM.addEventListener('change', meta) : mqM.addListener && mqM.addListener(meta) }
  addEventListener('storage', e => { if (e.key === KEY) { pref = read(); apply(true) } });
  addEventListener('pageshow', e => { if (e.persisted) { pref = read(); apply(false) } });   // kembali dari bfcache

  window.Theme = { get pref() { return pref }, get mode() { return mode }, set, cycle, bind, meta, refresh, picker, menu, icon: k => svg(P[k || mode]), labels: LBL };
  apply(false);
})();
