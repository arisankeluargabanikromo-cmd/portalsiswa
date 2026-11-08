/* SekolahHub: dokumen dan tabel keuangan bergaya rekening koran (contoh: Rekening Koran / Account Statement bank).
   Dimuat setelah bank.js, siswa.js, dan app.js; css/statement.css. Memakai global app.js: db, Data, Brand, V, A, $, esc, rp, fd, today, isoD, BLF, wksOf,
   wkOf, wkRange, paidWeek, arrearsOf, kelasList, av, go, toast, csv, RB, RK, PK, PL, pgList, waText. Memakai pembantu bank.js lewat BK.u (ledger, efT, efK, kasL, stat, noRek, revs, rf).

   Isi:
   1. Primitif   : ST.num, ST.dt, ST.t (tabel), ST.sum (pita ringkasan), ST.tabs, ST.doc (kertas), ST.show/open (dialog), ST.print
   2. Kertas     : ST.rekPaper (rekening koran siswa), ST.kasPaper (buku kas), ST.rekapPaper (rekap batch)
   3. Laporan    : menu Laporan (Tabungan, Kas Kelas, Iuran) dan tab Laporan di menu Absensi dengan pratinjau kertas, cetak, dan ekspor CSV
   4. Pengingat  : tampilan menu Pengingat WhatsApp
   Aturan cetak: kertas A4 portrait, tabel header berulang tiap halaman, nomor halaman lewat @page (Chrome/Edge 131+; peramban lain tanpa nomor halaman). */
