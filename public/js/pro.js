/* SekolahHub v2.15: lapisan "profesional" (tanpa mengubah logika data)
 * - Aksesibilitas: tautan lewati, wilayah live untuk toast, nama dialog
 * - Ketahanan: banner offline, pemberitahuan versi baru (service worker), penangkap galat global
 * - Keamanan perangkat bersama: kunci otomatis saat tidak aktif (peringatan 60 detik, lalu keluar)
 * - Produktivitas: pintasan papan ketik (? bantuan, g lalu huruf = pindah menu)
 * Semua bagian defensif: bila elemen/objek yang dibutuhkan tidak ada, fitur itu dilewati diam-diam.
 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (html) e.innerHTML = html; return e; };
  const store = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} } };

  /* ---------- 1. Aksesibilitas ---------- */
  function a11y() {
    const main = $('#app');
    if (main) { main.setAttribute('tabindex', '-1'); main.setAttribute('role', 'main'); }
    const skip = el('a', { class: 'skip', href: '#app' }, 'Lewati ke konten utama');
    skip.addEventListener('click', e => { e.preventDefault(); const m = $('#app'); if (m) m.focus(); });
    document.body.prepend(skip);
    const t = $('#toast'); if (t) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); t.setAttribute('aria-atomic', 'true'); }
    const d = $('#dlg');
    if (d && window.MutationObserver) new MutationObserver(() => {
      const h = d.querySelector('h1,h2,h3'); if (h) d.setAttribute('aria-label', h.textContent.trim().slice(0, 80));
    }).observe(d, { childList: true, subtree: true });
  }

  /* ---------- 2. Banner offline ---------- */
  function offline() {
    const b = el('div', { class: 'pro-bar pro-off', role: 'status', hidden: '' }, 'Anda sedang offline. Perubahan ditahan dan dikirim ulang setelah tersambung.');
    document.body.appendChild(b);
    const upd = () => { b.hidden = navigator.onLine !== false; };
    addEventListener('online', upd); addEventListener('offline', upd); upd();
  }

  /* ---------- 3. Versi baru tersedia ---------- */
  function updates() {
    if (!('serviceWorker' in navigator)) return;
    const had = !!navigator.serviceWorker.controller;   // hanya tampil bila sebelumnya sudah ada SW (bukan pemasangan pertama)
    let shown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || shown) return; shown = true;
      const b = el('div', { class: 'pro-bar pro-upd', role: 'status' }, 'Versi baru aplikasi tersedia. <button type="button" class="p">Muat ulang</button>');
      b.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(b);
    });
  }

  /* ---------- 4. Penangkap galat global (tidak menampilkan jejak teknis ke pengguna) ---------- */
  function errors() {
    let last = 0;
    const note = (m) => {
      console.error('[SekolahHub]', m);
      const now = Date.now(); if (now - last < 5000) return; last = now;
      if (typeof window.toast === 'function') window.toast('Terjadi kendala tak terduga. Muat ulang halaman bila tampilan tidak normal.');
    };
    addEventListener('error', e => { if (e && e.message && !/ResizeObserver/.test(e.message)) note(e.error || e.message); });
    addEventListener('unhandledrejection', e => note(e.reason));
  }

  /* ---------- 5. Kunci otomatis saat tidak aktif ---------- */
  function idle() {
    // Menit; 0 = nonaktif. Dapat diubah per perangkat: localStorage['sh.idle'] = '30'
    const mins = () => { const v = parseFloat(store.get('sh.idle')); return isNaN(v) ? 20 : v; };
    const WARN = 60 * 1000;
    let tick = null, countdown = null, panel = null;
    const stamp = () => store.set('sh.act', String(Date.now()));
    const loggedIn = () => !!(window.Data && Data.user && Data.role && Data.role !== 'pending');
    const hide = () => { if (panel) { panel.remove(); panel = null; } clearInterval(countdown); countdown = null; };
    const out = () => { hide(); if (window.Data && Data.logout) Data.logout(); };
    const warn = () => {
      if (panel) return;
      let left = Math.round(WARN / 1000);
      panel = el('div', { class: 'pro-idle', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Sesi akan berakhir' },
        '<div class="pro-card"><h3>Masih di sana?</h3><p>Demi keamanan data keuangan, sesi akan berakhir otomatis dalam <b class="n">' + left + '</b> detik karena tidak ada aktivitas.</p><div class="acts"><button type="button" class="o">Keluar sekarang</button><button type="button" class="p k">Tetap masuk</button></div></div>');
      document.body.appendChild(panel);
      panel.querySelector('.k').addEventListener('click', () => { hide(); stamp(); schedule(); });
      panel.querySelector('.o').addEventListener('click', out);
      panel.querySelector('.k').focus();
      countdown = setInterval(() => { left--; const n = panel && panel.querySelector('.n'); if (n) n.textContent = Math.max(left, 0); if (left <= 0) out(); }, 1000);
    };
    function schedule() {
      clearTimeout(tick);
      const m = mins(); if (!m || m <= 0) return;
      const limit = m * 60 * 1000;
      tick = setTimeout(function chk() {
        if (!loggedIn()) { schedule(); return; }
        const quiet = Date.now() - (parseInt(store.get('sh.act'), 10) || 0);   // aktivitas di tab lain ikut dihitung
        if (quiet >= limit) warn(); else tick = setTimeout(chk, Math.max(limit - quiet, 1000));
      }, limit);
    }
    let throttle = 0;
    const act = () => { if (panel) return; const n = Date.now(); if (n - throttle < 5000) return; throttle = n; stamp(); };
    ['pointerdown', 'keydown', 'touchstart', 'scroll', 'visibilitychange'].forEach(ev => addEventListener(ev, act, { passive: true, capture: true }));
    stamp(); schedule();
  }

  /* ---------- 6. Pintasan papan ketik ---------- */
  function keys() {
    const GO = { d: 'dashboard', t: 'tabungan', k: 'kas', i: 'iuran', l: 'laporan', s: 'siswa', a: 'absensi', p: 'pengaturan' };
    const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || (document.activeElement && document.activeElement.isContentEditable);
    let g = 0, help = null;
    const closeHelp = () => { if (help) { help.remove(); help = null; } };
    const showHelp = () => {
      if (help) return closeHelp();
      help = el('div', { class: 'pro-idle', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pintasan papan ketik' },
        '<div class="pro-card"><h3>Pintasan papan ketik</h3><table class="pro-keys"><tbody>' +
        '<tr><td><kbd>/</kbd> atau <kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Cari siswa, menu, aksi</td></tr>' +
        '<tr><td><kbd>g</kbd> lalu <kbd>d</kbd></td><td>Beranda</td></tr><tr><td><kbd>g</kbd> lalu <kbd>t</kbd></td><td>Tabungan</td></tr>' +
        '<tr><td><kbd>g</kbd> lalu <kbd>k</kbd></td><td>Kas kelas</td></tr><tr><td><kbd>g</kbd> lalu <kbd>i</kbd></td><td>Iuran</td></tr>' +
        '<tr><td><kbd>g</kbd> lalu <kbd>l</kbd></td><td>Laporan</td></tr><tr><td><kbd>g</kbd> lalu <kbd>s</kbd></td><td>Data siswa</td></tr>' +
        '<tr><td><kbd>g</kbd> lalu <kbd>a</kbd></td><td>Absensi</td></tr><tr><td><kbd>?</kbd></td><td>Tampilkan / tutup bantuan ini</td></tr>' +
        '<tr><td><kbd>Esc</kbd></td><td>Tutup dialog</td></tr></tbody></table><div class="acts"><button type="button" class="p">Tutup</button></div></div>');
      help.addEventListener('click', e => { if (e.target === help || e.target.closest('button')) closeHelp(); });
      document.body.appendChild(help); help.querySelector('button').focus();
    };
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeHelp(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || typing()) return;
      const dlg = $('#dlg'); if (dlg && dlg.open) return;
      if (e.key === '?') { e.preventDefault(); showHelp(); return; }
      const k = e.key.toLowerCase();
      if (g && GO[k]) {
        g = 0;
        try { const n = (window.NAV || []).find(x => x[0] === GO[k]); if (n && (typeof navOk !== 'function' || navOk(n))) { e.preventDefault(); location.hash = GO[k]; } } catch (x) {}
        return;
      }
      g = k === 'g' ? Date.now() : 0;
      if (g) setTimeout(() => { g = 0; }, 1200);
    });
  }

  function init() { a11y(); offline(); updates(); errors(); idle(); keys(); }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
