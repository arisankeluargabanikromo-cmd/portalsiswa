/* SekolahHub: tampilan khusus akun Siswa (peran 'siswa', hanya-baca).
   Dimuat setelah app.js dan idcard.js. Memakai global dari app.js: db, Data, V, NAV, SWIDS, CH, BL, BLF, $, esc, rp, fd, today, tbl, empty, ico, av, saldo, trendSvg, pn, mk, mlab, go, A, IDC.
   Isi file ini:
     1. Kartu pelajar (lanskap, halaman depan) untuk bagian paling atas Beranda, desktop dan mobile
     2. Beranda   : kartu + ringkasan profil siswa, orang tua, dan wali (desktop), lalu ringkasan portal bawaan
     3. Keuangan  : Tabungan, Kas Kelas, Iuran, Pengingat
     4. Kelas     : Data Siswa, Struktur Kelas, Absensi, Agenda, Pengumuman, Voting
   Semua data yang tampil sudah dibatasi di database (RLS): siswa hanya menerima data dirinya sendiri; kas, struktur, dan voting bersifat umum
   (migrasi 011). Tidak ada tombol tulis di sini. app.js memilih tampilan ini lewat vw() hanya bila Data.role == 'siswa'. */
(() => {
  'use strict';

  const ME = () => db.siswa[0] || null;                                   // RLS: satu-satunya siswa yang tertaut
  const pad = n => String(n).padStart(2, '0');
  const nm = id => ((db.siswa.find(s => s.id == id) || (db.rekan || []).find(s => s.id == id) || {}).nama) || 'Siswa lain';
  const sum = (l, f) => l.reduce((a, x) => a + f(x), 0);
  const head = (t, s) => `<h2>${t}</h2><p class='sub'>${s}</p>`;
  const noMe = t => head(t, 'Data Anda belum tersedia.') + `<div class='card'>${empty('Akun Anda belum ditautkan ke data siswa. Hubungi wali kelas atau admin sekolah.')}</div>`;
  const hint = `<div class='lab' style='margin-top:6px'>Bila Anda yakin data ini ada, hubungi admin sekolah (menu ini memerlukan pembaruan database 011).</div>`;
  const kv = (a, b) => `<div class='kv'><span class='mu'>${a}</span><b>${b}</b></div>`;
  const stat = (lab, big, sub, cls) => `<div class='card'><div class='lab'>${lab}</div><div class='big ${cls || ''}'>${big}</div>${sub ? `<div class='lab'>${sub}</div>` : ''}</div>`;
  const first = s => String(s.nama || '').trim().split(/\s+/)[0] || 'Siswa';
  const dayOf = d => new Date(d + 'T00:00');

  /* ================= 1. Kartu pelajar ================= */
  // Selalu lanskap dan halaman depan; ketuk untuk melihat depan dan belakang.
  function hero() {
    const s = ME(); if (!s || !window.IDC) return '';
    return `<button type='button' class='swc' onclick="IDC.lihat('${s.id}')" aria-label='Kartu pelajar ${esc(s.nama)}. Ketuk untuk melihat depan dan belakang'>${IDC.hero(s.id, 'depan')}<span class='swc-h'>Ketuk untuk melihat depan dan belakang</span></button>`;
  }

  /* ================= 2. Beranda ================= */
  // Panel di samping kartu (desktop): ringkasan profil siswa, orang tua, dan wali. Menu tidak diulang karena sudah ada di sidebar.
  function top() {
    const s = ME(); if (!s) return '';
    const f = (a, b) => `<div class='swf'><span>${a}</span><b>${String(b || '').trim() ? esc(b) : '-'}</b></div>`;
    const g = (t, rows) => `<div class='swg'><h4>${t}</h4>${rows}</div>`;
    const ttl = [s.tl, s.tgl ? fd(s.tgl) : ''].filter(Boolean).join(', ');
    const ta = db.cfg.tahun ? ' · Tahun ajaran ' + esc(db.cfg.tahun) : '';
    return `<section class='swh'><div class='swh-c'>${hero()}</div><div class='swh-i'>
<div class='swh-t'><div><div class='swh-g'>${esc(s.nama)}</div><p class='lab swh-s'>Kelas ${esc(s.kelas)}${ta}</p></div><a class='btn s' href='#profil-${s.id}'>Profil lengkap</a></div>
<div class='swg-g'>${g('Siswa', f('NIS', s.nis) + f('NISN', s.nisn) + f('Jenis kelamin', s.jk) + f('Tempat, tgl lahir', ttl) + f('Agama', s.agama) + f('Gol. darah', s.gol))}
${g('Orang tua', f('Ayah', s.ayah) + f('Ibu', s.ibu) + f('Pekerjaan', s.pkj))}${g('Wali', f('Nama wali', s.wali) + f('Kontak', s.hp))}</div></div></section>`;
  }
  /* Ringkasan Anda: tampilan analitik seperti dashboard kelas (KPI, arus tabungan, radar, gauge, donat), seluruhnya dari data siswa ini. */
  const IC = {
    w: `<rect x='3' y='6' width='18' height='14' rx='3'/><path d='M3 10h18M16 15h2'/>`,
    t: `<path d='M3 17l6-6 4 4 7-8'/><path d='M15 7h5v5'/>`,
    r: `<path d='M6 3h12v18l-3-2-3 2-3-2-3 2z'/><path d='M9 8h6M9 12h6'/>`,
    c: `<rect x='5' y='4' width='14' height='17' rx='2'/><path d='M9 4h6v3H9zM9 14l2 2 4-4'/>`
  };
  const kpi = (c, i, l, v, sub) => `<div class='card kpi'><div class='ki ${c}'>${ico(IC[i])}</div><div class='kb'><div class='lab'>${l}</div><div class='big'>${v}</div><div class='lab'>${sub}</div></div></div>`;
  const pnl = (t, sub, b) => `<div class='card pnl'><div class='ch'><h3>${t}</h3><span class='lab'>${sub}</span></div>${b}</div>`;

  function analitik() {
    const s = ME(); if (!s) return head('Portal Siswa', 'Data Anda belum tersedia.') + `<div class='card'>${empty('Akun Anda belum ditautkan ke data siswa. Hubungi wali kelas atau admin sekolah.')}</div>`;
    const sid = s.id, m0 = mk(0), m1 = mk(-1), nom = +db.cfg.iuran || 0, cw = wkOf(today());
    const tS = (m, j) => sum(db.tab.filter(t => t.sid == sid && t.jenis == j && t.tgl.slice(0, 7) == m), t => t.jml);
    const sd = saldo(sid), sm = tS(m0, 'setor'), tm = tS(m0, 'tarik'), sp = tS(m1, 'setor'), tp = tS(m1, 'tarik');
    const pct = sp ? Math.round((sm - sp) / sp * 100) : null, pct2 = tp ? Math.round((tm - tp) / tp * 100) : null, net = sm - tm;
    const tg = +s.target || 0, tgp = tg ? Math.max(0, Math.min(100, Math.round(sd / tg * 100))) : 0;
    // iuran: minggu-minggu bulan ini yang sudah jatuh tempo (sampai minggu berjalan)
    const ws = wksOf(m0).filter(w => w <= cw), pay = w => paidWeek(sid, w);
    const kind = w => { const p = pay(w); return p > 0 && (!nom || p >= nom) ? 'lunas' : p > 0 ? 'sebagian' : 'belum' };
    const nL = ws.filter(w => kind(w) == 'lunas').length, nS = ws.filter(w => kind(w) == 'sebagian').length, nB = ws.length - nL - nS;
    const iu = ws.length && nom ? nL / ws.length * 100 : 0, pw = pay(cw);
    // kehadiran bulan ini
    const ab = db.absensi.filter(a => a.sid == sid && a.tgl.slice(0, 7) == m0), ac = k => ab.filter(a => a.st == k).length, att = ab.length ? ac('H') / ab.length * 100 : 0;
    // menabung: konsistensi 6 bulan terakhir; data lengkap: kelengkapan profil
    const mR = [...Array(DR)].map((_, i) => mk(i - DR + 1)), m6 = [...Array(6)].map((_, i) => mk(i - 5)), mn = m6.filter(m => tS(m, 'setor') > 0).length / 6 * 100;
    const lg = ['nisn', 'tl', 'tgl', 'agama', 'alamat', 'hp', 'ayah', 'ibu'].filter(k => String(s[k] || '').trim()).length / 8 * 100;
    const best = [...Array(12)].map((_, i) => mk(i - 11)).map(m => ({ m, v: tS(m, 'setor') })).sort((a, b) => b.v - a.v).slice(0, 5);
    const dow = (new Date().getDay() + 6) % 7, wv = [...Array(7)].map((_, i) => dstr(i - dow)).map(d => sum(db.tab.filter(t => t.sid == sid && t.jenis == 'setor' && t.tgl == d), t => t.jml));
    const tx = db.tab.filter(t => t.sid == sid).sort((a, b) => b.tgl.localeCompare(a.tgl)).slice(0, 5);
    const ag = db.agenda.filter(a => a.tgl >= today()).sort((a, b) => a.tgl.localeCompare(b.tgl)), inf = db.info.slice().sort((a, b) => b.tgl.localeCompare(a.tgl))[0];
    const iuSt = !nom ? '-' : !ws.length ? '-' : pw >= nom ? 'Lunas' : pw ? 'Sebagian' : 'Belum bayar';
    const donut = (rows, none) => rows.some(x => x.v > 0) ? DC.donutL(rows) : empty(none);
    return `<h3 class='swt'>Ringkasan Anda</h3><p class='sub'>${esc(db.cfg.sekolah)} · Tabungan, iuran, dan kehadiran ${esc(s.nama.split(/\s+/)[0])} · ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
<div class='grid sw-kpi'>${kpi('', 'w', 'Saldo tabungan', rp(sd), `<span class='${net >= 0 ? 'in' : 'out'}'>${net >= 0 ? '+' : '−'}${rp(Math.abs(net))}</span> bulan ini`)}${kpi('c', 't', 'Setoran bulan ini', rp(sm), pct == null ? 'Belum ada pembanding' : `<span class='${pct >= 0 ? 'in' : 'out'}'>${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span> dari bulan lalu`)}${kpi('a', 'r', 'Iuran minggu ini', iuSt, nom ? (pw ? rp(pw) + ' dari ' + rp(nom) : rp(nom) + ' per minggu') : 'Nominal belum diatur')}${kpi('b', 'c', 'Kehadiran bulan ini', ab.length ? Math.round(att) + '%' : '-', ab.length ? ac('H') + ' dari ' + ab.length + ' hari hadir' : 'Belum ada absensi')}</div>
<div class='board'>
<div class='col3'>${pnl('Target Tabungan', tg ? 'target ' + rp(tg) : 'belum diatur', `<div class='gr3 sw-g1'>${DC.gauge(tg ? tgp : 0, 'var(--ok)', 'Tercapai', tg ? rp(sd) + ' dari ' + rp(tg) : 'Atur target di profil lengkap')}</div>`)}${pnl('Profil Saya', 'bulan ini', DC.radar([{ n: 'Kehadiran', v: att }, { n: 'Iuran', v: iu }, { n: 'Menabung', v: mn }, { n: 'Target', v: tgp }, { n: 'Data lengkap', v: lg }]))}${pnl('Setoran Minggu Ini', 'Senin–Minggu', DC.mini(['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'], wv))}</div>
<div class='col3 cc'>${pnl('Arus Tabungan', `<span class='seg'><button class='${DR == 6 ? 'on' : ''}' onclick='DR=6;go()'>6 bln</button><button class='${DR == 12 ? 'on' : ''}' onclick='DR=12;go()'>12 bln</button></span>`,
  `<div class='kp2'><div><b class='bg'>${rp(sm)}</b>${pill(pct, 'up')}<div class='lg2'><i style='background:var(--ok)'></i>Setoran bulan ini</div></div><div><b class='bg'>${rp(tm)}</b>${pill(pct2, 'dn')}<div class='lg2'><i style='background:var(--er)'></i>Penarikan bulan ini</div></div></div>`
  + DC.smooth(mR.map(mlab), [{ n: 'Setoran', c: 'var(--ok)', v: mR.map(m => tS(m, 'setor')) }, { n: 'Penarikan', c: 'var(--er)', v: mR.map(m => tS(m, 'tarik')) }])
  + `<div class='top5'>${best.map((b, i) => `<div><small>No.${i + 1}</small><b>${b.v ? 'Rp ' + CH.short(b.v) : '-'}</b><span>${BLF[+b.m.slice(5) - 1]}</span></div>`).join('')}</div>`
  + `<div class='gr3'>${DC.gauge(att, 'var(--pr)', 'Kehadiran', ab.length ? ac('H') + ' dari ' + ab.length + ' hari hadir' : 'Belum ada absensi')}${DC.gauge(iu, 'var(--ac)', 'Iuran bulan ini', nom ? nL + ' dari ' + ws.length + ' minggu lunas' : 'Nominal belum diatur')}${DC.gauge(mn, 'var(--inf)', 'Menabung', m6.filter(m => tS(m, 'setor') > 0).length + ' dari 6 bulan')}</div>`)}</div>
<div class='col3'>${pnl('Terbaru', inf ? fd(inf.tgl) : '', (inf ? `<div class='lt'><small>Pengumuman terbaru</small><div class='cy'>${esc(inf.judul)}</div><div class='lab'>${esc(String(inf.isi || '').slice(0, 90))}</div></div>` : '') + (ag[0] ? `<div class='lt'><small>Agenda berikutnya · ${fd(ag[0].tgl)}</small><div class='cy'>${esc(ag[0].judul)}</div><div class='lab'>${esc(ag[0].ket)}</div></div>` : '') || empty('Belum ada pengumuman atau agenda.'))}${pnl('Status Iuran', 'bulan ini', nom ? donut([{ n: 'Lunas', v: nL, c: 'var(--ok)' }, { n: 'Sebagian', v: nS, c: 'var(--ac)' }, { n: 'Belum', v: nB, c: 'var(--er)' }], 'Belum ada minggu jatuh tempo bulan ini.') : empty('Nominal iuran belum diatur.'))}${pnl('Rekap Kehadiran', BLF[+m0.slice(5) - 1], donut([{ n: 'Hadir', v: ac('H'), c: 'var(--ok)' }, { n: 'Sakit', v: ac('S'), c: 'var(--inf)' }, { n: 'Izin', v: ac('I'), c: 'var(--ac)' }, { n: 'Alpa', v: ac('A'), c: 'var(--er)' }], 'Belum ada absensi bulan ini.'))}</div>
</div>
<div class='chg'>${pn('Transaksi terbaru', 'tabungan Anda', tx.length ? tx.map(t => `<div class='item'>${t.jenis == 'setor' ? 'Setoran' : 'Penarikan'}<span class='${t.jenis == 'setor' ? 'in' : 'out'}' style='float:right'>${t.jenis == 'setor' ? '+' : '−'}${rp(t.jml)}</span><div class='lab'>${fd(t.tgl)} · ${esc(t.cat || (t.jenis == 'setor' ? 'setor' : 'tarik'))}</div></div>`).join('') : empty('Belum ada transaksi.'))}${pn('Agenda mendatang', ag.length + ' agenda', ag.length ? ag.slice(0, 4).map(a => `<div class='item'><b>${esc(a.judul)}</b><div class='lab'>${fd(a.tgl)}${a.ket ? ' · ' + esc(a.ket) : ''}</div></div>`).join('') : empty('Belum ada agenda mendatang.'))}</div>`;
  }
  const portalView = () => top() + analitik();

  /* ================= 3. Keuangan ================= */
  function tabungan() {
    const s = ME(); if (!s) return noMe('Tabungan');
    const tx = db.tab.filter(t => t.sid == s.id).sort((a, b) => a.tgl.localeCompare(b.tgl));
    let run = 0; const rows = tx.map(t => { run += (t.jenis == 'setor' ? 1 : -1) * t.jml; return { t, bal: run } }).reverse();
    const ts = sum(tx.filter(t => t.jenis == 'setor'), t => t.jml), tt = sum(tx.filter(t => t.jenis == 'tarik'), t => t.jml), sd = ts - tt, tg = +s.target || 0;
    const pct = tg ? Math.max(0, Math.min(100, Math.round(sd / tg * 100))) : 0;
    return head('Tabungan', 'Saldo dan riwayat tabungan Anda. Setoran dan penarikan dicatat oleh admin atau pengurus.')
      + `<div class='grid'><div class='card'><div class='lab'>Saldo tabungan</div><div class='big hero'>${rp(sd)}</div>${tg ? `<div class='meter'><i style='width:${pct}%'></i></div><div class='lab'>Target ${rp(tg)} · ${pct}%</div>` : ''}</div>`
      + stat('Total setoran', rp(ts), tx.filter(t => t.jenis == 'setor').length + ' kali menyetor', 'in') + stat('Total penarikan', rp(tt), '', 'out') + `</div>`
      + `<div class='swb'><button type='button' class='p' onclick="A.buku('${s.id}')">Buku tabungan</button></div>`
      + pn('Perkembangan saldo', '6 bulan terakhir', trendSvg(s.id, 170)).replace("<div class='card'>", "<div class='card' style='margin-bottom:14px'>")
      + `<div class='card'><h3>Riwayat transaksi</h3>${tbl(['Tanggal', 'Jenis', '>Jumlah', 'Catatan', '>Saldo'], rows.map(x => `<tr><td>${fd(x.t.tgl)}</td><td>${x.t.jenis == 'setor' ? 'Setor' : 'Tarik'}</td><td class='r ${x.t.jenis == 'setor' ? 'in' : 'out'}'>${x.t.jenis == 'setor' ? '+' : '−'}${rp(x.t.jml)}</td><td>${esc(x.t.cat)}</td><td class='r'>${rp(x.bal)}</td></tr>`), 'Belum ada transaksi tabungan.')}</div>`;
  }

  function kas() {
    const l = db.kas.slice().sort((a, b) => b.tgl.localeCompare(a.tgl)), i = sum(l.filter(k => k.jenis == 'masuk'), k => k.jml), o = sum(l.filter(k => k.jenis == 'keluar'), k => k.jml);
    const ks = [-5, -4, -3, -2, -1, 0].map(mk), f = (m, j) => sum(db.kas.filter(k => k.jenis == j && k.tgl.slice(0, 7) == m), k => k.jml);
    return head('Kas Kelas', 'Pemasukan dan pengeluaran kas kelas, terpisah dari tabungan. Hanya untuk dilihat.')
      + `<div class='grid'>${stat('Pemasukan', rp(i), '', 'in')}${stat('Pengeluaran', rp(o), '', 'out')}${stat('Saldo kas', rp(i - o), '', 'hero')}</div>`
      + `<div class='card' style='margin-bottom:14px'><div class='ch'><h3>Kas masuk dan keluar</h3><span class='lab'>6 bulan terakhir</span></div>${CH.bars(ks.map(mlab), [{ n: 'Masuk', c: 'var(--ok)', v: ks.map(m => f(m, 'masuk')) }, { n: 'Keluar', c: 'var(--er)', v: ks.map(m => f(m, 'keluar')) }])}</div>`
      + `<div class='card'><h3>Catatan kas</h3>${tbl(['Tanggal', 'Jenis', 'Keterangan', '>Jumlah'], l.map(k => `<tr><td>${fd(k.tgl)}</td><td>${k.jenis == 'masuk' ? 'Masuk' : 'Keluar'}</td><td>${esc(k.ket)}</td><td class='r ${k.jenis == 'masuk' ? 'in' : 'out'}'>${rp(k.jml)}</td></tr>`), 'Belum ada catatan kas.')}${l.length ? '' : hint}</div>`;
  }

  let SIM = today().slice(0, 7);   // bulan yang ditampilkan di halaman Iuran
  function iuran() {
    const s = ME(); if (!s) return noMe('Iuran');
    const nom = +db.cfg.iuran || 0, cw = wkOf(today()), ws = wksOf(SIM), y = SIM.slice(0, 4), ml = BLF[+SIM.slice(5) - 1] + ' ' + y;
    const pay = w => paidWeek(s.id, w);
    const st = w => { const p = pay(w); return p > 0 && (!nom || p >= nom) ? 'lunas' : p > 0 ? 'sebagian' : w > cw ? 'nanti' : 'belum' };
    const LB = { lunas: '✓ Lunas', sebagian: '~ Sebagian', belum: '✕ Belum', nanti: '· Mendatang' };
    const mt = sum(ws, pay), yr = sum(db.iuran.filter(i => i.sid == s.id && i.bulan.slice(0, 4) == y), i => i.jml), nl = ws.filter(w => st(w) == 'lunas').length;
    const now = ws.includes(cw), curTxt = now ? { lunas: 'Lunas', sebagian: 'Sebagian', belum: 'Belum bayar', nanti: '-' }[st(cw)] : nl + '/' + ws.length + ' minggu lunas';
    const list = db.iuran.filter(i => i.sid == s.id && (ws.includes(i.minggu) || (!i.minggu && i.bulan == SIM))).sort((a, b) => (b.minggu || b.bulan).localeCompare(a.minggu || a.bulan) || b.tgl.localeCompare(a.tgl));
    return head('Iuran', 'Status pembayaran iuran kelas Anda per minggu. Pembayaran dicatat oleh admin atau pengurus dan otomatis masuk ke Kas Kelas.')
      + `<div class='grid'>${stat('Iuran per minggu', nom ? rp(nom) : 'Belum diatur', '')}${stat('Terkumpul ' + ml, rp(mt), 'Tahun ' + y + ': ' + rp(yr), 'hero')}${stat(now ? 'Status minggu ini' : ml, curTxt, now && st(cw) == 'sebagian' && nom ? 'Kurang ' + rp(Math.max(0, nom - pay(cw))) : now ? wkRange(cw) : '', now && st(cw) == 'lunas' ? 'in' : '')}</div>`
      + `<div class='swn' role='group' aria-label='Pilih bulan'><button type='button' onclick='SWV.im(-1)' aria-label='Bulan sebelumnya'>‹</button><b>${ml}</b><button type='button' onclick='SWV.im(1)' aria-label='Bulan berikutnya'>›</button></div>`
      + `<div class='swm-g'>${ws.map((w, i) => { const k = st(w), p = pay(w); return `<div class='swm st-${k}'><b>Mg ${i + 1}</b><span>${LB[k]}</span><small>${esc(wkRange(w))}</small><small>${p ? rp(p) : '&nbsp;'}</small></div>` }).join('')}</div>`
      + `<div class='card'><h3>Riwayat pembayaran ${ml}</h3>${tbl(['Tanggal bayar', 'Untuk minggu', '>Jumlah', 'Catatan'], list.map(i => `<tr><td>${fd(i.tgl)}</td><td>${i.minggu ? 'Mg ' + wkNo(i.minggu) + ' (' + esc(wkRange(i.minggu)) + ')' : 'Iuran bulanan (lama)'}</td><td class='r in'>${rp(i.jml)}</td><td>${esc(i.cat)}</td></tr>`), 'Belum ada pembayaran iuran di bulan ini.')}</div>`;
  }

  // Pengingat khusus siswa: status diri sendiri (pengingat WhatsApp ke wali dikirim admin/pengurus)
  function pengingat() {
    const s = ME(); if (!s) return noMe('Pengingat');
    const now = new Date(), mo = today().slice(0, 7), nom = +db.cfg.iuran || 0, bl = BLF[now.getMonth()] + ' ' + now.getFullYear();
    const sets = db.tab.filter(t => t.sid == s.id && t.jenis == 'setor' && t.tgl.slice(0, 7) == mo), pm = paidWeek(s.id), mg = wkRange(wkOf(today()));
    const ab = db.absensi.filter(a => a.sid == s.id && a.tgl.slice(0, 7) == mo), alpa = ab.filter(a => a.st == 'A').length;
    const dstr = o => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
    const ag = db.agenda.filter(a => a.tgl == today() || a.tgl == dstr(1)).sort((a, b) => a.tgl.localeCompare(b.tgl)), inf = db.info.filter(a => a.tgl >= dstr(-3)).sort((a, b) => b.tgl.localeCompare(a.tgl));
    const row = (k, t, d, href) => `<a class='swr ${k}' href='${href}'><i aria-hidden='true'>${{ ok: '✓', warn: '!', info: 'i' }[k]}</i><span><b>${t}</b><small>${d}</small></span><em aria-hidden='true'>›</em></a>`;
    const r = [];
    r.push(sets.length ? row('ok', 'Tabungan ' + bl + ' sudah ada', 'Menabung ' + sets.length + ' kali bulan ini, total ' + rp(sum(sets, t => t.jml)) + '.', '#tabungan')
      : row('warn', 'Belum menabung bulan ' + bl, 'Saldo Anda saat ini ' + rp(saldo(s.id)) + '. Setor melalui admin atau pengurus.', '#tabungan'));
    if (nom) r.push(pm >= nom ? row('ok', 'Iuran minggu ini lunas', mg + ': ' + rp(pm) + ' dari ' + rp(nom) + '.', '#iuran')
      : row('warn', 'Iuran minggu ini ' + (pm ? 'belum lunas' : 'belum dibayar'), mg + ': kekurangan ' + rp(nom - pm) + ' dari ' + rp(nom) + '.', '#iuran'));
    else r.push(row('info', 'Nominal iuran belum diatur', 'Hubungi admin sekolah untuk informasi iuran.', '#iuran'));
    if (alpa) r.push(row('warn', 'Alpa ' + alpa + ' hari bulan ini', 'Periksa rekap kehadiran Anda.', '#absensi'));
    ag.forEach(a => r.push(row('info', (a.tgl == today() ? 'Hari ini: ' : 'Besok: ') + esc(a.judul), esc(a.ket || 'Agenda kelas'), '#agenda')));
    inf.forEach(a => r.push(row('info', esc(a.judul), 'Pengumuman · ' + fd(a.tgl), '#pengumuman')));
    const need = r.filter(x => x.includes("swr warn")).length;
    return head('Pengingat', 'Hal yang perlu Anda perhatikan. Pengingat WhatsApp ke wali dikirim oleh admin atau pengurus.')
      + `<div class='card'><div class='ch'><h3>Status Anda · ${bl}</h3><span class='lab'>${need ? need + ' perlu perhatian' : 'Semua beres'}</span></div><div class='swr-l'>${r.join('')}</div></div>`;
  }

  /* ================= 4. Kelas ================= */
  const FIELDS = [['Nama lengkap', s => s.nama], ['NISN', s => s.nisn], ['NIS', s => s.nis], ['Kelas', s => s.kelas], ['Jenis kelamin', s => s.jk],
    ['Tempat, tanggal lahir', s => [s.tl, s.tgl ? fd(s.tgl) : ''].filter(Boolean).join(', ')], ['Usia', s => umur(s.tgl)], ['Agama', s => s.agama], ['Golongan darah', s => s.gol],
    ['Alamat', s => s.alamat], ['Kontak wali', s => s.hp], ['Nama ayah', s => s.ayah], ['Nama ibu', s => s.ibu], ['Nama wali', s => s.wali], ['Pekerjaan orang tua / wali', s => s.pkj],
    ['Hobi', s => s.hobi], ['Cita-cita', s => s.cita], ['Catatan kesehatan', s => s.kes], ['Tanggal masuk', s => s.masuk ? fd(s.masuk) : '']];

  function siswa() {
    const s = ME(); if (!s) return noMe('Data Siswa');
    const jb = db.struktur.filter(j => j.sid == s.id).map(j => j.jab);
    return head('Data Siswa', 'Data diri dan kartu pelajar Anda. Bila ada data yang keliru, sampaikan ke wali kelas atau admin.')
      + `<div class='swp'><div class='card swp-i'>${av(s, 72)}<div><h3>${esc(s.nama)}</h3><div class='lab'>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)}</div>${jb.length ? `<span class='tag'>${esc(jb.join(', '))}</span>` : ''}</div><a class='btn' href='#profil-${s.id}'>Profil lengkap</a></div></div>`
      + `<div class='swk'><figure><div class='swk-c'>${IDC.hero(s.id, 'depan')}</div><figcaption>Kartu pelajar · Depan</figcaption></figure><figure><div class='swk-c'>${IDC.hero(s.id, 'belakang')}</div><figcaption>Kartu pelajar · Belakang</figcaption></figure></div>`
      + `<div class='card'><h3>Data diri</h3>${FIELDS.map(f => [f[0], String(f[1](s) || '').trim()]).filter(x => x[1]).map(x => kv(x[0], esc(x[1]))).join('')}</div>`;
  }

  function struktur() {
    const s = ME(), l = db.struktur.slice(), mine = s ? l.filter(j => j.sid == s.id) : [];
    const rows = l.map(j => `<tr><td><b>${esc(j.jab)}</b></td><td>${esc(nm(j.sid))}${s && j.sid == s.id ? " <span class='tag'>Anda</span>" : ''}</td></tr>`);
    return head('Struktur Kelas', 'Pengurus kelas seperti ketua, sekretaris, bendahara, dan seksi.')
      + `<div class='grid'>${stat('Wali kelas', esc(db.cfg.walikelas) || '-', s ? 'Kelas ' + esc(s.kelas) : '')}${stat('Jabatan Anda', mine.length ? esc(mine.map(j => j.jab).join(', ')) : 'Anggota kelas', mine.length ? 'Terima kasih sudah berkontribusi' : '')}</div>`
      + `<div class='card'><h3>Pengurus kelas</h3>${tbl(['Jabatan', 'Nama'], rows, 'Belum ada pengurus kelas.')}${l.length ? '' : hint}</div>`;
  }

  let SM = today().slice(0, 7);
  function absensi() {
    const s = ME(); if (!s) return noMe('Absensi');
    const y = +SM.slice(0, 4), m = +SM.slice(5), n = new Date(y, m, 0).getDate(), off = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const rec = {}; db.absensi.filter(a => a.sid == s.id && a.tgl.slice(0, 7) == SM).forEach(a => rec[+a.tgl.slice(8)] = a.st);
    const c = k => Object.values(rec).filter(x => x == k).length, tot = Object.keys(rec).length, pc = tot ? Math.round(c('H') / tot * 100) : 0;
    const LN = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
    let cells = ''; for (let i = 0; i < off; i++) cells += `<div class='swa-e'></div>`;
    for (let d = 1; d <= n; d++) { const st = rec[d], we = (off + d - 1) % 7 > 4; cells += `<div class='swa-d ${st ? 's' + st : ''} ${we ? 'we' : ''}' title='${d} ${BLF[m - 1]}${st ? ': ' + LN[st] : ''}'><b>${d}</b><span>${st || ''}</span></div>` }
    return head('Absensi', 'Rekap kehadiran Anda per bulan. Kehadiran dicatat oleh wali kelas atau pengurus.')
      + `<div class='grid sw4'>${stat('Hadir', c('H') + ' hari', tot ? pc + '% dari ' + tot + ' hari tercatat' : 'Belum ada data bulan ini', 'in')}${stat('Sakit', c('S') + ' hari', '')}${stat('Izin', c('I') + ' hari', '')}${stat('Alpa', c('A') + ' hari', '', c('A') ? 'out' : '')}</div>`
      + `<div class='swn' role='group' aria-label='Pilih bulan'><button type='button' onclick='SWV.m(-1)' aria-label='Bulan sebelumnya'>‹</button><b>${BLF[m - 1]} ${y}</b><button type='button' onclick='SWV.m(1)' aria-label='Bulan berikutnya'>›</button></div>`
      + `<div class='card'><div class='swa-h'>${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(x => `<span>${x}</span>`).join('')}</div><div class='swa'>${cells}</div>`
      + `<div class='swa-l'>${Object.keys(LN).map(k => `<span><i class='s${k}'>${k}</i>${LN[k]}</span>`).join('')}</div></div>`;
  }

  const dateChip = a => { const d = dayOf(a.tgl); return `<div class='swd'><b>${d.getDate()}</b><span>${BL[d.getMonth()]}</span></div>` };
  function agenda() {
    const l = db.agenda.slice().sort((a, b) => a.tgl.localeCompare(b.tgl)), up = l.filter(a => a.tgl >= today()), past = l.filter(a => a.tgl < today()).reverse();
    const it = a => `<div class='swi'>${dateChip(a)}<div><b>${esc(a.judul)}</b> ${a.tgl == today() ? "<span class='tag'>Hari ini</span>" : ''}<div class='lab'>${fd(a.tgl)}${a.ket ? ' · ' + esc(a.ket) : ''}</div></div></div>`;
    return head('Agenda', 'Jadwal kegiatan kelas dan sekolah.')
      + `<div class='card' style='margin-bottom:14px'><h3>Mendatang</h3>${up.length ? up.map(it).join('') : empty('Belum ada agenda mendatang.')}</div>`
      + (past.length ? `<div class='card'><h3>Sudah lewat</h3>${past.slice(0, 20).map(it).join('')}</div>` : '');
  }
  function pengumuman() {
    const l = db.info.slice().sort((a, b) => b.tgl.localeCompare(a.tgl));
    return head('Pengumuman', 'Informasi untuk siswa dan wali murid.')
      + `<div class='card'>${l.length ? l.map(a => `<div class='swi'>${dateChip(a)}<div><b>${esc(a.judul)}</b><div class='lab'>${fd(a.tgl)}</div><div class='swi-t'>${esc(a.isi)}</div></div></div>`).join('') : empty('Belum ada pengumuman.')}</div>`;
  }

  function voting() {
    const s = ME(), tot = (db.rekan || []).length || db.siswa.length;
    return head('Voting', 'Pemilihan ketua kelas atau keputusan bersama. Suara dicatat oleh admin atau pengurus; di sini Anda melihat hasilnya.')
      + (db.vote.length ? db.vote.map(v => {
        const c = {}; Object.values(v.suara || {}).forEach(k => c[k] = (c[k] || 0) + 1);
        const n = Object.keys(v.suara || {}).length, mine = s ? (v.suara || {})[s.id] : '', mx = Math.max(0, ...v.kand.map(k => c[k] || 0));
        return `<div class='card' style='margin-bottom:12px'><h3>${esc(v.judul)} <span class='tag'>${v.open ? 'Dibuka' : 'Ditutup'}</span></h3>`
          + v.kand.map(k => `<div class='swv'><span>${esc(nm(k))}${mine == k ? " <span class='tag'>Pilihan Anda</span>" : ''}${!v.open && mx && (c[k] || 0) == mx ? " <span class='tag'>Unggul</span>" : ''}</span><span><b>${c[k] || 0}</b> suara · ${n ? Math.round((c[k] || 0) / n * 100) : 0}%</span></div><div class='meter'><i style='width:${n ? (c[k] || 0) / n * 100 : 0}%'></i></div>`).join('')
          + `<div class='lab'>${n} dari ${tot} siswa sudah memilih · ${mine ? 'Anda sudah memberikan suara' : v.open ? 'Anda belum memberikan suara' : 'Anda tidak memberikan suara'}</div></div>`;
      }).join('') : `<div class='card'>${empty('Belum ada pemilihan.')}${hint}</div>`);
  }

  /* ================= API ================= */
  window.SWV = {
    hero,
    v: { portal: portalView, tabungan, kas, iuran, pengingat, siswa, struktur, absensi, agenda, pengumuman, voting },
    im(d) { const x = new Date(+SIM.slice(0, 4), +SIM.slice(5) - 1 + d, 1); SIM = isoD(x).slice(0, 7); go() },
    m(d) { const y = +SM.slice(0, 4), m = +SM.slice(5) - 1 + d, x = new Date(y, m, 1); SM = x.getFullYear() + '-' + pad(x.getMonth() + 1); go() }
  };
})();