(() => {
  'use strict';
  const U = () => BK.u;
  const N2 = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const num = n => N2.format(Math.abs(+n || 0));                                     // 3.000.000,00
  const num0 = n => (+n ? N0.format(Math.round(Math.abs(+n))) : '–');                // 5.000 atau –
  const dmy = t => t ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : '';
  const dLong = t => t ? t.slice(8, 10) + ' ' + BLF[+t.slice(5, 7) - 1] + ' ' + t.slice(0, 4) : '';
  const mEnd = ym => isoD(new Date(+ym.slice(0, 4), +ym.slice(5), 0));
  const jam = w => w ? new Date(w).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\./g, ':') : '';
  const dOf = w => w ? isoD(new Date(w)) : '';
  const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const petus = () => { const e = (Data.user && Data.user.email) || '', p = e.split('@'); return p.length > 1 ? p[0].slice(0, 2) + '***@' + p[1] : '' };
  const nowTxt = () => dmy(today()) + ' ' + jam(new Date().toISOString());
  const perTxt = per => per ? BLF[+per.slice(5) - 1] + ' ' + per.slice(0, 4) : 'Semua periode';

  /* ================= 1. PRIMITIF ================= */
  /* Tanggal dan jam dua baris (kolom "Tanggal & Waktu"): waktu pembukuan dari server; bila tidak ada (data lama), hanya tanggal transaksi. */
  const dt = (tgl, waktu) => `<b>${dmy(waktu ? dOf(waktu) : tgl)}</b>${waktu ? `<span>${jam(waktu)}</span>` : ''}`;

  /* Tabel. cols: [[judul, kunci, kelas]]; rows: larik sel (teks atau {h, c, span}), {c:[...], cls}, atau string '<tr>..' mentah.
     o: {paper, empty, cls}. Kunci (data-k) dipakai CSS ponsel untuk menyusun daftar kartu. */
  function t(cols, rows, o) {
    o = o || {};
    if (!rows.length) return o.paper ? `<div class='pp-empty'>${o.empty || 'Tidak ada data.'}</div>` : `<div class='empty'>${o.empty || 'Tidak ada data.'}</div>`;
    const th = cols.map(c => `<th class='${c[2] || ''}'>${c[0]}</th>`).join('');
    const tr = r => {
      if (typeof r === 'string') return r;
      const cells = Array.isArray(r) ? r : r.c, cls = Array.isArray(r) ? '' : (r.cls || ''); let i = 0, h = '';
      for (const x of cells) {
        const c = cols[i] || ['', '', ''], o2 = x && typeof x === 'object' ? x : { h: x }, span = o2.span || 1;
        h += `<td data-k='${c[1] || ''}' data-label='${esc(strip(c[0]))}' class='${c[2] || ''} ${o2.c || ''}'${span > 1 ? ` colspan='${span}'` : ''}>${o2.h ?? ''}</td>`; i += span;
      }
      return `<tr class='${cls}'>${h}</tr>`;
    };
    return o.paper
      ? `<div class='pp-tw'><table class='pp-tb ${o.cls || ''}'><thead><tr>${th}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`
      : `<div class='tw'><table class='stm ${o.cls || ''}'><thead><tr>${th}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }

  /* Pita ringkasan angka: items [{l, v, s, c}] */
  const sum = items => `<div class='stsum' role='group'>${items.map(i => `<div class='${i.c || ''}'><span>${i.l}</span><b>${i.v}</b>${i.s ? `<small>${i.s}</small>` : ''}</div>`).join('')}</div>`;
  /* Tab segmented: items [[id, label]], fn = nama fungsi global (mis. 'BK.t') yang menerima id */
  const tabs = (items, cur, fn) => `<div class='bk-tabs' role='tablist'>${items.map(x => `<button type='button' role='tab' aria-selected='${cur == x[0]}' class='${cur == x[0] ? 'on' : ''}' onclick="${fn}('${x[0]}')">${x[1]}</button>`).join('')}</div>`;

  /* Kertas dokumen. o: {title, en, sub, meta:[[label, nilai]|[label, kunci, nilai]], body, sum:[[label, nilai]], sign:[[peran, nama, nip]], note} */
  function doc(o) {
    const c = db.cfg;
    const org = (c.instansi ? `<i>${esc(c.instansi)}</i>` : '') + `<b>${esc(c.sekolah)}</b>` + (c.alamat || c.telp ? `<span>${esc(c.alamat || '')}${c.alamat && c.telp ? ' · ' : ''}${c.telp ? 'Telp. ' + esc(c.telp) : ''}</span>` : '');
    const meta = (o.meta || []).map(m => m.length > 2 ? `<div><span>${m[0]}</span><span>: ${m[1]}</span><span>${m[2]}</span></div>` : `<div><span>${m[0]}</span><span class='w'>: ${m[1]}</span></div>`).join('');
    const sm = o.sum && o.sum.length ? `<div class='pp-sum' style='--n:${o.sum.length}'>${o.sum.map(x => `<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>` : '';
    const sg = o.sign && o.sign.length ? `<div class='pp-sg' style='--n:${o.sign.length}'>${o.sign.map(x => `<div>${x[0]}<i></i><b>${esc(x[1]) || '(..............)'}</b>${x[2] ? `<small>NIP ${esc(x[2])}</small>` : ''}</div>`).join('')}</div>` : '';
    return `<article class='pp' aria-label='${esc(o.title)}'><header class='pp-h'><div class='pp-org'>${org}</div><div class='pp-lg'>${Brand.tile(54)}</div></header>`
      + `<h1 class='pp-t'><b>${o.title}</b>${o.en ? `<span>(${o.en})</span>` : ''}${o.sub ? `<small>${o.sub}</small>` : ''}</h1>`
      + (meta ? `<div class='pp-m'>${meta}</div>` : '') + o.body + sm + (o.after || '') + sg
      + `<footer class='pp-ft'>${o.note || 'Dokumen ini dicetak dari ' + esc(Brand.name()) + '. Transaksi bersifat permanen; koreksi dibukukan melalui pembatalan.'}<br>Dicetak ${nowTxt()}${petus() ? ' oleh ' + esc(petus()) : ''}.</footer></article>`;
  }

  /* Dialog: ST.show menggantikan show() di bank.js. Kelas stp (dokumen) dan strc (bukti) ditentukan dari isi. */
  function show(html, kind) {
    const d = $('#dlg'), k = kind || (html.includes("class='pp'") ? 'doc' : html.includes('bk-rcpt') ? 'rcpt' : '');
    d.classList.toggle('stp', k == 'doc'); d.classList.toggle('strc', k == 'rcpt');
    d.innerHTML = html; if (!d.open) d.showModal();
    d.querySelectorAll('#x,[data-close]').forEach(b => b.onclick = () => d.close());
    return d;
  }
  /* Dialog dokumen: judul, kontrol layar (tidak dicetak), kertas, dan tombol aksi. */
  const open = o => show(`<div class='stp-h'><b>${o.title}</b><button type='button' data-close aria-label='Tutup'>✕</button></div>${o.ctl ? `<div class='stp-ctl'>${o.ctl}</div>` : ''}<div class='stp-b'>${o.paper}</div>`
    + `<div class='acts stp-a'>${o.acts || ''}<button type='button' id='x'>Tutup</button><button type='button' class='p' id='pr' onclick='ST.print()'>Cetak / PDF</button></div>`, 'doc');
  { const d = $('#dlg'); if (d) d.addEventListener('close', () => d.classList.remove('stp', 'strc')) }

  function print_() {
    const b = document.body, cls = $('#dlg').open ? 'pd' : 'pdp'; let off = false;
    const done = () => { if (!off) { off = true; b.classList.remove(cls) } };
    b.classList.add(cls); addEventListener('afterprint', done, { once: true });
    try { window.print() } finally { setTimeout(done, 1500) }
  }

  /* ================= 2. KERTAS ================= */
  const signKelas = () => {
    const j = db.struktur.find(x => /bendahara/i.test(x.jab));
    return [['Wali kelas', db.cfg.walikelas || ''], ['Bendahara', j ? sis(j.sid).nama : '']];
  };
  const signAll = () => { const s = signKelas(); return db.cfg.kepsek ? [['Mengetahui, Kepala sekolah', db.cfg.kepsek, db.cfg.kepsek_nip || ''], ...s] : s };

  /* Rekening koran satu siswa. per = 'YYYY-MM' atau '' (semua periode). */
  function rekPaper(sid, per) {
    const u = U(), s = db.siswa.find(x => x.id == sid); if (!s) return '';
    const all = u.ledger(sid), rs = u.revs(db.tab);
    const before = per ? (all.filter(x => x.t.tgl.slice(0, 7) < per).slice(-1)[0] || { bal: 0 }).bal : 0;
    const l = all.filter(x => !per || x.t.tgl.slice(0, 7) == per);
    const k = l.reduce((a, x) => a + Math.max(0, u.efT(x.t)), 0), d = l.reduce((a, x) => a + Math.max(0, -u.efT(x.t)), 0);
    const rows = l.map(x => {
      const tx = x.t, e = u.efT(tx), st = u.stat(tx, rs);
      const ur = `<b>${cap(u.tabLbl(tx))}</b>${st != 'Berhasil' ? `<span class='tag'>${st}</span>` : ''}<span class='sub'>${esc(tx.cat)}${tx.cat && tx.kanal ? ' · ' : ''}${esc(tx.kanal || '')}${tx.petugas ? ' · ' + esc(tx.petugas) : ''}</span>`;
      return { cls: st == 'Dibatalkan' ? 'void' : '', c: [{ h: dt(tx.tgl, tx.waktu), c: 'd' }, { h: dt(tx.tgl), c: 'd' }, { h: ur, c: 'l' }, u.rf(tx.ref),
        { h: e < 0 ? num(-e) : '0,00', c: e < 0 ? '' : 'z' }, { h: e > 0 ? num(e) : '0,00', c: e > 0 ? '' : 'z' }, num(x.bal)] };
    });
    const cols = [['Tanggal &amp; Waktu', 'tgl'], ['Tgl. Valuta', 'val'], ['Uraian', 'ket', 'l'], ['No. Referensi', 'ref'], ['Debit', 'deb', 'r'], ['Kredit', 'kre', 'r'], ['Saldo', 'sal', 'r']];
    const from = per ? per + '-01' : '', to = per ? mEnd(per) : today();
    return doc({ title: 'Rekening Koran', en: 'Account Statement',
      meta: [['Periode', 'Dari', per ? dLong(from) : 'Awal pembukuan'], ['', 'Sampai', dLong(to)], ['No. Rekening', `${esc(u.noRek(s))} - ${esc(String(s.nama).toUpperCase())}`], ['Mata Uang', 'IDR'], ['Kelas', `${esc(s.kelas)} · NIS ${esc(s.nis)}`], ['Saldo Awal', num(before)]],
      body: t(cols, rows, { paper: true, empty: 'Tidak ada mutasi pada periode ini.' }),
      sum: [['Saldo awal', 'Rp ' + num(before)], ['Total debit', 'Rp ' + num(d)], ['Total kredit', 'Rp ' + num(k)], ['Saldo akhir', 'Rp ' + num(before + k - d)]],
      note: 'Dokumen ini adalah rekening koran tabungan siswa, bukan pengganti catatan resmi sekolah. Debit = penarikan, Kredit = setoran. Transaksi bersifat permanen; koreksi dibukukan melalui pembatalan.' });
  }

  /* Buku kas kelas satu bulan (per = '' berarti semua periode). */
  function kasPaper(per) {
    const u = U(), L = u.kasL(), rs = u.revs(db.kas);
    const before = per ? (L.filter(x => x.k.tgl.slice(0, 7) < per).slice(-1)[0] || { bal: 0 }).bal : 0, P = L.filter(x => !per || x.k.tgl.slice(0, 7) == per);
    const m = P.reduce((a, x) => a + Math.max(0, u.efK(x.k)), 0), kl = P.reduce((a, x) => a + Math.max(0, -u.efK(x.k)), 0);
    const rows = P.map(x => {
      const k = x.k, e = u.efK(k), st = u.stat(k, rs);
      const ur = `<b>${esc(k.ket)}</b>${st != 'Berhasil' ? `<span class='tag'>${st}</span>` : ''}${k.kat ? `<span class='sub'>${esc(k.kat)}${k.petugas ? ' · ' + esc(k.petugas) : ''}</span>` : ''}`;
      return { cls: st == 'Dibatalkan' ? 'void' : '', c: [{ h: dt(k.tgl, k.waktu), c: 'd' }, { h: dt(k.tgl), c: 'd' }, { h: ur, c: 'l' }, u.rf(k.ref),
        { h: e > 0 ? num(e) : '0,00', c: e > 0 ? '' : 'z' }, { h: e < 0 ? num(-e) : '0,00', c: e < 0 ? '' : 'z' }, num(x.bal)] };
    });
    const cols = [['Tanggal &amp; Waktu', 'tgl'], ['Tgl. Valuta', 'val'], ['Uraian', 'ket', 'l'], ['No. Bukti', 'ref'], ['Masuk', 'kre', 'r'], ['Keluar', 'deb', 'r'], ['Saldo', 'sal', 'r']];
    const kat = new Map(); P.forEach(x => { const e = u.efK(x.k), n = x.k.kat || 'Tanpa kategori', a = kat.get(n) || [0, 0]; if (e > 0) a[0] += e; else a[1] -= e; kat.set(n, a) });
    const katT = kat.size > 1 ? `<h4 class='pp-sub'>Ringkasan per kategori</h4>` + t([['Kategori', 'ket', 'l'], ['Masuk', 'kre', 'r'], ['Keluar', 'deb', 'r']], [...kat].map(([n, a]) => [esc(n), num(a[0]), num(a[1])]), { paper: true }) : '';
    const from = per ? per + '-01' : '', to = per ? mEnd(per) : today();
    return doc({ title: 'Buku Kas Kelas', en: 'Class Cash Book',
      meta: [['Periode', 'Dari', per ? dLong(from) : 'Awal pembukuan'], ['', 'Sampai', dLong(to)], ['Tahun Ajaran', esc(db.cfg.tahun || '-')], ['Wali Kelas', esc(db.cfg.walikelas || '-')], ['Mata Uang', 'IDR'], ['Saldo Awal', num(before)]],
      body: t(cols, rows, { paper: true, empty: 'Tidak ada catatan kas pada periode ini.' }),
      sum: [['Saldo awal', 'Rp ' + num(before)], ['Total masuk', 'Rp ' + num(m)], ['Total keluar', 'Rp ' + num(kl)], ['Saldo akhir', 'Rp ' + num(before + m - kl)]],
      after: katT, sign: signKelas() });
  }

  /* Rekap batch (setoran massal, iuran massal, bayar tunggakan). rows: larik [rincian, no. referensi, jumlah(teks)] */
  function rekapPaper(title, en, note, rows, total) {
    return doc({ title, en, meta: [['Tanggal Cetak', dLong(today())], ['Keterangan', note]],
      body: t([['No.', 'no', 'c'], ['Rincian', 'ket', 'l'], ['No. Referensi', 'ref'], ['Jumlah', 'amt', 'r']], rows.map((r, i) => [String(i + 1), r[0], r[1], r[2]]), { paper: true, empty: 'Tidak ada data.' }),
      sum: [['Jumlah transaksi', String(rows.length)], ['Total', 'Rp ' + num(total)]], sign: signKelas() });
  }

  /* ================= 3. LAPORAN ================= */
  let LT = 'tab';
  if (typeof RB !== 'undefined' && !RB) RB = today().slice(0, 7);

  function lapTabData() {
    const u = U(), per = RB, from = per ? per + '-01' : '', to = per ? mEnd(per) : today();
    const list = db.siswa.filter(s => !RK || s.kelas == RK).slice().sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a.nama).localeCompare(String(b.nama), 'id'));
    return { per, from, to, rows: list.map(s => { let bf = 0, k = 0, d = 0; db.tab.forEach(x => { if (x.sid != s.id) return; const e = u.efT(x); if (from && x.tgl < from) bf += e; else if (x.tgl <= to) { if (e > 0) k += e; else d -= e } }); return { s, bf, k, d, end: bf + k - d } }) };
  }
  function lapTabPaper() {
    const u = U(), D = lapTabData(), sm = D.rows.reduce((a, r) => [a[0] + r.bf, a[1] + r.d, a[2] + r.k, a[3] + r.end], [0, 0, 0, 0]);
    const rows = D.rows.map((r, i) => [String(i + 1), u.noRek(r.s), { h: `<b>${esc(r.s.nama)}</b><span class='sub'>NIS ${esc(r.s.nis)}</span>`, c: 'l' }, esc(r.s.kelas), num(r.bf), num(r.d), num(r.k), { h: `<b>${num(r.end)}</b>` }]);
    if (rows.length) rows.push({ cls: 'tot', c: [{ h: 'Jumlah', span: 4, c: 'l' }, num(sm[0]), num(sm[1]), num(sm[2]), num(sm[3])] });
    const cols = [['No.', 'no', 'c'], ['No. Rekening', 'rek'], ['Nama', 'nama', 'l'], ['Kelas', 'kelas', 'c'], ['Saldo Awal', 'sal0', 'r'], ['Debit', 'deb', 'r'], ['Kredit', 'kre', 'r'], ['Saldo Akhir', 'sal', 'r']];
    return doc({ title: 'Laporan Rekap Tabungan', en: 'Savings Summary Report',
      meta: [['Periode', 'Dari', D.per ? dLong(D.from) : 'Awal pembukuan'], ['', 'Sampai', dLong(D.to)], ['Kelas', RK ? esc(RK) : 'Semua kelas'], ['Jumlah Rekening', String(D.rows.length)], ['Mata Uang', 'IDR'], ['Tahun Ajaran', esc(db.cfg.tahun || '-')]],
      body: t(cols, rows, { paper: true, empty: 'Tidak ada data untuk dilaporkan.' }),
      sum: [['Saldo awal', 'Rp ' + num(sm[0])], ['Total debit', 'Rp ' + num(sm[1])], ['Total kredit', 'Rp ' + num(sm[2])], ['Saldo akhir', 'Rp ' + num(sm[3])]],
      after: `<p class='mu' style='margin:10px 0 0;font-size:10.5px'>Saldo kas kelas saat ini Rp ${num(kasSaldo())} (terpisah dari tabungan siswa).</p>`, sign: signAll() });
  }

  const lapIurPer = () => RB || today().slice(0, 7);
  function lapIuranPaper() {
    const u = U(), per = lapIurPer(), ws = wksOf(per), nom = +db.cfg.iuran || 0, cw = wkOf(today()), started = ws.filter(w => w <= cw);
    const l = db.siswa.filter(s => !RK || s.kelas == RK).slice().sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a.nama).localeCompare(String(b.nama), 'id'));
    const wsum = ws.map(() => 0); let tot = 0, tng = 0, paid = 0;
    const rows = l.map((s, i) => {
      const ps = ws.map(w => paidWeek(s.id, w)), t0 = ps.reduce((a, x) => a + x, 0), ar = arrearsOf(s.id);
      ps.forEach((p, j) => wsum[j] += p); tot += t0; tng += ar.jml; ws.forEach((w, j) => { if (w <= cw) paid += Math.min(ps[j], nom) });
      return [String(i + 1), { h: `<b>${esc(s.nama)}</b>`, c: 'l' }, esc(s.kelas), ...ps.map(p => ({ h: num0(p), c: p ? '' : 'z' })), { h: `<b>${num0(t0)}</b>` }, { h: ar.jml ? `${num0(ar.jml)}<span class='sub'>${ar.n} mg</span>` : '–', c: ar.jml ? 'out' : 'z' }];
    });
    if (rows.length) rows.push({ cls: 'tot', c: [{ h: 'Jumlah', span: 3, c: 'l' }, ...wsum.map(x => num0(x)), num0(tot), num0(tng)] });
    const cols = [['No.', 'no', 'c'], ['Nama', 'nama', 'l'], ['Kelas', 'kelas', 'c'], ...ws.map((w, i) => [`Mg ${i + 1}<small>${esc(wkRange(w))}</small>`, 'w' + i, 'r']), ['Total', 'tot', 'r'], ['Tunggakan', 'tng', 'r']];
    const billed = nom * l.length * started.length, kol = billed ? Math.round(paid / billed * 100) : null;
    return doc({ title: 'Laporan Iuran Kelas', en: 'Class Dues Report',
      meta: [['Periode', perTxt(per)], ['Kelas', RK ? esc(RK) : 'Semua kelas'], ['Iuran per Minggu', nom ? 'Rp ' + num(nom) : 'Belum diatur'], ['Mata Uang', 'IDR'], ['Tahun Ajaran', esc(db.cfg.tahun || '-')]],
      body: t(cols, rows, { paper: true, cls: 'pp-w', empty: 'Tidak ada siswa untuk dilaporkan.' }),
      sum: [['Terkumpul bulan ini', 'Rp ' + num(tot)], ['Tagihan berjalan', 'Rp ' + num(billed)], ['Kolektibilitas', kol === null ? '-' : kol + '%'], ['Total tunggakan', 'Rp ' + num(tng)]],
      note: 'Tunggakan = minggu yang sudah lewat dan belum lunas, dihitung sejak minggu pertama yang tercatat di sistem. Jumlah dalam rupiah. Tanda – berarti belum ada pembayaran.', sign: signKelas() });
  }

  /* ---- Laporan absensi: rekap per siswa atau matriks harian untuk periode terpilih (bulan, atau semua periode) ---- */
  let LM = 'rekap';
  const ABS_N = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
  const lapAbsPer = () => LM == 'harian' ? (RB || today().slice(0, 7)) : RB;
  function lapAbsData() {
    const per = lapAbsPer(), list = db.siswa.filter(s => !RK || s.kelas == RK).slice().sort((a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a.nama).localeCompare(String(b.nama), 'id'));
    const ids = new Set(list.map(s => s.id)), rec = db.absensi.filter(a => ids.has(a.sid) && (!per || a.tgl.slice(0, 7) == per));
    const days = [...new Set(rec.map(a => a.tgl))].sort(), by = new Map();
    rec.forEach(a => { let m = by.get(a.sid); if (!m) by.set(a.sid, m = {}); m[a.tgl] = a.st });
    const rows = list.map(s => { const m = by.get(s.id) || {}, c = { H: 0, S: 0, I: 0, A: 0 }; Object.values(m).forEach(k => { if (k in c) c[k]++ }); const n = c.H + c.S + c.I + c.A; return { s, m, c, n, pct: n ? Math.round(c.H / n * 100) : null } });
    const from = per ? per + '-01' : (days[0] || today()), to = per ? mEnd(per) : (days[days.length - 1] || today());
    return { per, list, rows, days, from, to };
  }
  function lapAbsPaper() {
    const D = lapAbsData(), T = { H: 0, S: 0, I: 0, A: 0 };
    D.rows.forEach(r => { for (const k in T) T[k] += r.c[k] });
    const tn = T.H + T.S + T.I + T.A, tp = tn ? Math.round(T.H / tn * 100) : null;
    const wali = db.cfg.walikelas || '', sign = db.cfg.kepsek ? [['Mengetahui, Kepala sekolah', db.cfg.kepsek, db.cfg.kepsek_nip || ''], ['Wali kelas', wali]] : [['Wali kelas', wali]];
    let cols, rows, cls = '', note;
    if (LM == 'harian') {
      cls = 'pp-ab';
      cols = [['No.', 'no', 'c'], ['Nama', 'nama', 'l'], ...D.days.map(d => [String(+d.slice(8)), 'd' + d.slice(8), 'c']), ['H', 'h', 'c'], ['S', 's', 'c'], ['I', 'i', 'c'], ['A', 'a', 'c']];
      rows = D.rows.map((r, i) => [String(i + 1), { h: `<b>${esc(r.s.nama)}</b>`, c: 'l' }, ...D.days.map(d => { const k = r.m[d]; return { h: k || '·', c: k == 'A' ? 'ab-a' : k ? '' : 'z' } }), r.c.H, r.c.S, r.c.I, r.c.A]);
      note = 'H = Hadir, S = Sakit, I = Izin, A = Alpa, titik (·) = belum dicatat. Hanya tanggal yang memiliki catatan absensi yang ditampilkan; angka pada kepala kolom adalah tanggal.';
    } else {
      cols = [['No.', 'no', 'c'], ['Nama', 'nama', 'l'], ['Kelas', 'kelas', 'c'], ['Hadir', 'h', 'r'], ['Sakit', 's', 'r'], ['Izin', 'i', 'r'], ['Alpa', 'a', 'r'], ['Jumlah Hari', 'jml', 'r'], ['% Hadir', 'pct', 'r']];
      rows = D.rows.map((r, i) => [String(i + 1), { h: `<b>${esc(r.s.nama)}</b><span class='sub'>NIS ${esc(r.s.nis)}</span>`, c: 'l' }, esc(r.s.kelas), r.c.H, r.c.S, r.c.I, r.c.A, r.n, { h: r.pct == null ? '–' : r.pct + '%', c: r.pct == null ? 'z' : '' }]);
      if (rows.length) rows.push({ cls: 'tot', c: [{ h: 'Jumlah', span: 3, c: 'l' }, T.H, T.S, T.I, T.A, tn, tp == null ? '–' : tp + '%'] });
      note = 'Persentase hadir = jumlah hari hadir dibagi jumlah hari yang tercatat untuk siswa tersebut. Siswa tanpa catatan pada periode ini ditandai –.';
    }
    return doc({ title: 'Laporan Absensi', en: 'Attendance Report',
      meta: [['Periode', 'Dari', dLong(D.from)], ['', 'Sampai', dLong(D.to)], ['Kelas', RK ? esc(RK) : 'Semua kelas'], ['Jumlah Siswa', String(D.list.length)], ['Hari Tercatat', String(D.days.length)], ['Tahun Ajaran', esc(db.cfg.tahun || '-')]],
      body: t(cols, rows, { paper: true, cls, empty: 'Belum ada catatan absensi pada periode ini.' }),
      sum: [['Hadir', String(T.H)], ['Sakit / Izin', T.S + ' / ' + T.I], ['Alpa', String(T.A)], ['Kehadiran', tp == null ? '-' : tp + '%']],
      note, sign });
  }
  function csvAbs() {
    const D = lapAbsData(), pt = D.per ? perTxt(D.per) : 'Semua periode';
    if (LM == 'harian') return csv('absensi-harian', [['Nama', 'NIS', 'Kelas', ...D.days.map(dmy), 'Hadir', 'Sakit', 'Izin', 'Alpa'], ...D.rows.map(r => [r.s.nama, r.s.nis, r.s.kelas, ...D.days.map(d => r.m[d] || ''), r.c.H, r.c.S, r.c.I, r.c.A])]);
    csv('rekap-absensi', [['Nama', 'NIS', 'Kelas', 'Periode', 'Hadir', 'Sakit', 'Izin', 'Alpa', 'Jumlah hari', '% Hadir'], ...D.rows.map(r => [r.s.nama, r.s.nis, r.s.kelas, pt, r.c.H, r.c.S, r.c.I, r.c.A, r.n, r.pct == null ? '' : r.pct])]);
  }

  const lapPaper = () => LT == 'kas' ? kasPaper(RB) : LT == 'iuran' ? lapIuranPaper() : lapTabPaper();
  V.laporan = () => {
    const mo = LT == 'iuran' ? lapIurPer() : RB;
    const kls = LT == 'kas' ? '' : `<select onchange="RK=this.value;go()" aria-label='Kelas'><option value=''>Semua kelas</option>${kelasList().map(k => `<option ${k == RK ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>`;
    const nm = { tab: 'tabungan', kas: 'kas kelas', iuran: 'iuran kelas' }[LT];
    return `<h2>Laporan</h2><p class='sub'>Laporan keuangan ${nm} dalam format rekening koran. Periksa pratinjau, lalu cetak atau simpan sebagai PDF lewat dialog cetak.</p>`
      + `<div class='lp-top'>${tabs([['tab', 'Tabungan'], ['kas', 'Kas Kelas'], ['iuran', 'Iuran']], LT, 'ST.lt')}<div class='lp-act'><button type='button' onclick='ST.csv()'>Ekspor CSV</button><button type='button' class='p' onclick='ST.print()'>Cetak / PDF</button></div></div>`
      + `<div class='pbar'><input type='month' value='${mo}' max='${today().slice(0, 7)}' onchange="RB=this.value;go()" aria-label='Periode laporan'>${LT == 'iuran' ? '' : `<button type='button' onclick="RB='';go()" ${RB ? '' : 'disabled'}>Semua periode</button>`}${kls}</div>`
      + `<div class='pp-sheet'>${lapPaper()}</div>`;
  };
  /* Tab Laporan di dalam menu Absensi (app.js memanggil ST.lapAbsBody dan ST.absActs). */
  const absActs = () => `<div class='lp-act'><button type='button' onclick='ST.csv()'>Ekspor CSV</button><button type='button' class='p' onclick='ST.print()'>Cetak / PDF</button></div>`;
  const lapAbsBody = () => {
    const mo = lapAbsPer(), harian = LM == 'harian';
    const kls = `<select onchange=\"RK=this.value;go()\" aria-label='Kelas'><option value=''>Semua kelas</option>${kelasList().map(k => `<option ${k == RK ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>`;
    const bentuk = `<select onchange=\"ST.lm(this.value)\" aria-label='Bentuk laporan'><option value='rekap' ${harian ? '' : 'selected'}>Rekap per siswa</option><option value='harian' ${harian ? 'selected' : ''}>Matriks harian (per bulan)</option></select>`;
    return `<div class='pbar'><input type='month' value='${mo}' max='${today().slice(0, 7)}' onchange=\"RB=this.value;go()\" aria-label='Periode laporan'>${harian ? '' : `<button type='button' onclick=\"RB='';go()\" ${RB ? '' : 'disabled'}>Semua periode</button>`}${kls}${bentuk}</div>`
      + `<div class='pp-sheet'>${lapAbsPaper()}</div>`;
  };

  function csvLap() {
    if (cur == 'absensi') return csvAbs();
    if (LT == 'kas') return A.csvKas();
    if (LT == 'iuran') return A.csvIuran();
    if (cur == 'absensi') return csvAbs();
    const u = U(), D = lapTabData();
    csv('rekap-tabungan', [['No. Rekening', 'Nama', 'NIS', 'Kelas', 'Periode', 'Saldo awal', 'Debit (tarik)', 'Kredit (setor)', 'Saldo akhir'], ...D.rows.map(r => [u.noRek(r.s), r.s.nama, r.s.nis, r.s.kelas, perTxt(D.per), r.bf, r.d, r.k, r.end])]);
  }

  /* ================= 4. PENGINGAT ================= */
  V.pengingat = () => {
    const L = pgList(), ks = kelasList(), left = L.filter(x => x.ok && !x.sent).length, nom = +db.cfg.iuran || 0, valid = L.filter(x => x.ok).length, sent = L.filter(x => x.sent).length;
    const head = { tung: 'Tunggakan', iuran: 'Kekurangan', tab: 'Saldo' }[PK];
    const rows = L.map(x => { const s = x.s, ar = PK == 'tung' ? arrearsOf(s.id) : null;
      const amt = PK == 'tung' ? `<span class='out'>${rp(ar.jml)}</span><span class='sub'>${ar.n} minggu</span>` : PK == 'iuran' ? `<span class='out'>${rp(Math.max(0, nom - paidWeek(s.id)))}</span>` : rp(saldo(s.id));
      return [{ h: `<a class='pl' href='#profil-${s.id}'>${av(s, 30)}<b>${esc(s.nama)}</b></a>`, c: '' }, esc(s.kelas), esc(s.hp) || '-', { h: amt, c: 'r' },
        x.sent ? `<span class='tag in'>Terkirim hari ini</span>` : x.ok ? `<span class='tag'>Belum dikirim</span>` : `<span class='tag out'>Nomor tidak valid</span>`,
        { h: `<button type='button' class='s' ${x.ok ? '' : 'disabled'} onclick="A.kirim('${PK}','${s.id}')">Kirim WA</button>`, c: 'r ac' }] });
    const tbl_ = PK != 'tab' && !nom ? `<div class='empty'>Nominal iuran belum diatur. Isi di menu Pengaturan.</div>`
      : t([['Siswa', 'rek'], ['Kelas', 'kelas'], ['Kontak wali', 'hp'], [head, 'amt', 'r'], ['Status', 'st'], ['', 'act', 'r']], rows, { cls: 'stm-l', empty: 'Semua siswa sudah memenuhi. Tidak ada yang perlu diingatkan.' });
    return `<h2>Pengingat WhatsApp</h2><p class='sub'>Kirim pengingat ke wali murid lewat WhatsApp. Pesan terisi otomatis, Anda tinggal menekan kirim di WhatsApp.</p>`
      + sum([{ l: 'Perlu diingatkan', v: L.length, s: 'siswa pada daftar ini', c: 'hero' }, { l: 'Nomor WhatsApp valid', v: valid, s: 'dari ' + L.length + ' siswa' }, { l: 'Terkirim hari ini', v: sent, c: 'in' }, { l: 'Belum dikirim', v: left, s: 'siap dikirim' }])
      + tabs([['tab', 'Belum menabung'], ['iuran', 'Iuran minggu ini'], ['tung', 'Tunggakan iuran']], PK, 'ST.pk')
      + `<div class='bar'><select onchange="PL=this.value;go()" aria-label='Kelas'><option value=''>Semua kelas</option>${ks.map(k => `<option ${k == PL ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select><span class='sp'></span><button class='p' onclick='A.kirimNext()' ${left ? '' : 'disabled'}>Kirim berikutnya (${left})</button></div>`
      + `<div class='card stcard'>${tbl_}</div>`
      + (L.length && (PK == 'tab' || nom) ? `<div class='card' style='margin-top:14px'><h3>Contoh pesan</h3><p style='margin:0;white-space:pre-wrap'>${esc(waText(PK, L[0].s))}</p><p class='lab' style='margin-bottom:0'>Isi pesan bisa diubah di menu Pengaturan.</p></div>` : '');
  };

  /* ================= API ================= */
  window.ST = { num, num0, dmy, dLong, mEnd, jam, dt, t, sum, tabs, doc, show, open, rekPaper, kasPaper, rekapPaper, print: print_, csv: csvLap,
    lt(x) { LT = x; go() }, lm(x) { LM = x; go() }, av(x) { if (x == 'laporan' && AV != 'laporan') { RB = AT.slice(0, 7); RK = AK } AV = x; go() }, lapAbsBody, absActs, pk(x) { PK = x; go() } };
  A.csvLap = csvLap;
})();
