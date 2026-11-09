/* SekolahHub: menu Keuangan standar perbankan (Tabungan, Kas Kelas, Iuran). Dimuat setelah app.js, pengaturan.js, import.js, siswa.js.
   Butuh migrasi 013 (buku besar permanen). Tanpa migrasi, setiap tampilan dan aksi kembali ke perilaku versi 2.10 dan menampilkan petunjuk.

   Prinsip (ditegakkan juga oleh trigger database, lihat supabase/migrations/013_perbankan.sql):
   - Buku besar permanen: transaksi tidak diubah atau dihapus. Kesalahan dikoreksi dengan PEMBATALAN (baris lawan bernilai negatif, rev_of = transaksi asal).
   - Setiap transaksi punya nomor referensi, waktu pembukuan, dan petugas. Bukti transaksi hanya tampil setelah server menerima ("Transaksi Berhasil").
   - Alur: input -> konfirmasi -> otorisasi kata sandi (nominal besar dan pembatalan) -> pembukuan -> bukti.
   - Tutup buku, saldo mengendap, saldo kas tidak boleh minus, pembatalan lintas hari hanya admin. */
(() => {
  'use strict';
  const O = {}, OV = {};                          // fungsi asli (fallback bila migrasi 013 belum dijalankan)
  window.BK = {};                                 // kendali inline (onclick) dan pembantu portal; diisi di akhir berkas
  const live = () => Data.bankOk !== false;
  const act = (n, fn) => { O[n] = A[n]; A[n] = function (...a) { return live() || !O[n] ? fn.apply(A, a) : O[n].apply(A, a) } };
  const view = (n, fn) => { OV[n] = V[n]; V[n] = () => live() ? fn() : migNote() + OV[n]() };
  const migNote = () => Data.canWrite() ? `<div class='bk-note'><b>Fitur perbankan belum aktif.</b> Jalankan <code>supabase/migrations/013_perbankan.sql</code> di SQL Editor Supabase, lalu muat ulang halaman. Sementara ini menu berjalan seperti versi sebelumnya.</div>` : '';

  /* ---------- Util ---------- */
  const kv = (a, b) => `<div class='kv'><span class='mu'>${a}</span><b>${b}</b></div>`;
  const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => B32[x % 32]).join('') };
  const yymmdd = t => t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10);
  const mkRef = (p, t) => p + yymmdd(t) + '-' + rnd(8);
  const nowIso = () => new Date().toISOString();
  const ld = w => w ? isoD(new Date(w)) : '';
  const jam = w => w ? new Date(w).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':') : '';
  const wkt = w => w ? fd(ld(w)) + ' · ' + jam(w) : '';
  const petus = () => { const e = (Data.user && Data.user.email) || '', p = e.split('@'); return p.length > 1 ? p[0].slice(0, 2) + '***@' + p[1] : '' };
  const ym01 = () => today().slice(0, 8) + '01';
  const prt = () => ST.print();
  const show = (html, k) => ST.show(html, k);
  const wr = () => Data.canWrite();
  const adm = () => Data.role == 'admin';
  const needW = () => wr() ? true : (toast('Hanya admin dan pengurus yang dapat mencatat transaksi'), false);
  const lim = () => +db.cfg.limitotor || 0, smin = () => +db.cfg.saldomin || 0, tutup = () => db.cfg.tutup || '';
  const cekTgl = t => !t ? 'Tanggal wajib diisi.' : t > dstr(1) ? 'Tanggal transaksi tidak boleh di masa depan.'
    : tutup() && t <= tutup() ? 'Periode sampai ' + fd(tutup()) + ' sudah ditutup (tutup buku). Gunakan tanggal setelahnya.' : '';
  const sameDay = t => !t.waktu || ld(t.waktu) === today();
  const errMsg = e => { const m = (e && e.message) || String(e || ''); return e && e.code == '42501' || /row-level|permission/i.test(m) ? 'Anda tidak punya izin untuk transaksi ini.' : /duplicate key/i.test(m) ? 'Transaksi ganda terdeteksi (nomor referensi atau pembatalan sudah ada).' : /fetch|network/i.test(m) ? 'Tidak ada koneksi ke server.' : m };

  /* No. rekening 12 digit diturunkan dari NIS (NIS unik). Tidak disimpan; selalu sama untuk siswa yang sama. */
  const noRek = s => { const n = String(s.nis || ''); let d; if (/^\d{1,11}$/.test(n)) d = '1' + n.padStart(11, '0'); else { let h = 0; for (const c of n + '|' + s.id) h = (h * 131 + c.charCodeAt(0)) % 99999999999; d = '9' + String(h).padStart(11, '0') } return d.replace(/(\d{4})(?=\d)/g, '$1 ') };
  const efT = t => (t.jenis === 'setor' ? 1 : -1) * t.jml, efK = k => (k.jenis === 'masuk' ? 1 : -1) * k.jml;
  const cmp = (a, b) => String(a.tgl).localeCompare(String(b.tgl)) || String(a.waktu || '').localeCompare(String(b.waktu || ''))
    || ((a.jenis === 'setor' || a.jenis === 'masuk') ? 0 : 1) - ((b.jenis === 'setor' || b.jenis === 'masuk') ? 0 : 1) || String(a.id).localeCompare(String(b.id));
  const revs = l => new Set(l.filter(x => x.rev_of).map(x => x.rev_of));
  const stat = (t, rs) => t.rev_of ? 'Pembatalan' : rs.has(t.id) ? 'Dibatalkan' : 'Berhasil';
  const stTag = s => `<span class='tag ${s === 'Berhasil' ? 'in' : 'vd'}'>${s}</span>`;
  const sgn = e => `<span class='${e >= 0 ? 'in' : 'out'}'>${e >= 0 ? '+' : '−'}${rp(Math.abs(e))}</span>`;
  const tabLbl = t => (t.rev_of ? 'Pembatalan ' : '') + (t.jenis === 'setor' ? 'setoran' : 'penarikan');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const dmy_ = t => t ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : '';
  const ledger = sid => { let b = 0; return db.tab.filter(t => t.sid == sid).sort(cmp).map(t => { b += efT(t); return { t, bal: b } }) };
  const kasL = () => { let b = 0; return db.kas.slice().sort(cmp).map(k => { b += efK(k); return { k, bal: b } }) };
  const rf = r => `<span class='rf'>${esc(r || '-')}</span>`;
  const SA = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const tb = n => { n = Math.floor(n); if (n < 12) return SA[n]; if (n < 20) return tb(n - 10) + ' belas'; if (n < 100) return tb(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + tb(n % 10) : '');
    if (n < 200) return 'seratus' + (n % 100 ? ' ' + tb(n % 100) : ''); if (n < 1e3) return tb(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + tb(n % 100) : '');
    if (n < 2e3) return 'seribu' + (n % 1e3 ? ' ' + tb(n % 1e3) : ''); if (n < 1e6) return tb(Math.floor(n / 1e3)) + ' ribu' + (n % 1e3 ? ' ' + tb(n % 1e3) : '');
    if (n < 1e9) return tb(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + tb(n % 1e6) : ''); if (n < 1e12) return tb(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + tb(n % 1e9) : '');
    return tb(Math.floor(n / 1e12)) + ' triliun' + (n % 1e12 ? ' ' + tb(n % 1e12) : '') };
  const terb = n => n === 0 ? 'Nol rupiah' : cap(tb(Math.abs(n)) + ' rupiah');
  const EYE = { on: `<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/></svg>`,
    off: `<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M3 3l18 18'/><path d='M10.6 6.1A10.5 10.5 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.6A17 17 0 002 12s3.6 7 10 7a10 10 0 004.2-.9'/><path d='M9.9 9.9a3 3 0 004.2 4.2'/></svg>` };
  let HIDE = false; try { HIDE = localStorage.getItem('sh.bk.hide') == '1' } catch (e) { /* abaikan */ }

  /* ---------- Posting ke buku besar (kolom ref, waktu, petugas dicap ulang oleh server) ---------- */
  const postTab = o => { const t = { id: uid(), sid: o.sid, tgl: o.tgl, jenis: o.jenis, jml: o.jml, cat: o.cat || '', ref: mkRef(o.rev_of ? 'REV' : 'TRX', o.tgl), kanal: o.kanal || 'Loket', waktu: nowIso(), petugas: petus(), rev_of: o.rev_of || '' }; db.tab.push(t); return t };
  const postKas = o => { const k = { id: uid(), tgl: o.tgl, jenis: o.jenis, jml: o.jml, ket: o.ket, kat: o.kat || '', ref: mkRef(o.rev_of ? 'REV' : 'KAS', o.tgl), kanal: o.kanal || '', waktu: nowIso(), petugas: petus(), rev_of: o.rev_of || '' }; db.kas.push(k); return k };
  const postIur = o => { const i = { id: uid(), sid: o.sid, bulan: o.bulan, minggu: o.minggu, jml: o.jml, tgl: o.tgl, cat: o.cat || '', ref: mkRef(o.rev_of ? 'REV' : 'IUR', o.tgl), kanal: o.kanal || '', waktu: nowIso(), petugas: petus(), rev_of: o.rev_of || '' }; db.iuran.push(i); return i };
  /* "Berhasil" hanya bila server menerima. Bila ditolak, onError (app.js) memuat ulang data dari server sehingga tidak ada transaksi semu. */
  async function commit() { syncKas(); await Data.push(db); if (Data.lastError) { try { await Data.rb } catch (e) { /* abaikan */ } return errMsg(Data.lastError) } return '' }

  /* ---------- Mesin alur: input -> konfirmasi -> otorisasi -> pembukuan -> bukti ----------
     o = { title, html(prev), wire(d), read(d) -> {err}|nilai, confirm(v) -> {rows, auth}, exec(v) -> hasil, done(hasil), next } */
  function flow(o, prev) {
    const d = show(`<h3>${o.title}</h3>${o.html(prev || {})}<div class='msg' id='err' role='alert'></div><div class='acts'><button id='x'>Batal</button><button class='p' id='ok'>${o.next || 'Lanjut'}</button></div>`);
    if (o.wire) o.wire(d);
    $('#ok').onclick = () => { const v = o.read(d); if (v.err) { $('#err').textContent = v.err; return } confirmStep(o, v) };
  }
  function confirmStep(o, v) {
    const c = o.confirm(v);
    show(`<h3>Konfirmasi</h3><p class='lab'>Periksa kembali sebelum diproses. Transaksi yang sudah dibukukan tidak dapat diubah, hanya dapat dibatalkan.</p><div class='bk-sum'>${c.rows.map(r => kv(r[0], r[1])).join('')}</div>`
      + (c.auth ? `<label>Kata sandi akun (otorisasi)<input id='pw' type='password' autocomplete='current-password'></label>` : '')
      + `<div class='msg' id='err' role='alert'></div><div class='acts'><button id='bk' type='button'>Ubah</button><button class='p' id='ok'>Konfirmasi</button></div>`);
    $('#bk').onclick = () => flow(o, v);
    if (c.auth) setTimeout(() => { const p = $('#pw'); if (p) p.focus() }, 50);
    $('#ok').onclick = async () => {
      const b = $('#ok'), er = $('#err'); b.disabled = true; b.textContent = 'Memproses…'; er.textContent = '';
      try {
        if (c.auth) await Data.reauth($('#pw').value);
        const res = o.exec(v), e = await commit();
        if (e) { er.textContent = 'Transaksi ditolak: ' + e + ' Tidak ada yang dibukukan.'; b.disabled = false; b.textContent = 'Coba lagi'; return }
        go(); o.done(res);
      } catch (e) { er.textContent = errMsg(e); b.disabled = false; b.textContent = 'Konfirmasi' }
    };
  }
  const fieldsFlow = o => {
    const fs = o.fields;
    flow({ ...o, html: p => (o.pre ? o.pre(p) : '') + fs.map(f => fld(f, p)).join('') + (o.extra ? o.extra(p) : ''),
      read: d => { const v = {}; for (const f of fs) { v[f.k] = $('#f_' + f.k).value.trim(); if (f.r && !v[f.k]) return { err: f.l + ' wajib diisi.' } } const e = o.check ? o.check(v) : ''; return e ? { err: e } : v } }, o.init);
  };

  /* ---------- Komponen tampilan ---------- */
  const acctCard = s => {
    const a = db.tab.some(t => t.sid == s.id) ? ldDormant(s) : ['Baru', ''];
    return `<div class='bk-card'><small>TABUNGAN SISWA · ${esc(db.cfg.sekolah)}</small><div class='nm'>${esc(s.nama)}</div><div class='nr'>${noRek(s)}</div><div class='lab' style='color:inherit;opacity:.85'>NIS ${esc(s.nis)} · Kelas ${esc(s.kelas)}</div>`
      + `<div class='sd'><span>${HIDE ? 'Rp •••••••' : rp(saldo(s.id))}</span><button type='button' class='eye bk-noprint' aria-label='${HIDE ? 'Tampilkan saldo' : 'Sembunyikan saldo'}' title='${HIDE ? 'Tampilkan saldo' : 'Sembunyikan saldo'}' onclick="BK.eye('${s.id}')">${EYE[HIDE ? 'off' : 'on']}</button></div><span class='st'>${a[0]}</span></div>`;
  };
  const ldDormant = s => { const l = db.tab.filter(t => t.sid == s.id).reduce((m, t) => t.tgl > m ? t.tgl : m, ''); return (Date.now() - new Date(l + 'T00:00')) / 864e5 > 90 && saldo(s.id) > 0 ? ['Dormant', 'vd'] : ['Aktif', 'in'] };
  const head = t => `<div style='display:flex;align-items:center;gap:8px;margin-bottom:6px'>${Brand.tile(26, 'inl')}<b>${esc(db.cfg.sekolah)}</b></div><h3 style='margin:0 0 4px'>${t}</h3>`;
  const lockNote = () => tutup() ? `<div class='bk-note bk-lock'>Buku ditutup sampai <b>${fd(tutup())}</b>. Transaksi bertanggal sampai tanggal tersebut ditolak; koreksi dibukukan sebagai pembatalan bertanggal hari ini.</div>` : '';

  /* ---------- Bukti transaksi ---------- */
  function rcpt(o) {
    return `<div class='bk-rcpt'><div class='ck ${o.warn ? 'no' : ''}'>${o.warn ? '!' : '✓'}</div><h3>${o.title}</h3><div class='am ${o.cls || ''}'>${o.amount}</div><div class='wk'>${o.when}</div><div class='kvs'>${o.rows.map(r => kv(r[0], r[1])).join('')}</div>`
      + (o.words ? `<div class='bk-terb'>Terbilang: ${esc(o.words)}</div>` : '') + `<div class='ft'>${o.foot || 'Simpan nomor referensi ini sebagai bukti transaksi yang sah.'}</div></div>`;
  }
  function buktiTab(t) {
    const s = sis(t.sid), rs = revs(db.tab), st = stat(t, rs), row = ledger(t.sid).find(x => x.t.id == t.id), e = efT(t);
    const orig = t.rev_of ? db.tab.find(x => x.id == t.rev_of) : null, byRev = rs.has(t.id) ? db.tab.find(x => x.rev_of == t.id) : null;
    const rows = [['Jenis transaksi', cap(tabLbl(t))], ['No. referensi', rf(t.ref)], ['Rekening', esc(s.nama)], ['No. rekening', noRek(s)], ['NIS / Kelas', esc(s.nis) + ' / ' + esc(s.kelas)], ['Tanggal transaksi', fd(t.tgl)]]
      .concat(t.cat ? [['Keterangan', esc(t.cat)]] : [], orig ? [['Membatalkan', rf(orig.ref)]] : [], byRev ? [['Dibatalkan oleh', rf(byRev.ref)]] : [],
        [['Saldo setelah transaksi', rp(row ? row.bal : saldo(t.sid))], ['Petugas', esc(t.petugas || '-')], ['Status', stTag(st)]]);
    show(rcpt({ title: st === 'Dibatalkan' ? 'Transaksi Dibatalkan' : 'Transaksi Berhasil', warn: st === 'Dibatalkan', amount: (e < 0 ? '−' : '') + rp(Math.abs(e)), cls: e >= 0 ? 'in' : 'out', when: wkt(t.waktu) || fd(t.tgl), rows, foot: 'Bukti ini dicetak dari ' + esc(Brand.name()) + '. Transaksi bersifat permanen; koreksi hanya melalui pembatalan.' })
      + `<div class='acts'><button id='x'>Tutup</button>${wr() ? `<button onclick="A.waStruk('${t.id}')">WhatsApp wali</button>` : ''}<button class='p' onclick='BK.prt()'>Cetak</button></div>`);
  }
  function buktiKas(k) {
    const rs = revs(db.kas), st = stat(k, rs), e = efK(k), iu = String(k.id).startsWith('iu_');
    const bend = db.struktur.find(j => /bendahara/i.test(j.jab)), orig = k.rev_of ? db.kas.find(x => x.id == k.rev_of) : null;
    show(head('Bukti Kas ' + (e >= 0 ? 'Masuk' : 'Keluar')) + rcpt({ title: st === 'Dibatalkan' ? 'Catatan Dibatalkan' : 'Kas Tercatat', warn: st === 'Dibatalkan', amount: (e < 0 ? '−' : '') + rp(Math.abs(e)), cls: e >= 0 ? 'in' : 'out', when: wkt(k.waktu) || fd(k.tgl), words: terb(Math.abs(e)),
      rows: [['No. bukti', rf(k.ref)], ['Tanggal', fd(k.tgl)], ['Jenis', k.rev_of ? 'Pembatalan ' + (k.jenis == 'masuk' ? 'pemasukan' : 'pengeluaran') : k.jenis == 'masuk' ? 'Pemasukan' : 'Pengeluaran'], ['Kategori', esc(k.kat || (iu ? 'Iuran' : '-'))], ['Uraian', esc(k.ket)]]
        .concat(orig ? [['Membatalkan', rf(orig.ref)]] : [], [['Petugas', esc(k.petugas || '-')], ['Status', stTag(st)]]), foot: 'Dokumen ini adalah bukti pencatatan kas kelas.' })
      + `<div class='bk-ttd'><div>Penerima / Penyetor<div class='sp'></div>(............)</div><div>Bendahara<div class='sp'></div><b>${bend ? esc(sis(bend.sid).nama) : '(............)'}</b></div><div>Wali kelas<div class='sp'></div><b>${esc(db.cfg.walikelas) || '(............)'}</b></div></div>`
      + `<div class='acts'><button id='x'>Tutup</button><button class='p' onclick='BK.prt()'>Cetak</button></div>`);
  }
  function buktiIur(i) {
    const s = sis(i.sid), rs = revs(db.iuran), st = stat(i, rs), e = i.jml, orig = i.rev_of ? db.iuran.find(x => x.id == i.rev_of) : null;
    const inv = i.minggu ? 'INV-' + i.minggu.replace(/-/g, '') + '-' + String(s.nis).replace(/\W/g, '') : '-';
    show(head('Kwitansi Iuran Kelas') + rcpt({ title: st === 'Dibatalkan' ? 'Pembayaran Dibatalkan' : 'Pembayaran Berhasil', warn: st === 'Dibatalkan', amount: (e < 0 ? '−' : '') + rp(Math.abs(e)), cls: e >= 0 ? 'in' : 'out', when: wkt(i.waktu) || fd(i.tgl), words: terb(Math.abs(e)),
      rows: [['No. referensi', rf(i.ref)], ['No. tagihan', esc(inv)], ['Nama siswa', esc(s.nama)], ['NIS / Kelas', esc(s.nis) + ' / ' + esc(s.kelas)], ['Periode', i.minggu ? esc(wkTitle(i.minggu)) : 'Iuran bulanan ' + esc(i.bulan)], ['Tanggal bayar', fd(i.tgl)]]
        .concat(i.cat ? [['Catatan', esc(i.cat)]] : [], orig ? [['Membatalkan', rf(orig.ref)]] : [], [['Petugas', esc(i.petugas || '-')], ['Status', stTag(st)]]), foot: 'Pembayaran mingguan otomatis tercatat sebagai pemasukan Kas Kelas.' })
      + `<div class='acts'><button id='x'>Tutup</button>${wr() ? `<button onclick="BK.waIur('${i.id}')">WhatsApp wali</button>` : ''}<button class='p' onclick='BK.prt()'>Cetak</button></div>`);
  }
  /* Rekap batch (setoran massal, iuran massal, tunggakan) sebagai kertas rekening koran. rows: [[rincian, no. referensi, jumlah]] */
  function rekap(title, rows, total, note) { ST.open({ title, paper: ST.rekapPaper(title, 'Batch Summary', note, rows, total) }) }

  /* ================= TABUNGAN ================= */
  const TS = { tab: 'rek', from: '', to: '', j: '', q: '' };
  const pgo = (a, b) => `<span class='stbtns'>${a}${b || ''}</span>`;
  view('tabungan', () => {
    const w = wr(), td = today(), rs = revs(db.tab), agg = new Map();
    db.tab.forEach(t => { const a = agg.get(t.sid) || { last: '' }; if (t.tgl > a.last) a.last = t.tgl; agg.set(t.sid, a) });
    const tot = db.siswa.reduce((a, s) => a + saldo(s.id), 0), act_ = db.siswa.filter(s => saldo(s.id) > 0).length;
    const kh = db.tab.filter(t => t.tgl == td).reduce((a, t) => { const e = efT(t); return e > 0 ? [a[0] + e, a[1]] : [a[0], a[1] - e] }, [0, 0]);
    const kpi = ST.sum([{ l: 'Total dana tabungan', v: rp(tot), s: act_ + ' rekening bersaldo dari ' + db.siswa.length, c: 'hero' }, { l: 'Kredit hari ini', v: rp(kh[0]), s: 'Total setoran', c: 'in' }, { l: 'Debit hari ini', v: rp(kh[1]), s: 'Total penarikan', c: 'out' }]);
    const tabs = ST.tabs([['rek', 'Rekening'], ['mut', 'Mutasi'], ['har', 'Penutupan harian']], TS.tab, 'BK.t');
    const dateBar = (f, to) => `<input type='date' value='${f}' max='${td}' onchange="BK.f('from',this.value)" aria-label='Dari tanggal'><input type='date' value='${to}' max='${td}' onchange="BK.f('to',this.value)" aria-label='Sampai tanggal'>`;
    let body = '';
    if (TS.tab == 'rek') {
      T = () => {
        const q = Q.toLowerCase(), l = db.siswa.filter(s => (s.nama + s.nis + s.kelas + noRek(s)).toLowerCase().includes(q) && (!KF || s.kelas == KF));
        return ST.t([['Rekening', 'rek'], ['Kelas', 'kelas'], ['Status', 'st'], ['Saldo', 'amt', 'r'], ['', 'act', 'r ac']], l.map(s => {
          const a = agg.get(s.id), st = a ? ldDormant(s) : ['Baru', ''];
          return [`<a class='pl' href='#profil-${s.id}'>${av(s, 32)}<span><b class='nm'>${esc(s.nama)}</b><span class='lab'>${noRek(s)} · NIS ${esc(s.nis)}</span></span></a>`, esc(s.kelas), `<span class='tag ${st[1]}'>${st[0]}</span>`, `<b>${rp(saldo(s.id))}</b>`,
            `${w ? `<button class='s' onclick="A.trx('${s.id}','setor')">Setor</button> <button class='s' onclick="A.trx('${s.id}','tarik')">Tarik</button> ` : ''}<button class='s' onclick="A.buku('${s.id}')">Mutasi</button>`]
        }), { cls: 'stm-l', empty: 'Belum ada siswa. Tambahkan di menu Data Siswa.' });
      };
      body = `<div class='bar'><input type='search' placeholder='Cari nama, NIS, atau no. rekening' value="${esc(Q)}" oninput="Q=this.value;$('#tb').innerHTML=T()" aria-label='Cari rekening'>${kfs()}<span class='sp'></span>${pgo(`<button onclick='A.csvTrx()'>Ekspor mutasi</button>`)}${w ? `<button onclick="IMP.open('tab')">Impor Excel</button><button onclick='A.massal()'>Setoran massal</button><button class='p' onclick='A.trx()'>Setor / Tarik</button>` : ''}</div><div class='card stcard' id='tb'>${T()}</div>`;
    } else if (TS.tab == 'mut') {
      const f = TS.from || ym01(), to = TS.to || td, q = TS.q.toLowerCase();
      const l = db.tab.filter(t => t.tgl >= f && t.tgl <= to && (!TS.j || (TS.j == 'rev' ? t.rev_of : TS.j == 'batal' ? rs.has(t.id) : !t.rev_of && t.jenis == TS.j))
        && (!q || (t.ref + ' ' + t.cat + ' ' + sis(t.sid).nama + ' ' + sis(t.sid).nis + ' ' + noRek(sis(t.sid))).toLowerCase().includes(q))).sort((a, b) => cmp(b, a));
      const k = l.reduce((a, t) => a + Math.max(0, efT(t)), 0), d = l.reduce((a, t) => a + Math.max(0, -efT(t)), 0);
      const rows = l.slice(0, 300).map(t => {
        const s = sis(t.sid), e = efT(t), st = stat(t, rs);
        return { cls: st == 'Dibatalkan' ? 'void' : '', c: [{ h: ST.dt(t.tgl, t.waktu), c: 'd' }, rf(t.ref), `<b class='nm'>${esc(s.nama)}</b><span class='lab'>${noRek(s)}</span>`, `${cap(tabLbl(t))}${t.cat ? ' · ' + esc(t.cat) : ''}`,
          e > 0 ? `<span class='in'>+${rp(e)}</span>` : '', e < 0 ? `<span class='out'>−${rp(-e)}</span>` : '', stTag(st),
          `<button class='s' onclick="A.struk('${t.id}')">Bukti</button>${w && st == 'Berhasil' ? ` <button class='s d' onclick="A.batalTrx('${t.id}')">Batalkan</button>` : ''}`] };
      });
      body = `<div class='bar'>${dateBar(f, to)}<select onchange="BK.f('j',this.value)" aria-label='Jenis transaksi'><option value=''>Semua jenis</option>${[['setor', 'Setoran'], ['tarik', 'Penarikan'], ['rev', 'Pembatalan'], ['batal', 'Dibatalkan']].map(x => `<option value='${x[0]}' ${TS.j == x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select><input type='search' placeholder='Cari referensi / nama' value="${esc(TS.q)}" onchange="BK.f('q',this.value)" aria-label='Cari transaksi'><span class='sp'></span>${pgo(`<button onclick='A.csvTrx()'>Ekspor CSV</button>`)}</div>`
        + ST.sum([{ l: 'Transaksi', v: l.length, s: dmy_(f) + ' – ' + dmy_(to) }, { l: 'Total kredit', v: rp(k), c: 'in' }, { l: 'Total debit', v: rp(d), c: 'out' }, { l: 'Selisih bersih', v: (k - d < 0 ? '−' : '') + rp(Math.abs(k - d)) }])
        + `<div class='card stcard'>${ST.t([['Tanggal &amp; Waktu', 'tgl'], ['No. Referensi', 'ref'], ['Rekening', 'rek'], ['Keterangan', 'ket'], ['Kredit', 'kre', 'r'], ['Debit', 'deb', 'r'], ['Status', 'st'], ['', 'act', 'r ac']], rows, { empty: 'Tidak ada transaksi pada filter ini.' })}${l.length > 300 ? `<p class='stn'>Menampilkan 300 dari ${l.length} transaksi. Persempit rentang tanggal atau ekspor CSV.</p>` : ''}</div>`;
    } else {
      const f = TS.from || dstr(-13), to = TS.to || td, all = new Map(), days = new Map();
      db.tab.forEach(t => { all.set(t.tgl, (all.get(t.tgl) || 0) + efT(t)); if (t.tgl >= f && t.tgl <= to) { const x = days.get(t.tgl) || { n: 0, k: 0, d: 0 }, e = efT(t); x.n++; if (e > 0) x.k += e; else x.d -= e; days.set(t.tgl, x) } });
      const cum = new Map(); let run = 0; [...all.keys()].sort().forEach(d => { run += all.get(d); cum.set(d, run) });
      const rows = [...days.keys()].sort().reverse().map(d => { const x = days.get(d);
        return [fd(d), String(x.n), `<span class='in'>${rp(x.k)}</span>`, `<span class='out'>${rp(x.d)}</span>`, `<b>${rp(cum.get(d) || 0)}</b>`, tutup() && d <= tutup() ? "<span class='tag in'>Ditutup</span>" : "<span class='tag'>Terbuka</span>"] });
      body = lockNote() + `<div class='bar'>${dateBar(f, to)}<span class='sp'></span>${adm() && Data.cfgBank ? `<button onclick='A.tutupBuku()' class='p'>Tutup buku</button>${tutup() ? `<button onclick='A.bukaBuku()'>Buka kembali</button>` : ''}` : ''}</div>`
        + `<div class='card stcard'>${ST.t([['Tanggal', 'rek'], ['Transaksi', 'trx', 'r'], ['Kredit', 'k2', 'r'], ['Debit', 'd2', 'r'], ['Saldo akhir hari', 'amt', 'r'], ['Status', 'st']], rows, { empty: 'Tidak ada transaksi pada rentang ini.' })}<p class='stn'>Saldo akhir hari = total dana seluruh rekening pada akhir tanggal tersebut. Tutup buku mengunci seluruh transaksi Tabungan, Iuran, dan Kas Kelas sampai tanggal yang dipilih.</p></div>`;
    }
    return `<h2>Tabungan Siswa</h2><p class='sub'>Rekening tabungan dengan nomor referensi, mutasi, bukti transaksi, dan tutup buku. Transaksi bersifat permanen; koreksi lewat pembatalan.</p>${kpi}${tabs}${body}`;
  });

  /* ---------- Mutasi rekening / rekening koran ---------- */
  let MP = today().slice(0, 7);
  function mutasi(sid) {
    const s = db.siswa.find(x => x.id == sid); if (!s) return;
    const ctl = acctCard(s)
      + (wr() ? `<div class='bk-acts bk-noprint'><button onclick="A.trx('${s.id}','setor')">⬇ Setor</button><button onclick="A.trx('${s.id}','tarik')">⬆ Tarik</button>${saldo(s.id) > 0 ? `<button onclick="A.tutupRek('${s.id}')">Tutup rekening</button>` : ''}</div>` : '')
      + `<div class='pbar bk-noprint'><input type='month' value='${MP}' max='${today().slice(0, 7)}' onchange="BK.mp(this.value,'${s.id}')" aria-label='Periode'><button type='button' onclick="BK.mp('','${s.id}')" ${MP ? '' : 'disabled'}>Semua periode</button></div>`;
    ST.open({ title: 'Mutasi Rekening', ctl, paper: ST.rekPaper(s.id, MP) });
  }
  act('buku', mutasi);
  act('struk', id => { const t = db.tab.find(x => x.id == id); if (t) buktiTab(t) });
  act('waStruk', id => { const t = db.tab.find(x => x.id == id); if (!t) return; const s = sis(t.sid), e = efT(t),
    u = waUrl(s.hp, `Bukti ${tabLbl(t)} tabungan ${s.nama} (kelas ${s.kelas}): ${rp(Math.abs(e))} pada ${fd(t.tgl)}. No. referensi ${t.ref}. Saldo tabungan saat ini ${rp(saldo(t.sid))}. Terima kasih. ${db.cfg.sekolah}`);
    if (!u) return toast('Nomor kontak wali kosong atau tidak valid'); window.open(u, '_blank', 'noopener') });

  /* ---------- Setor / tarik ---------- */
  act('trx', (sid, jenis) => {
    if (!needW()) return; if (!db.siswa.length) return toast('Tambahkan siswa terlebih dahulu');
    fieldsFlow({ title: 'Setor / Tarik Tunai', next: 'Lanjut ke konfirmasi', init: { sid, jenis: jenis || 'setor' },
      fields: [{ k: 'sid', l: 'Rekening', t: 'select', o: db.siswa.map(s => [s.id, s.nama + ' (' + s.kelas + ') · ' + noRek(s)]) }, { k: 'jenis', l: 'Jenis transaksi', t: 'select', o: [['setor', 'Setoran tunai'], ['tarik', 'Penarikan tunai']] },
        { k: 'jml', l: 'Nominal (Rp)', t: 'number', r: 1 }, { k: 'tgl', l: 'Tanggal transaksi', t: 'date', d: today(), r: 1 }, { k: 'cat', l: 'Berita / keterangan (opsional)' }],
      extra: () => `<div class='bk-chips'>${[5000, 10000, 20000, 50000, 100000].map(n => `<button type='button' class='s' onclick="BK.nom(${n})">${rp(n)}</button>`).join('')}</div><div class='bk-prev' id='bkp'></div>`,
      wire: () => { const up = () => { const s = $('#f_sid').value, sd = saldo(s); $('#bkp').textContent = 'Saldo saat ini ' + rp(sd) + (smin() ? ' · saldo mengendap minimal ' + rp(smin()) : '') + (lim() ? ' · penarikan ≥ ' + rp(lim()) + ' memerlukan otorisasi' : '') }; $('#f_sid').onchange = up; up() },
      check: v => { v.jml = +v.jml; if (!Number.isInteger(v.jml) || v.jml <= 0) return 'Nominal harus bilangan bulat lebih dari 0.'; if (v.jml > 1e10) return 'Nominal terlalu besar.'; const e = cekTgl(v.tgl); if (e) return e; if (v.cat.length > 120) return 'Keterangan maksimal 120 karakter.';
        if (v.jenis == 'tarik') { const sd = saldo(v.sid); if (v.jml > sd) return 'Saldo tidak cukup. Saldo saat ini ' + rp(sd) + '.'; if (sd - v.jml < smin()) return 'Penarikan melanggar saldo mengendap minimal ' + rp(smin()) + '. Maksimal penarikan ' + rp(Math.max(0, sd - smin())) + '. Gunakan Tutup rekening untuk menarik seluruh saldo.' } return '' },
      confirm: v => { const s = sis(v.sid), sd = saldo(v.sid); return { auth: v.jenis == 'tarik' && lim() > 0 && v.jml >= lim(), rows: [['Rekening', esc(s.nama)], ['No. rekening', noRek(s)], ['Jenis', v.jenis == 'setor' ? 'Setoran tunai' : 'Penarikan tunai'], ['Nominal', `<span class='${v.jenis == 'setor' ? 'in' : 'out'}'>${rp(v.jml)}</span>`], ['Tanggal', fd(v.tgl)], ['Keterangan', esc(v.cat) || '-'], ['Saldo saat ini', rp(sd)], ['Saldo setelah transaksi', rp(sd + (v.jenis == 'setor' ? v.jml : -v.jml))]] } },
      exec: v => { const t = postTab(v); logA((v.jenis == 'setor' ? 'Setoran ' : 'Penarikan ') + rp(v.jml) + ' · ' + sis(v.sid).nama + ' · ' + t.ref); return t }, done: buktiTab });
  });
  act('tutupRek', sid => {
    if (!needW()) return; const s = db.siswa.find(x => x.id == sid), sd = saldo(sid); if (!s || sd <= 0) return toast('Rekening tidak bersaldo'); const e0 = cekTgl(today()); if (e0) return toast(e0);
    fieldsFlow({ title: 'Tutup rekening', pre: () => acctCard(s) + `<p class='lab'>Seluruh saldo ditarik tunai dan dibukukan sebagai penarikan. Rekening tetap tercatat dengan saldo nol.</p>`, fields: [{ k: 'cat', l: 'Alasan penutupan (mis. lulus, pindah sekolah)', r: 1 }],
      confirm: v => ({ auth: true, rows: [['Rekening', esc(s.nama)], ['No. rekening', noRek(s)], ['Penarikan seluruh saldo', `<span class='out'>${rp(sd)}</span>`], ['Alasan', esc(v.cat)], ['Saldo setelah transaksi', rp(0)]] }),
      exec: v => { const t = postTab({ sid, jenis: 'tarik', jml: saldo(sid), tgl: today(), cat: 'Tutup rekening · ' + v.cat, kanal: 'Tutup rekening' }); logA('Tutup rekening ' + s.nama + ': ' + rp(t.jml) + ' · ' + t.ref); return t }, done: buktiTab });
  });
  act('massal', () => {
    if (!needW()) return; if (!db.siswa.length) return toast('Tambahkan siswa terlebih dahulu'); const ks = kelasList();
    const o = { title: 'Setoran massal per kelas', next: 'Lanjut ke konfirmasi',
      html: p => { const k = p.k || ks[0], tg = p.tg || today(); return `<label>Kelas<select id='mk'>${ks.map(x => `<option ${x == k ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><label>Tanggal<input id='md' type='date' value='${tg}'></label><label>Isi semua dengan (Rp)<input id='ma' type='number' min='1' placeholder='mis. 5000'></label>${db.siswa.filter(s => s.kelas == k).map(s => `<label>${esc(s.nama)}<input class='mi' data-s='${s.id}' type='number' min='0' placeholder='0' value='${p.m && p.m[s.id] || ''}'></label>`).join('')}` },
      wire: d => { $('#mk').onchange = e => flow(o, { k: e.target.value, tg: $('#md').value }); $('#ma').oninput = e => d.querySelectorAll('.mi').forEach(i => i.value = e.target.value) },
      read: d => { const m = {}, rows = []; let tot = 0; for (const i of d.querySelectorAll('.mi')) { if (i.value === '' || +i.value === 0) continue; const v = +i.value; if (!Number.isInteger(v) || v < 0) return { err: 'Nominal harus bilangan bulat positif.' }; rows.push({ sid: i.dataset.s, jml: v }); m[i.dataset.s] = v; tot += v }
        const tg = $('#md').value, e = cekTgl(tg); if (e) return { err: e }; if (!rows.length) return { err: 'Isi minimal satu nominal.' }; return { k: $('#mk').value, tg, rows, tot, m } },
      confirm: v => ({ auth: false, rows: [['Kelas', esc(v.k)], ['Tanggal', fd(v.tg)], ['Jumlah rekening', v.rows.length], ['Total setoran', `<span class='in'>${rp(v.tot)}</span>`]] }),
      exec: v => { const batch = 'BCH' + yymmdd(v.tg) + '-' + rnd(6), l = v.rows.map(r => postTab({ sid: r.sid, jenis: 'setor', jml: r.jml, tgl: v.tg, cat: 'Setoran massal · ' + batch, kanal: 'Massal' })); logA('Setoran massal kelas ' + v.k + ': ' + l.length + ' siswa, ' + rp(v.tot) + ' · ' + batch); return { batch, l, tot: v.tot } },
      done: r => rekap('Rekap Setoran Massal', r.l.map(t => [esc(sis(t.sid).nama), rf(t.ref), ST.num(t.jml)]), r.tot, 'Batch ' + r.batch + ' · ' + r.l.length + ' setoran berhasil dibukukan.') };
    flow(o);
  });

  /* ---------- Pembatalan (reversal) ---------- */
  const pembatalan = (kind, orig, post, extraChk) => {
    if (!needW()) return;
    const col = kind == 'tab' ? db.tab : kind == 'kas' ? db.kas : db.iuran, rs = revs(col);
    if (orig.rev_of) return toast('Pembatalan tidak dapat dibatalkan lagi'); if (rs.has(orig.id)) return toast('Transaksi ini sudah dibatalkan');
    if (!sameDay(orig) && !adm()) return toast('Pembatalan lintas hari hanya dapat dilakukan admin');
    const e0 = cekTgl(today()) || (extraChk && extraChk()); if (e0) return toast(e0);
    const nm = kind == 'tab' ? cap(tabLbl(orig)) : kind == 'kas' ? (orig.jenis == 'masuk' ? 'Pemasukan kas' : 'Pengeluaran kas') : 'Pembayaran iuran';
    const amt = kind == 'tab' ? rp(orig.jml) : rp(orig.jml);
    fieldsFlow({ title: 'Pembatalan transaksi', pre: () => `<div class='bk-sum'>${kv('Transaksi', nm)}${kv('No. referensi', rf(orig.ref))}${kv('Nominal', amt)}${kv('Tanggal', fd(orig.tgl))}</div><p class='lab'>Dibukukan baris pembatalan bernilai kebalikan, bertanggal hari ini. Transaksi asal tetap tercatat dengan status Dibatalkan.</p>`,
      fields: [{ k: 'alasan', l: 'Alasan pembatalan', t: 'area', r: 1 }], check: v => v.alasan.length < 5 ? 'Alasan minimal 5 karakter.' : '',
      confirm: v => ({ auth: true, rows: [['Transaksi asal', rf(orig.ref)], ['Nominal dibatalkan', `<span class='out'>${amt}</span>`], ['Alasan', esc(v.alasan)], ['Tanggal pembatalan', fd(today())]] }),
      exec: v => { const r = post(v.alasan); logA('Pembatalan ' + orig.ref + ': ' + v.alasan); return r }, done: kind == 'tab' ? buktiTab : kind == 'kas' ? buktiKas : buktiIur });
  };
  act('batalTrx', id => { const t = db.tab.find(x => x.id == id); if (!t) return;
    pembatalan('tab', t, a => postTab({ sid: t.sid, jenis: t.jenis, jml: -t.jml, tgl: today(), cat: 'Pembatalan ' + t.ref + ' · ' + a, rev_of: t.id, kanal: 'Pembatalan' }), () => t.jenis == 'setor' && saldo(t.sid) < t.jml ? 'Saldo tidak cukup untuk membatalkan setoran ini (dana sudah ditarik).' : '') });
  act('delTrx', id => A.batalTrx(id));
  act('tutupBuku', () => {
    if (!adm()) return toast('Hanya admin yang dapat menutup buku'); const td = today();
    fieldsFlow({ title: 'Tutup buku', pre: () => `<p class='lab'>Transaksi Tabungan, Iuran, dan Kas Kelas bertanggal sampai tanggal ini akan terkunci untuk semua peran.${tutup() ? ' Saat ini ditutup sampai ' + fd(tutup()) + '.' : ''}</p>`, fields: [{ k: 'tgl', l: 'Tutup buku sampai tanggal', t: 'date', d: td, r: 1 }],
      check: v => v.tgl > td ? 'Tanggal tutup buku tidak boleh di masa depan.' : tutup() && v.tgl <= tutup() ? 'Buku sudah ditutup sampai ' + fd(tutup()) + '. Pilih tanggal setelahnya atau gunakan Buka kembali.' : '',
      confirm: v => { const n = c => c.filter(x => x.tgl <= v.tgl).length; return { auth: true, rows: [['Tutup buku sampai', fd(v.tgl)], ['Transaksi tabungan terkunci', n(db.tab)], ['Pembayaran iuran terkunci', n(db.iuran)], ['Catatan kas terkunci', n(db.kas)], ['Total dana tabungan', rp(db.tab.filter(t => t.tgl <= v.tgl).reduce((a, t) => a + efT(t), 0))], ['Saldo kas kelas', rp(db.kas.filter(k => k.tgl <= v.tgl).reduce((a, k) => a + efK(k), 0))]] } },
      exec: v => { db.cfg.tutup = v.tgl; logA('Tutup buku sampai ' + fd(v.tgl)); return v }, done: v => { show(`<h3>Buku ditutup</h3><p>Transaksi sampai <b>${fd(v.tgl)}</b> kini terkunci.</p><div class='acts'><button class='p' id='x'>Selesai</button></div>`) } });
  });
  act('bukaBuku', () => {
    if (!adm() || !tutup()) return;
    fieldsFlow({ title: 'Buka kembali buku', pre: () => `<p class='lab'>Saat ini ditutup sampai ${fd(tutup())}. Tentukan tanggal tutup buku yang baru (lebih awal), atau kosongkan untuk membuka seluruh periode. Tindakan ini dicatat di Aktivitas.</p>`,
      fields: [{ k: 'tgl', l: 'Tutup buku baru (opsional)', t: 'date' }, { k: 'alasan', l: 'Alasan membuka kembali', t: 'area', r: 1 }], check: v => v.tgl && v.tgl >= tutup() ? 'Tanggal baru harus lebih awal dari tutup buku saat ini.' : v.alasan.length < 5 ? 'Alasan minimal 5 karakter.' : '',
      confirm: v => ({ auth: true, rows: [['Tutup buku saat ini', fd(tutup())], ['Tutup buku baru', v.tgl ? fd(v.tgl) : 'Dibuka seluruhnya'], ['Alasan', esc(v.alasan)]] }),
      exec: v => { logA('Buku dibuka kembali (sebelumnya ' + fd(tutup()) + ', sekarang ' + (v.tgl ? fd(v.tgl) : 'terbuka') + '): ' + v.alasan); db.cfg.tutup = v.tgl || ''; return v }, done: () => show(`<h3>Buku dibuka kembali</h3><div class='acts'><button class='p' id='x'>Selesai</button></div>`) });
  });

  /* ================= KAS KELAS ================= */
  let KM = today().slice(0, 7), KC = '';
  const KATM = ['Sumbangan', 'Dana kegiatan', 'Alat tulis (ATK)', 'Kebersihan', 'Konsumsi', 'Kegiatan kelas', 'Perlengkapan', 'Sosial', 'Lain-lain'];
  const kasPeriode = () => { const L = kasL(), before = (L.filter(x => x.k.tgl.slice(0, 7) < KM).slice(-1)[0] || { bal: 0 }).bal, P = L.filter(x => x.k.tgl.slice(0, 7) == KM);
    const m = P.reduce((a, x) => a + Math.max(0, efK(x.k)), 0), kl = P.reduce((a, x) => a + Math.max(0, -efK(x.k)), 0); return { before, P, m, kl, after: before + m - kl } };
  view('kas', () => {
    const w = wr(), rs = revs(db.kas), p = kasPeriode(), l = (KC ? p.P.filter(x => (x.k.kat || '') == KC) : p.P).slice().reverse(), ks = [-5, -4, -3, -2, -1, 0].map(mk), f = (m, j) => db.kas.filter(k => k.jenis == j && k.tgl.slice(0, 7) == m).reduce((a, k) => a + k.jml, 0);
    const ym = new Date(+KM.slice(0, 4), +KM.slice(5) - 1, 1), ml = BLF[ym.getMonth()] + ' ' + ym.getFullYear(), kats = [...new Set(db.kas.map(k => k.kat).filter(Boolean))];
    const rows = l.map(x => {
      const k = x.k, e = efK(k), st = stat(k, rs), iu = String(k.id).startsWith('iu_');
      return { cls: st == 'Dibatalkan' ? 'void' : '', c: [{ h: ST.dt(k.tgl, k.waktu), c: 'd' }, rf(k.ref), `<b class='nm'>${esc(k.ket)}</b><span class='lab'>${k.kat ? `<span class='tag'>${esc(k.kat)}</span> ` : ''}${st != 'Berhasil' ? stTag(st) : ''}</span>`,
        e > 0 ? `<span class='in'>+${rp(e)}</span>` : '', e < 0 ? `<span class='out'>−${rp(-e)}</span>` : '', KC ? '' : rp(x.bal),
        `<button class='s' onclick="A.buktiKas('${k.id}')">Bukti</button> ${iu ? "<span class='tag'>Dari Iuran</span>" : w && st == 'Berhasil' ? `<button class='s d' onclick="A.delK('kas','${k.id}')">Batalkan</button>` : ''}`] };
    });
    return `<h2>Kas Kelas</h2><p class='sub'>Buku kas dengan nomor bukti, saldo berjalan, dan pembatalan. Iuran mingguan masuk otomatis dari menu Iuran. Saldo kas tidak boleh minus.</p>${lockNote()}`
      + ST.sum([{ l: 'Saldo awal ' + ml, v: rp(p.before) }, { l: 'Pemasukan', v: rp(p.m), c: 'in' }, { l: 'Pengeluaran', v: rp(p.kl), c: 'out' }, { l: 'Saldo akhir ' + ml, v: rp(p.after), s: 'Saldo kas saat ini ' + rp(kasSaldo()), c: 'hero' }])
      + `<div class='card' style='margin-bottom:14px'><div class='ch'><h3>Kas masuk dan keluar</h3><span class='lab'>6 bulan terakhir</span></div>${CH.bars(ks.map(mlab), [{ n: 'Masuk', c: 'var(--ok)', v: ks.map(m => f(m, 'masuk')) }, { n: 'Keluar', c: 'var(--er)', v: ks.map(m => f(m, 'keluar')) }])}</div>`
      + `<div class='bar'><span class='stmon'><button type='button' onclick='BK.km(-1)' aria-label='Bulan sebelumnya'>‹</button><b>${ml}</b><button type='button' onclick='BK.km(1)' aria-label='Bulan berikutnya'>›</button></span><select onchange="KC=this.value;go()" aria-label='Kategori'><option value=''>Semua kategori</option>${kats.map(c => `<option ${c == KC ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><span class='sp'></span>${pgo(`<button onclick='A.csvKas()'>Ekspor CSV</button>`, `<button onclick='A.cetakKas()'>Cetak buku kas</button>`)}${w ? `<button onclick="IMP.open('kas')">Impor Excel</button><button onclick='A.opname()'>Opname kas</button><button class='p' onclick='A.kas()'>Catat kas</button>` : ''}</div>`
      + `<div class='card stcard'>${ST.t([['Tanggal &amp; Waktu', 'tgl'], ['No. Bukti', 'ref'], ['Uraian', 'ket'], ['Masuk', 'kre', 'r'], ['Keluar', 'deb', 'r'], ['Saldo', 'sal', 'r'], ['', 'act', 'r ac']], rows, { empty: 'Belum ada catatan kas pada bulan ini.' })}${KC ? `<p class='stn'>Saldo berjalan tidak ditampilkan saat memfilter kategori.</p>` : ''}</div>`;
  });
  act('buktiKas', id => { const k = db.kas.find(x => x.id == id); if (k) buktiKas(k) });
  act('kas', jenis => {
    if (!needW()) return;
    fieldsFlow({ title: 'Catat kas kelas', next: 'Lanjut ke konfirmasi', init: { jenis: jenis || 'masuk' },
      fields: [{ k: 'jenis', l: 'Jenis', t: 'select', o: [['masuk', 'Pemasukan'], ['keluar', 'Pengeluaran']] }, { k: 'jml', l: 'Nominal (Rp)', t: 'number', r: 1 }, { k: 'tgl', l: 'Tanggal', t: 'date', d: today(), r: 1 },
        { k: 'kat', l: 'Kategori', t: 'select', o: KATM.map(x => [x, x]) }, { k: 'ket', l: 'Uraian', r: 1 }, { k: 'pihak', l: 'Penerima / penyetor (opsional)' }],
      extra: () => `<div class='bk-prev'>Saldo kas saat ini ${rp(kasSaldo())}${lim() ? ' · pengeluaran ≥ ' + rp(lim()) + ' memerlukan otorisasi' : ''}</div>`,
      check: v => { v.jml = +v.jml; if (!Number.isInteger(v.jml) || v.jml <= 0) return 'Nominal harus bilangan bulat lebih dari 0.'; if (v.jml > 1e10) return 'Nominal terlalu besar.'; const e = cekTgl(v.tgl); if (e) return e; if (v.ket.length > 140) return 'Uraian maksimal 140 karakter.';
        return v.jenis == 'keluar' && v.jml > kasSaldo() ? 'Saldo kas tidak cukup. Saldo kas saat ini ' + rp(kasSaldo()) + '.' : '' },
      confirm: v => ({ auth: v.jenis == 'keluar' && lim() > 0 && v.jml >= lim(), rows: [['Jenis', v.jenis == 'masuk' ? 'Pemasukan' : 'Pengeluaran'], ['Nominal', `<span class='${v.jenis == 'masuk' ? 'in' : 'out'}'>${rp(v.jml)}</span>`], ['Tanggal', fd(v.tgl)], ['Kategori', esc(v.kat)], ['Uraian', esc(v.ket)], ['Pihak', esc(v.pihak) || '-'], ['Saldo kas setelah transaksi', rp(kasSaldo() + (v.jenis == 'masuk' ? v.jml : -v.jml))]] }),
      exec: v => { const k = postKas({ tgl: v.tgl, jenis: v.jenis, jml: v.jml, ket: v.ket + (v.pihak ? ' · ' + (v.jenis == 'keluar' ? 'Penerima' : 'Dari') + ': ' + v.pihak : ''), kat: v.kat }); logA('Kas ' + (v.jenis == 'masuk' ? 'masuk ' : 'keluar ') + rp(v.jml) + ' · ' + v.ket + ' · ' + k.ref); return k }, done: buktiKas });
  });
  act('delK', (k, id) => {
    if (k != 'kas') return O.delK(k, id);
    if (String(id).startsWith('iu_')) return toast('Dibuat otomatis dari Iuran. Batalkan pembayarannya di menu Iuran.');
    const x = db.kas.find(r => r.id == id); if (!x) return;
    pembatalan('kas', x, a => postKas({ tgl: today(), jenis: x.jenis, jml: -x.jml, ket: 'Pembatalan ' + x.ref + ' · ' + a, kat: x.kat, rev_of: x.id, kanal: 'Pembatalan' }),
      () => x.jenis == 'masuk' && kasSaldo() < x.jml ? 'Saldo kas tidak cukup untuk membatalkan pemasukan ini (dana sudah dipakai).' : '');
  });
  act('opname', () => {
    if (!needW()) return; const buku = kasSaldo();
    const o = { title: 'Opname kas', next: 'Lanjut', html: p => `<p class='lab'>Hitung uang kas fisik, lalu bandingkan dengan saldo buku. Selisih dibukukan sebagai penyesuaian bertanda “Selisih kas”.</p><div class='bk-sum'>${kv('Saldo buku', rp(buku))}</div><label>Uang kas fisik (Rp)<input id='f_fisik' inputmode='numeric' value='${p.fisik ?? ''}'></label><div class='bk-prev' id='bkp'>Masukkan jumlah uang fisik.</div><label>Alasan selisih (wajib bila ada selisih)<textarea id='f_alasan' rows='2'>${esc(p.alasan || '')}</textarea></label>`,
      wire: () => { $('#f_fisik').oninput = e => { const f = +e.target.value.replace(/\D/g, ''); $('#bkp').textContent = e.target.value === '' ? 'Masukkan jumlah uang fisik.' : f == buku ? 'Sesuai. Tidak ada selisih.' : f > buku ? 'Lebih ' + rp(f - buku) : 'Kurang ' + rp(buku - f) } },
      read: () => { const raw = $('#f_fisik').value.replace(/\D/g, ''), alasan = $('#f_alasan').value.trim(); if (raw === '') return { err: 'Uang kas fisik wajib diisi.' }; const fisik = +raw, sel = fisik - buku;
        if (sel && alasan.length < 5) return { err: 'Alasan selisih wajib diisi (minimal 5 karakter).' }; const e = sel ? cekTgl(today()) : ''; return e ? { err: e } : { fisik, alasan, sel } },
      confirm: v => ({ auth: v.sel != 0, rows: [['Saldo buku', rp(buku)], ['Uang kas fisik', rp(v.fisik)], ['Selisih', v.sel == 0 ? 'Sesuai' : `<span class='${v.sel > 0 ? 'in' : 'out'}'>${v.sel > 0 ? 'Lebih ' : 'Kurang '}${rp(Math.abs(v.sel))}</span>`], ['Tindakan', v.sel == 0 ? 'Hanya dicatat di Aktivitas' : 'Dibukukan penyesuaian ' + (v.sel > 0 ? 'pemasukan' : 'pengeluaran')]] }),
      exec: v => { logA('Opname kas: fisik ' + rp(v.fisik) + ', buku ' + rp(buku) + ', selisih ' + (v.sel > 0 ? '+' : v.sel < 0 ? '−' : '') + rp(Math.abs(v.sel)) + (v.alasan ? ' · ' + v.alasan : '')); return v.sel ? postKas({ tgl: today(), jenis: v.sel > 0 ? 'masuk' : 'keluar', jml: Math.abs(v.sel), ket: 'Penyesuaian opname kas · ' + v.alasan, kat: 'Selisih kas', kanal: 'Opname' }) : null },
      done: k => k ? buktiKas(k) : show(`<h3>Opname tercatat</h3><p>Saldo buku sesuai dengan uang fisik.</p><div class='acts'><button class='p' id='x'>Selesai</button></div>`) };
    flow(o);
  });
  act('cetakKas', () => { ST.open({ title: 'Buku Kas Kelas', paper: ST.kasPaper(KM) }) });
  act('csvKas', () => { const rs = revs(db.kas); csv('buku-kas', [['Tanggal', 'Waktu', 'No. bukti', 'Jenis', 'Kategori', 'Uraian', 'Masuk', 'Keluar', 'Saldo', 'Status', 'Membatalkan', 'Petugas'],
    ...kasL().map(x => { const k = x.k, e = efK(k), o = k.rev_of ? (db.kas.find(r => r.id == k.rev_of) || {}).ref : ''; return [k.tgl, jam(k.waktu), k.ref, k.jenis == 'masuk' ? 'Masuk' : 'Keluar', k.kat, k.ket, e > 0 ? e : '', e < 0 ? -e : '', x.bal, stat(k, rs), o || '', k.petugas] })]) });
  act('csvTrx', () => { const rs = revs(db.tab); csv('mutasi-tabungan', [['Tanggal', 'Waktu', 'No. referensi', 'No. rekening', 'Nama', 'NIS', 'Kelas', 'Jenis', 'Kredit', 'Debit', 'Saldo', 'Keterangan', 'Status', 'Membatalkan', 'Petugas'],
    ...(() => { const run = new Map(), byId = new Map(db.tab.map(r => [r.id, r])); return db.tab.slice().sort(cmp).map(t => { const s = sis(t.sid), e = efT(t), o = t.rev_of ? (byId.get(t.rev_of) || {}).ref : '', b = (run.get(t.sid) || 0) + e; run.set(t.sid, b); return [t.tgl, jam(t.waktu), t.ref, noRek(s), s.nama, s.nis, s.kelas, cap(tabLbl(t)), e > 0 ? e : '', e < 0 ? -e : '', b, t.cat, stat(t, rs), o || '', t.petugas] }) })()]) });

  /* ================= IURAN ================= */
  view('iuran', () => {
    if (Data.weekOk === false) return OV.iuran();
    const w = wr(), nom = +db.cfg.iuran || 0, l = db.siswa.filter(s => !IK || s.kelas == IK), ws = wksOf(IM), cw = wkOf(today()), y = IM.slice(0, 4), ids = new Set(l.map(s => s.id)), rs = revs(db.iuran),
      mon = sid => ws.reduce((a, x) => a + paidWeek(sid, x), 0), tm = l.reduce((a, s) => a + mon(s.id), 0), started = ws.filter(x => x <= cw),
      billed = nom * l.length * started.length, paid = l.reduce((a, s) => a + started.reduce((b, x) => b + Math.min(paidWeek(s.id, x), nom), 0), 0), kol = billed ? Math.round(paid / billed * 100) : null,
      ar = new Map(l.map(s => [s.id, arrearsOf(s.id)])), totAr = [...ar.values()].reduce((a, x) => a + x.jml, 0), nAr = [...ar.values()].filter(x => x.n).length, ym = new Date(+y, +IM.slice(5) - 1, 1), ml = BLF[ym.getMonth()] + ' ' + y;
    const hist = db.iuran.filter(i => ids.has(i.sid) && (ws.includes(i.minggu) || (!i.minggu && i.bulan == IM))).sort((a, b) => cmp(b, a));
    const mrows = l.map(s => {
      const a = ar.get(s.id), kc = !a.n ? '' : a.n <= 2 ? 'w' : 'b';
      return [`<span class='bk-kol ${kc}' title='${!a.n ? 'Lancar' : a.n <= 2 ? 'Tunggakan ringan' : 'Tunggakan berat'}'></span>${esc(s.nama)}`,
        ...ws.map(x => { const p = paidWeek(s.id, x); return `<button class='s cell ${p && p >= nom ? 'in' : ''}' title='${p ? rp(p) : 'Belum bayar'}' aria-label='${esc(s.nama)}, ${esc(wkTitle(x))}: ${p ? (p >= nom ? 'lunas' : 'sebagian') : 'belum bayar'}' onclick="A.bayar('${s.id}','${x}')">${p ? (p >= nom ? '✓' : '~') : '·'}</button>` }),
        rp(mon(s.id)), a.n ? `<span class='out'>${rp(a.jml)}</span> ${w ? `<button class='s' onclick="A.iuranTunggak('${s.id}')">Bayar</button>` : ''}` : '–'];
    });
    const hrows = hist.slice(0, 200).map(i => {
      const st = stat(i, rs);
      return { cls: st == 'Dibatalkan' ? 'void' : '', c: [{ h: ST.dt(i.tgl, i.waktu), c: 'd' }, rf(i.ref), `<b class='nm'>${esc(sis(i.sid).nama)}</b>`, i.minggu ? 'Mg ' + wkNo(i.minggu) + ' (' + esc(wkRange(i.minggu)) + ')' : 'Bulanan (lama)', `<span class='${i.jml >= 0 ? 'in' : 'out'}'>${i.jml >= 0 ? '+' : '−'}${rp(Math.abs(i.jml))}</span>`, stTag(st),
        `<button class='s' onclick="A.kwitansi('${i.id}')">Kwitansi</button>${w && st == 'Berhasil' && i.minggu ? ` <button class='s d' onclick="A.batalIuran('${i.id}')">Batalkan</button>` : ''}`] };
    });
    return `<h2>Iuran Kelas</h2><p class='sub'>Tagihan iuran per minggu dengan nomor tagihan, kwitansi, tunggakan, dan pembatalan. Setiap pembayaran otomatis masuk ke Kas Kelas.</p>${lockNote()}`
      + ST.sum([{ l: 'Iuran per minggu', v: nom ? rp(nom) : 'Belum diatur', s: 'Atur di menu Pengaturan' }, { l: 'Terkumpul ' + ml, v: rp(tm), s: 'Tagihan berjalan ' + rp(billed), c: 'hero' }, { l: 'Kolektibilitas', v: kol !== null ? kol + '%' : '–', s: 'Persentase tagihan berjalan yang sudah dibayar' }, { l: 'Tunggakan (minggu lalu)', v: rp(totAr), s: nAr + ' siswa menunggak', c: totAr ? 'out' : '' }])
      + `<div class='card' style='margin-bottom:14px'><div class='ch'><h3>Iuran terkumpul per minggu · ${ml}</h3><span class='lab'>dibanding target</span></div>${CH.bars(ws.map((x, i) => 'Mg ' + (i + 1)), [{ n: 'Terkumpul', c: 'var(--pr)', v: ws.map(x => l.reduce((a, s) => a + paidWeek(s.id, x), 0)) }, { n: 'Target', c: 'var(--ov)', v: ws.map(() => nom * l.length) }])}</div>`
      + `<div class='bar'><select onchange="IK=this.value;go()" aria-label='Kelas'><option value=''>Semua kelas</option>${kelasList().map(k => `<option ${k == IK ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><span class='stmon'><button type='button' onclick='A.iuranBulan(-1)' aria-label='Bulan sebelumnya'>‹</button><b>${ml}</b><button type='button' onclick='A.iuranBulan(1)' aria-label='Bulan berikutnya'>›</button></span><span class='sp'></span>${pgo(`<button onclick='A.csvIuran()'>Ekspor CSV</button>`)}${w ? `<button onclick="IMP.open('iuran')">Impor Excel</button><button class='p' onclick="A.iuranMassal('${ws.includes(cw) ? cw : ws[0]}')">Lunaskan semua minggu ${ws.includes(cw) ? 'ini' : 'Mg 1'}</button>` : ''}</div>`
      + `<div class='card stcard'>${ST.t([['Nama', 'nama'], ...ws.map((x, i) => ['Mg ' + (i + 1) + '<small>' + esc(wkRange(x)) + '</small>', 'w' + i, 'w']), ['Bulan ini', 'tot', 'r'], ['Tunggakan', 'tng', 'r']], mrows, { cls: 'mtx', empty: 'Belum ada siswa.' })}<p class='stn'><span class='bk-kol'></span>Lancar <span class='bk-kol w'></span>Tunggakan 1–2 minggu <span class='bk-kol b'></span>Tunggakan 3 minggu atau lebih. Tunggakan dihitung dari minggu pertama yang tercatat di sistem sampai minggu lalu. Ketuk ✓ atau · untuk melihat atau mencatat pembayaran.</p></div>`
      + `<div class='sth2'><h3>Riwayat pembayaran · ${ml}</h3></div><div class='card stcard'>${ST.t([['Tanggal &amp; Waktu', 'tgl'], ['No. Referensi', 'ref'], ['Siswa', 'rek'], ['Periode', 'per'], ['Jumlah', 'amt', 'r'], ['Status', 'st'], ['', 'act', 'r ac']], hrows, { empty: 'Belum ada pembayaran pada bulan ini.' })}</div>`;
  });
  act('kwitansi', id => { const i = db.iuran.find(x => x.id == id); if (i) buktiIur(i) });
  const bayarRows = (sid, w) => db.iuran.filter(i => i.sid == sid && i.minggu == w).sort(cmp);
  act('bayar', (sid, w) => {
    const rows = bayarRows(sid, w), nom = +db.cfg.iuran || 0, p = paidWeek(sid, w), s = sis(sid), rs = revs(db.iuran);
    if (rows.length) {
      show(`<h3>Iuran ${esc(s.nama)}</h3><p class='lab'>${esc(wkTitle(w))} · terbayar ${rp(p)}${nom ? ' dari ' + rp(nom) : ''}</p>${rows.map(i => { const st = stat(i, rs); return `<div class='bk-row ${st == 'Dibatalkan' ? 'void' : ''}'><div class='l'><b>${sgn(i.jml)}</b>${rf(i.ref)}<div class='lab'>${fd(i.tgl)} ${stTag(st)}</div></div><div class='r'><button class='s' onclick="A.kwitansi('${i.id}')">Kwitansi</button>${wr() && st == 'Berhasil' ? `<button class='s d' onclick="A.batalIuran('${i.id}')">Batalkan</button>` : ''}</div></div>` }).join('')}<div class='acts'><button id='x'>Tutup</button>${wr() && p < nom ? `<button class='p' onclick="BK.bayarBaru('${sid}','${w}')">Bayar kekurangan ${rp(nom - p)}</button>` : ''}</div>`);
      return;
    }
    if (!needW()) return; BK.bayarBaru(sid, w);
  });
  BK.bayarBaru = (sid, w) => {
    if (!needW()) return; const nom = +db.cfg.iuran || 0, p = paidWeek(sid, w), s = sis(sid), due = nom ? Math.max(0, nom - p) : 0;
    fieldsFlow({ title: 'Bayar iuran · ' + esc(s.nama), next: 'Lanjut ke konfirmasi', pre: () => `<div class='bk-prev'>${esc(wkTitle(w))} · tagihan ${nom ? rp(nom) : 'belum diatur'} · terbayar ${rp(p)}</div>`,
      fields: [{ k: 'jml', l: 'Jumlah (Rp)', t: 'number', r: 1, d: due || nom || '' }, { k: 'tgl', l: 'Tanggal bayar', t: 'date', d: today(), r: 1 }, { k: 'cat', l: 'Catatan (opsional)' }],
      check: v => { v.jml = +v.jml; if (!Number.isInteger(v.jml) || v.jml <= 0) return 'Jumlah harus bilangan bulat lebih dari 0.'; if (v.jml > 1e9) return 'Jumlah terlalu besar.'; return cekTgl(v.tgl) },
      confirm: v => ({ auth: false, rows: [['Siswa', esc(s.nama)], ['Periode', esc(wkTitle(w))], ['Tagihan', nom ? rp(nom) : '-'], ['Sudah dibayar', rp(p)], ['Dibayar sekarang', `<span class='in'>${rp(v.jml)}</span>`], ['Sisa tagihan', nom ? rp(Math.max(0, nom - p - v.jml)) : '-'], ['Tanggal bayar', fd(v.tgl)]] }),
      exec: v => { const i = postIur({ sid, bulan: w.slice(0, 7), minggu: w, jml: v.jml, tgl: v.tgl, cat: v.cat }); logA('Iuran ' + s.nama + ' ' + wkTitle(w) + ': ' + rp(v.jml) + ' · ' + i.ref + ' (masuk Kas Kelas)'); return i }, done: buktiIur });
  };
  act('batalIuran', id => { const i = db.iuran.find(x => x.id == id); if (!i) return;
    pembatalan('iuran', i, a => postIur({ sid: i.sid, bulan: i.bulan, minggu: i.minggu, jml: -i.jml, tgl: today(), cat: 'Pembatalan ' + i.ref + ' · ' + a, rev_of: i.id, kanal: 'Pembatalan' }), () => i.minggu && kasSaldo() < i.jml ? 'Saldo Kas Kelas tidak cukup untuk membatalkan pembayaran ini (dana sudah dipakai).' : '') });
  act('iuranTunggak', sid => {
    if (!needW()) return; const nom = +db.cfg.iuran || 0, ar = arrearsOf(sid), s = sis(sid); if (!ar.n) return toast('Tidak ada tunggakan');
    const o = { title: 'Bayar tunggakan · ' + esc(s.nama), next: 'Lanjut ke konfirmasi',
      html: () => `<p class='lab'>Pilih minggu yang dibayar. Masing-masing dibukukan sebesar kekurangannya.</p><div class='bk-sel'>${ar.ws.map(x => `<label><input type='checkbox' class='tw' value='${x}' checked>${esc(wkTitle(x))} · <b>${rp(nom - paidWeek(sid, x))}</b></label>`).join('')}</div><label>Tanggal bayar<input id='td' type='date' value='${today()}'></label>`,
      read: d => { const ws = [...d.querySelectorAll('.tw:checked')].map(i => i.value), tg = $('#td').value; if (!ws.length) return { err: 'Pilih minimal satu minggu.' }; const e = cekTgl(tg); return e ? { err: e } : { ws, tg, tot: ws.reduce((a, x) => a + nom - paidWeek(sid, x), 0) } },
      confirm: v => ({ auth: false, rows: [['Siswa', esc(s.nama)], ['Jumlah minggu', v.ws.length], ['Total dibayar', `<span class='in'>${rp(v.tot)}</span>`], ['Tanggal bayar', fd(v.tg)]] }),
      exec: v => { const batch = 'BCH' + yymmdd(v.tg) + '-' + rnd(6), l = v.ws.map(x => postIur({ sid, bulan: x.slice(0, 7), minggu: x, jml: nom - paidWeek(sid, x), tgl: v.tg, cat: 'Bayar tunggakan · ' + batch })); logA('Bayar tunggakan iuran ' + s.nama + ': ' + l.length + ' minggu, ' + rp(v.tot) + ' · ' + batch); return { l, tot: v.tot, batch } },
      done: r => rekap('Rekap Pembayaran Tunggakan', r.l.map(i => [esc(wkTitle(i.minggu)), rf(i.ref), ST.num(i.jml)]), r.tot, esc(s.nama) + ' · batch ' + r.batch) };
    flow(o);
  });
  act('iuranMassal', w => {
    if (!needW()) return; const nom = +db.cfg.iuran || 0; if (!(nom > 0)) return toast('Isi nominal iuran per minggu di Pengaturan dulu');
    const l = db.siswa.filter(s => (!IK || s.kelas == IK) && !paidWeek(s.id, w)); if (!l.length) return toast('Semua siswa sudah membayar minggu ini');
    const o = { title: 'Lunaskan iuran massal', next: 'Lanjut ke konfirmasi', html: () => `<p class='lab'>${esc(wkTitle(w))}. Dicatat nominal bawaan untuk siswa yang belum membayar sama sekali.</p><label>Tanggal bayar<input id='td' type='date' value='${today()}'></label>`,
      read: () => { const tg = $('#td').value, e = cekTgl(tg); return e ? { err: e } : { tg } },
      confirm: v => ({ auth: false, rows: [['Periode', esc(wkTitle(w))], ['Jumlah siswa', l.length], ['Nominal per siswa', rp(nom)], ['Total masuk Kas Kelas', `<span class='in'>${rp(nom * l.length)}</span>`], ['Tanggal bayar', fd(v.tg)]] }),
      exec: v => { const batch = 'BCH' + yymmdd(v.tg) + '-' + rnd(6), r = l.map(s => postIur({ sid: s.id, bulan: w.slice(0, 7), minggu: w, jml: nom, tgl: v.tg, cat: 'Pelunasan massal · ' + batch })); logA('Iuran massal ' + wkTitle(w) + ': ' + r.length + ' siswa, ' + rp(nom * r.length) + ' · ' + batch); return { r, batch } },
      done: x => rekap('Rekap Iuran Massal', x.r.map(i => [esc(sis(i.sid).nama), rf(i.ref), ST.num(i.jml)]), nom * x.r.length, esc(wkTitle(w)) + ' · batch ' + x.batch) };
    flow(o);
  });
  act('csvIuran', () => { const rs = revs(db.iuran); csv('iuran-kelas', [['Tanggal bayar', 'Waktu', 'No. referensi', 'Minggu (Senin)', 'Bulan', 'Nama', 'NIS', 'Kelas', 'Jumlah', 'Status', 'Catatan', 'Petugas'],
    ...db.iuran.slice().sort(cmp).map(x => { const s = sis(x.sid); return [x.tgl, jam(x.waktu), x.ref, x.minggu || '', x.bulan, s.nama, s.nis, s.kelas, x.jml, stat(x, rs), x.cat, x.petugas] })]) });

  /* ---------- Antarmuka: kendali inline dan pembantu portal siswa ---------- */
  Object.assign(BK, {
    prt, noRek, terb,
    u: { ledger, efT, efK, kasL, stat, noRek, revs, rf, tabLbl, cmp },
    t(x) { TS.tab = x; go() }, f(k, v) { TS[k] = v; go() },
    mp(v, sid) { MP = v; mutasi(sid) }, eye(sid) { HIDE = !HIDE; try { localStorage.setItem('sh.bk.hide', HIDE ? '1' : '0') } catch (e) { /* abaikan */ } mutasi(sid) },
    km(d) { const x = new Date(+KM.slice(0, 4), +KM.slice(5) - 1 + d, 1); KM = isoD(x).slice(0, 7); go() },
    nom(n) { const i = $('#f_jml'); if (i) { i.value = n; i.focus() } },
    waIur(id) { const i = db.iuran.find(x => x.id == id); if (!i) return; const s = sis(i.sid), u = waUrl(s.hp, `Kwitansi iuran kelas ${s.nama} (${s.kelas}): ${rp(Math.abs(i.jml))}${i.minggu ? ' untuk ' + wkTitle(i.minggu) : ''}. No. referensi ${i.ref}. Terima kasih. ${db.cfg.sekolah}`); if (!u) return toast('Nomor kontak wali kosong atau tidak valid'); window.open(u, '_blank', 'noopener') },
    /* Pembantu tampilan untuk portal siswa/orang tua dan dasbor (baris pembatalan bernilai negatif) */
    tabLbl: t => cap(tabLbl(t)), tabAmt: t => sgn(efT(t)), kasAmt: k => sgn(efK(k)), iurAmt: i => sgn(i.jml), ref: rf
  });
})();
