/* SekolahHub v2.17: pemindai QR kartu ID untuk absen hadir dan setor tabungan cepat.
 * - QR kartu ID berisi NIS (idcard.js). Pemindai mencocokkan NIS ke data siswa di memori.
 * - Mode "Absen hadir": mencatat Hadir untuk hari ini, terus memindai (sekali sentuh per siswa).
 * - Mode "Setor": membuka alur Setor bank yang sudah ada (konfirmasi, otorisasi, bukti), jadi aturan buku besar tetap berlaku.
 * - Dekode: BarcodeDetector bila ada (Chrome/Android), jika tidak jsQR (vendor/jsQR.js, dimuat saat dibutuhkan).
 * - Kolom NIS manual juga menerima pemindai USB/Bluetooth (mereka mengetik NIS lalu Enter).
 * Kamera hanya aktif selama jendela pemindai terbuka. Butuh HTTPS (otomatis di Vercel) dan izin kamera dari pengguna.
 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const E = x => (typeof esc == 'function' ? esc(x) : String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ST_LBL = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
  let ov = null, stream = null, timer = 0, det = null, mode = 'absen', last = { c: '', t: 0 }, n = 0, cvs = null, wired = false;

  /* ---------- Logika murni (diuji di Node) ---------- */
  function resolve(code) {
    const c = String(code == null ? '' : code).trim();
    if (!c) return { err: 'Kode kosong.' };
    if (/^https?:\/\//i.test(c)) return { err: 'Ini kode WhatsApp wali, bukan kode NIS. Pindai kode QR di sisi NIS.' };
    const m = db.siswa.filter(s => String(s.nis || '').trim() === c);
    if (!m.length) return { err: 'NIS ' + c + ' tidak ditemukan di data siswa.' };
    if (m.length > 1) return { err: 'NIS ' + c + ' dipakai ' + m.length + ' siswa (' + m.map(s => s.nama).join(', ') + '). Perbaiki NIS ganda di Data Siswa.' };
    return { s: m[0] };
  }
  function absen(s, force) {
    const tgl = today(), id = tgl + '_' + s.id, r = db.absensi.find(a => a.id == id);
    if (r && r.st == 'H') return { kind: 'dup', msg: s.nama + ' sudah tercatat hadir hari ini.' };
    if (r && !force) return { kind: 'ubah', msg: s.nama + ' tercatat ' + (ST_LBL[r.st] || r.st) + ' hari ini.', sid: s.id };
    if (r) r.st = 'H'; else db.absensi.push({ id, sid: s.id, tgl, st: 'H' });
    save();
    return { kind: 'ok', msg: s.nama + ' · Hadir' };
  }

  /* ---------- Umpan balik ---------- */
  function beep(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch (e) {}
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      const c = beep.c || (beep.c = new A()), o = c.createOscillator(), g = c.createGain();
      o.frequency.value = ok ? 880 : 220; g.gain.value = .05; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + (ok ? .09 : .2));
    } catch (e) {}
  }
  function say(t, kind) { const m = ov && ov.querySelector('.qs-msg'); if (!m) return; m.textContent = t || ''; m.className = 'qs-msg' + (kind ? ' ' + kind : ''); }
  function addLog(kind, html) {
    const l = ov && ov.querySelector('.qs-log'); if (!l) return;
    const d = document.createElement('div'); d.className = 'qs-it ' + kind; d.innerHTML = html;
    l.prepend(d); while (l.children.length > 30) l.lastChild.remove();
  }
  function sum() { const e = ov && ov.querySelector('.qs-sum'); if (e) e.textContent = mode == 'absen' ? n + ' siswa dicatat hadir pada sesi ini' : 'Setelah dipindai, alur Setor dibuka untuk konfirmasi'; }

  /* ---------- Proses satu kode ---------- */
  function handle(code) {
    if (!Data.canWrite()) { say('Akun Anda hanya bisa melihat. Pencatatan butuh peran Pengurus atau Admin.', 'er'); beep(false); return; }
    const r = resolve(code);
    if (r.err) { say(r.err, 'er'); addLog('er', E(r.err)); beep(false); return; }
    const s = r.s;
    if (mode == 'setor') { beep(true); close(); if (window.A && A.trx) A.trx(s.id, 'setor'); return; }
    const a = absen(s);
    if (a.kind == 'ok') { n++; say('✓ ' + a.msg, 'ok'); addLog('ok', '✓ ' + E(a.msg) + ' <small>Kelas ' + E(s.kelas) + '</small>'); beep(true); sum(); }
    else if (a.kind == 'dup') { say(a.msg, 'wr'); addLog('wr', E(a.msg)); beep(false); }
    else { say(a.msg, 'wr'); addLog('wr', E(a.msg) + ' <button type="button" class="s" data-ubah="' + E(a.sid) + '">Ubah ke Hadir</button>'); beep(false); }
  }
  function onCode(code) {
    const now = Date.now(); if (code == last.c && now - last.t < 3000) return;   // kartu yang sama tidak diproses berulang
    last = { c: code, t: now }; handle(code);
  }

  /* ---------- Kamera ---------- */
  function loadJs() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/jsQR.js'; s.onload = ok; s.onerror = () => no(new Error('jsQR')); document.head.appendChild(s); });
  }
  async function scanOnce(v) {
    if (det) { const r = await det.detect(v); return r && r[0] ? r[0].rawValue : ''; }
    const w = v.videoWidth, h = v.videoHeight; if (!w || !h) return '';
    const k = Math.min(1, 640 / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
    cvs = cvs || document.createElement('canvas'); cvs.width = cw; cvs.height = ch;
    const x = cvs.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, cw, ch);
    const im = x.getImageData(0, 0, cw, ch), q = window.jsQR(im.data, cw, ch, { inversionAttempts: 'dontInvert' });
    return q ? q.data : '';
  }
  async function loop() {
    const v = ov && ov.querySelector('video'); if (!v || !stream) return;
    try { const c = await scanOnce(v); if (c) onCode(c); } catch (e) { /* frame gagal: coba lagi */ }
    timer = setTimeout(loop, 160);
  }
  async function startCam() {
    const v = ov.querySelector('video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('Kamera tidak tersedia di peramban ini. Ketik atau pindai NIS di kolom bawah.', 'wr'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      v.srcObject = stream; await v.play();
    } catch (e) {
      stream = null;
      say(e && e.name == 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera di pengaturan situs, atau ketik NIS di kolom bawah.' : 'Kamera tidak bisa dibuka. Ketik NIS di kolom bawah.', 'er'); return;
    }
    det = null;
    if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; } }
    if (!det) { try { await loadJs(); } catch (e) { say('Pemindai cadangan gagal dimuat (cek koneksi). Ketik NIS di kolom bawah.', 'er'); return; } }
    say('Arahkan kamera ke kode QR di kartu.', '');
    loop();
  }
  function stopCam() { clearTimeout(timer); timer = 0; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } const v = ov && ov.querySelector('video'); if (v) v.srcObject = null; }
  function onVis() { if (!ov) return; if (document.hidden) stopCam(); else if (!stream) startCam(); }

  /* ---------- Jendela pemindai ---------- */
  function close() {
    stopCam(); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('keydown', onKey, true);
    if (ov) { ov.remove(); ov = null; }
    if (n > 0) { n = 0; try { if (typeof go == 'function') go(); } catch (e) {} }
  }
  function onKey(e) { if (e.key == 'Escape') { e.stopPropagation(); close(); } }
  function setMode(m) {
    mode = m; ov.querySelectorAll('.qs-tabs button').forEach(b => { const on = b.dataset.m == m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on) });
    say(m == 'absen' ? 'Mode absen: setiap kartu yang dipindai dicatat Hadir hari ini.' : 'Mode setor: kartu yang dipindai membuka form setoran.', ''); sum();
  }
  function open(m) {
    if (typeof Data == 'undefined' || !Data.canWrite()) { if (typeof toast == 'function') toast('Pemindai hanya untuk Admin atau Pengurus.'); return; }
    if (!db.siswa.length) { if (typeof toast == 'function') toast('Tambahkan siswa terlebih dahulu'); return; }
    if (ov) return;
    n = 0; last = { c: '', t: 0 };
    ov = document.createElement('div'); ov.className = 'qs'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Pemindai kartu ID');
    ov.innerHTML = `<div class='qs-card'><div class='qs-h'><b>Scan kartu ID</b><button type='button' class='ib qs-x' aria-label='Tutup'>✕</button></div>
<div class='qs-tabs'><button type='button' data-m='absen'>Absen hadir</button><button type='button' data-m='setor'>Setor tabungan</button></div>
<div class='qs-v'><video playsinline muted></video><i class='qs-fr'></i></div><div class='qs-msg' role='status' aria-live='polite'></div>
<form class='qs-man' autocomplete='off'><input inputmode='numeric' enterkeyhint='go' placeholder='Ketik atau pindai NIS, lalu Enter' aria-label='NIS siswa'><button type='submit' class='p'>Cari</button></form>
<div class='qs-sum'></div><div class='qs-log' aria-live='polite'></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.qs-x')) return close();
      const t = e.target.closest('.qs-tabs button'); if (t) return setMode(t.dataset.m);
      const u = e.target.closest('[data-ubah]');
      if (u) { const s = db.siswa.find(x => x.id == u.dataset.ubah); if (s) { const a = absen(s, true); if (a.kind == 'ok') { n++; say('✓ ' + a.msg, 'ok'); addLog('ok', '✓ ' + E(a.msg)); sum(); } } u.remove(); }
    });
    const f = ov.querySelector('.qs-man'), i = f.querySelector('input');
    f.addEventListener('submit', e => { e.preventDefault(); const v = i.value; i.value = ''; if (v.trim()) { last = { c: '', t: 0 }; handle(v); } i.focus(); });
    document.addEventListener('keydown', onKey, true); document.addEventListener('visibilitychange', onVis);
    setMode(m == 'setor' ? 'setor' : 'absen'); startCam();
  }

  window.QS = { open, close, _t: { resolve, absen } };
  if (typeof QA != 'undefined' && Array.isArray(QA)) QA.push(['Scan kartu ID (absen / setor)', () => QS.open()]);
})();
