/* SekolahHub: Tugas Kelas (v2.23). Menu untuk akun Siswa berjabatan Ketua, Sekretaris, dan/atau Bendahara.
   Setiap tindakan memanggil fungsi server (Data.pj.*, migrasi 020) yang memeriksa ulang jabatan, kelas, tanggal, dan batas jumlah;
   tampilan ini hanya menyembunyikan apa yang memang tidak boleh dilakukan. Dimuat setelah siswa.js.
   Memakai global: db, Data, V, go, esc, fd, rp, today, toast, empty, isoD, wkOf, wkTitle, $. */
(() => {
  'use strict';
  const JL = { ketua: 'Ketua', sekretaris: 'Sekretaris', bendahara: 'Bendahara' };
  const SL = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
  const TABS = [['absen', 'Absensi', ['ketua', 'sekretaris']], ['iuran', 'Iuran', ['bendahara']], ['kas', 'Kas', ['bendahara']], ['info', 'Pengumuman', ['ketua', 'sekretaris']]];
  const tabs = () => TABS.filter(t => t[2].some(j => Data.has(j)));
  let TAB = '', busy = false;
  let AB = null, DR = {}, RK = null;   // absensi: data server, draf pilihan, rekap bulan
  let IU = null;                        // iuran minggu terpilih
  let IJ = 'pengumuman';                // jenis pada tab Pengumuman & Agenda
  const kelas = () => (db.siswa[0] || {}).kelas || '';
  const box = () => $('#tgp');
  const wib = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const addWk = (w, n) => { const d = new Date(w + 'T00:00'); d.setDate(d.getDate() + 7 * n); return isoD(d) };
  const say = e => toast(e && e.message ? e.message : String(e));
  const dlg = (html, wire) => { const d = $('#dlg'); d.innerHTML = html; d.showModal(); const x = d.querySelector('#x'); if (x) x.onclick = () => d.close(); if (wire) wire(d); return d };
  const loading = () => { const b = box(); if (b) b.innerHTML = `<div class='card tgc'><p class='lab'>Memuat…</p></div>` };

  /* Menjalankan satu tindakan server dengan penguncian ganda-klik. */
  async function act(fn, ok, after) {
    if (busy) return; busy = true;
    try { const r = await fn(); if (ok) toast(ok); if (after) await after(r) } catch (e) { say(e) } finally { busy = false }
  }
  const reload = tables => Data.refresh(db, new Set(tables));

  /* ---------- Kerangka halaman ---------- */
  const ini = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
  const av = n => `<span class='tgav' aria-hidden='true'>${esc(ini(n))}</span>`;
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;
  const bar = (a, b, c) => `<div class='tgbar' role='progressbar' aria-valuemin='0' aria-valuemax='${b}' aria-valuenow='${a}'><span style='width:${pct(a, b)}%${c ? ';background:' + c : ''}'></span></div>`;
  const list = a => { const l = a.map(x => JL[x] || x); return l.length > 1 ? l.slice(0, -1).join(', ') + ' dan ' + l[l.length - 1] : l[0] || '' };
  function wew() {
    const L = [], X = [];
    if (Data.has('ketua')) L.push('Mengisi absensi kelas hari ini', 'Melihat rekap absensi kelas', 'Membuat, mengubah, dan menghapus pengumuman dan agenda buatan sendiri');
    if (Data.has('sekretaris')) L.push('Mengisi dan mengoreksi absensi kelas (hari ini sampai 7 hari ke belakang)', 'Melihat rekap absensi kelas', 'Membuat, mengubah, dan menghapus pengumuman dan agenda buatan sendiri');
    if (Data.has('bendahara')) L.push('Mencatat iuran mingguan siswa kelas (maksimal sebesar iuran per minggu)', 'Membatalkan pembayaran iuran yang Anda catat sendiri pada hari yang sama', 'Mencatat kas masuk dan keluar dalam batas harian yang ditetapkan admin', 'Membatalkan catatan kas buatan sendiri pada hari yang sama');
    X.push('Mengubah atau menghapus catatan lama, dan koreksi lintas hari (hubungi guru atau admin)');
    if (!Data.has('bendahara')) X.push('Mencatat iuran dan kas');
    X.push('Tabungan siswa, data pribadi siswa lain, pengaturan, dan akun');
    const u = a => [...new Set(a)].map(x => `<li>${esc(x)}</li>`).join('');
    dlg(`<h3>Wewenang Anda</h3><div class='tgw-g'><div><h4>Boleh</h4><ul>${u(L)}</ul></div><div><h4>Tidak boleh</h4><ul>${u(X)}</ul></div></div><p class='lab'>Semua tindakan tercatat atas nama Anda di riwayat aktivitas sekolah.</p><div class='acts'><button id='x' type='button' class='p'>Mengerti</button></div>`);
  }
  function view() {
    if (!Data.pejabat()) return `<h2>Tugas Kelas</h2><div class='card'>${empty('Menu ini hanya untuk Ketua, Sekretaris, dan Bendahara kelas.')}</div>`;
    const t = tabs(); if (!t.some(x => x[0] == TAB)) TAB = t[0][0];
    return `<header class='tgh'><div><h2>Tugas Kelas</h2><p class='sub'>Pencatatan atas nama Anda, hanya untuk kelas Anda.</p></div>`
      + `<div class='tgh-c'><span class='tgk-c'>Kelas ${esc(kelas())}</span>${Data.jabatan.map(j => `<span class='tgk-j ${j}'>${JL[j]}</span>`).join('')}<button type='button' class='tgh-w' onclick='TGS.wew()'>Lihat wewenang</button></div></header>`
      + `<div class='tgt' role='tablist' aria-label='Tugas'>${t.map(x => `<button type='button' role='tab' aria-selected='${x[0] == TAB}' onclick="TGS.tab('${x[0]}')">${x[1]}</button>`).join('')}</div><div id='tgp' class='tgp'></div>`;
  }
  function init() {
    const b = box(); if (!b || !Data.pejabat()) return;
    b.onclick = e => { const el = e.target.closest('[data-a]'); if (el && !el.disabled && ACT[el.dataset.a]) ACT[el.dataset.a](el.dataset, el) };
    b.onchange = e => { const el = e.target.closest('[data-c]'); if (el && CHG[el.dataset.c]) CHG[el.dataset.c](el) };
    loading();
    ({ absen: () => loadAbsen(AB && AB.tgl), iuran: () => loadIuran(IU && IU.minggu), kas: paintKas, info: paintInfo })[TAB]();
  }
  const fail = e => { const b = box(); if (b) b.innerHTML = `<div class='card tgc'>${empty(esc(e.message))}</div>` };

  /* ---------- Absensi ---------- */
  async function loadAbsen(tgl) {
    try {
      const [a, r] = await Promise.all([Data.pj.absensiKelas(tgl), Data.pj.absensiRekap((tgl || today()).slice(0, 7))]);
      AB = a; RK = r; DR = {}; a.siswa.forEach(s => { DR[s.id] = s.st || '' });
      paintAbsen();
    } catch (e) { fail(e) }
  }
  const dirtyN = () => AB ? AB.siswa.filter(s => (DR[s.id] || '') != (s.st || '')).length : 0;
  const DOT = { H: 'var(--ok)', S: 'var(--inf)', I: 'var(--ac)', A: 'var(--er)' };
  function paintAbsen() {
    const b = box(); if (!b || !AB) return;
    const S = AB.siswa, c = k => S.filter(s => DR[s.id] == k).length, filled = S.filter(s => DR[s.id]).length, blank = S.length - filled, n = dirtyN(), fixed = AB.dari == AB.sampai;
    const save = `<button type='button' class='p tgsv' data-a='simpan' ${n ? '' : 'disabled'}>${n ? 'Simpan absensi (' + n + ')' : 'Tersimpan'}</button>`;
    b.innerHTML = `<div class='tgx'><section class='card tgm'>`
      + (S.length ? S.map(s => `<div class='tgr' data-st='${DR[s.id] || ''}'>${av(s.nama)}<span class='tgn'>${esc(s.nama)}</span><div class='tgseg' role='group' aria-label='Status ${esc(s.nama)}'>${['H', 'S', 'I', 'A'].map(k => `<button type='button' class='${DR[s.id] == k ? 'on ' + k : ''}' aria-pressed='${DR[s.id] == k}' data-a='st' data-s='${esc(s.id)}' data-k='${k}' title='${SL[k]}'><b>${k}</b><span>${SL[k]}</span></button>`).join('')}</div></div>`).join('') : empty('Belum ada siswa di kelas ini. Hubungi admin untuk menautkan siswa ke kelas.'))
      + `</section><aside class='tgx-s'><div class='card tgs-c'>`
      + `<label class='tgd'>Tanggal<input type='date' id='tgd' data-c='tgl' value='${esc(AB.tgl)}' min='${esc(AB.dari)}' max='${esc(AB.sampai)}' ${fixed ? 'disabled' : ''}></label><p class='tgh-n'>${fixed ? 'Hanya hari ini yang dapat diisi.' : 'Dapat diisi sampai 7 hari ke belakang.'}</p>`
      + `<div class='tgp-n'><b>${filled}</b> dari ${S.length} siswa sudah diisi</div>${bar(filled, S.length)}`
      + `<ul class='tgl'>${['H', 'S', 'I', 'A'].map(k => `<li><i style='background:${DOT[k]}'></i>${SL[k]}<b>${c(k)}</b></li>`).join('')}<li><i class='nil'></i>Belum diisi<b>${blank}</b></li></ul>`
      + `<div class='tgx-a'><button type='button' data-a='hadir' ${blank ? '' : 'disabled'}>Isi sisanya Hadir</button><button type='button' class='tgln' data-a='reset' ${n ? '' : 'disabled'}>Batalkan perubahan</button>${save}</div></div></aside></div>`
      + `<div class='tgv'><span>${n ? n + ' perubahan belum disimpan' : 'Semua tersimpan'}</span>${save}</div>`
      + rekap();
  }
  function rekap() {
    if (!RK) return '';
    return `<details class='card tgc tgrk'><summary>Rekap bulan ${esc(RK.bulan)}</summary><div class='tw'><table class='tgk'><thead><tr><th>Nama</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th></tr></thead><tbody>${RK.siswa.map(s => `<tr><td>${esc(s.nama)}</td><td>${s.H}</td><td>${s.S}</td><td>${s.I}</td><td class='${s.A ? 'tgA' : ''}'>${s.A}</td></tr>`).join('')}</tbody></table></div></details>`;
  }

  /* ---------- Iuran ---------- */
  let IF = 'semua';
  async function loadIuran(w) {
    try { IU = await Data.pj.iuranKelas(w); paintIuran() } catch (e) { fail(e) }
  }
  function paintIuran() {
    const b = box(); if (!b || !IU) return;
    const nom = +IU.nominal || 0, S = IU.siswa;
    if (!(nom > 0)) { b.innerHTML = `<div class='card tgc'>${empty('Nominal iuran per minggu belum diatur. Hubungi guru atau admin untuk mengisinya di Pengaturan.')}</div>`; return }
    const lunas = S.filter(s => s.bayar >= nom), belum = S.filter(s => s.bayar < nom), tot = S.reduce((a, s) => a + (+s.bayar || 0), 0);
    const L = IF == 'lunas' ? lunas : IF == 'belum' ? belum : S;
    const chip = (k, t, n) => `<button type='button' class='${IF == k ? 'on' : ''}' aria-pressed='${IF == k}' data-a='if' data-f='${k}'>${t} <b>${n}</b></button>`;
    b.innerHTML = `<div class='tgx'><section class='card tgm'><div class='tgfc' role='group' aria-label='Saring siswa'>${chip('semua', 'Semua', S.length)}${chip('belum', 'Belum lunas', belum.length)}${chip('lunas', 'Lunas', lunas.length)}</div>`
      + (L.length ? L.map(s => { const st = s.bayar >= nom ? ['Lunas', 'ok'] : s.bayar > 0 ? ['Sebagian ' + rp(s.bayar), 'wn'] : ['Belum bayar', 'nl'];
        return `<div class='tgr tgr-i'>${av(s.nama)}<span class='tgn'>${esc(s.nama)}<small class='tgst ${st[1]}'>${st[0]}</small></span><div class='tga'>${s.bayar < nom ? `<button type='button' class='tgb2' data-a='bayar' data-s='${esc(s.id)}'>Catat</button>` : ''}${s.pid ? `<button type='button' class='tgln' data-a='ibatal' data-p='${esc(s.pid)}' data-s='${esc(s.id)}'>Batalkan</button>` : ''}</div></div>` }).join('')
        : empty(IF == 'belum' ? 'Semua siswa sudah lunas minggu ini.' : 'Belum ada pembayaran yang lunas.'))
      + `</section><aside class='tgx-s'><div class='card tgs-c'>`
      + `<div class='tgwk'><button type='button' data-a='mg' data-d='-1' ${IU.minggu <= addWk(IU.minggu_ini, -12) ? 'disabled' : ''} aria-label='Minggu sebelumnya'>‹</button><div><b>${esc(wkTitle(IU.minggu))}</b><small>${IU.minggu == IU.minggu_ini ? 'Minggu ini' : 'Minggu lalu'}, iuran ${rp(nom)} per siswa</small></div><button type='button' data-a='mg' data-d='1' ${IU.minggu >= IU.minggu_ini ? 'disabled' : ''} aria-label='Minggu berikutnya'>›</button></div>`
      + `<div class='tgbig'><small>Terkumpul</small><b>${rp(tot)}</b><span>dari target ${rp(nom * S.length)}</span></div>${bar(tot, nom * S.length)}`
      + `<div class='tgp-n'><b>${lunas.length}</b> dari ${S.length} siswa lunas</div><p class='tgh-n x'>Setiap pembayaran otomatis masuk ke Kas Kelas. Anda hanya dapat membatalkan pembayaran yang Anda catat sendiri hari ini.</p></div></aside></div>`;
  }

  /* ---------- Kas ---------- */
  let KS = 'keluar';
  const kasSaldo = () => db.kas.reduce((a, k) => a + (k.jenis == 'masuk' ? 1 : -1) * (+k.jml || 0), 0);
  const kasMine = k => k.created_by && Data.user && k.created_by == Data.user.id;
  const kasCan = k => kasMine(k) && !String(k.id).startsWith('iu_') && !k.rev_of && !db.kas.some(x => x.rev_of == k.id) && k.waktu && wib(k.waktu) == today();
  const IC = { up: `<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 19V5M6 11l6-6 6 6'/></svg>`, dn: `<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 5v14M18 13l-6 6-6-6'/></svg>` };
  function paintKas() {
    const b = box(); if (!b) return;
    const batas = +db.cfg.bataspj || 0;
    const pakai = j => db.kas.filter(k => kasMine(k) && k.jenis == j && !k.rev_of && !String(k.id).startsWith('iu_') && !db.kas.some(x => x.rev_of == k.id) && k.waktu && wib(k.waktu) == today()).reduce((a, k) => a + (+k.jml || 0), 0);
    const rows = db.kas.slice().sort((a, b2) => String(b2.waktu || b2.tgl).localeCompare(String(a.waktu || a.tgl))).slice(0, 20);
    const lim = (j, t) => `<div class='tglm'><div><span>${t}</span><b>${rp(pakai(j))} <small>dari ${rp(batas)}</small></b></div>${bar(pakai(j), batas, pakai(j) >= batas ? 'var(--er)' : '')}</div>`;
    b.innerHTML = `<div class='tgx tgx-r'><aside class='tgx-s'><div class='card tgs-c'><div class='tgbig'><small>Saldo kas kelas</small><b>${rp(kasSaldo())}</b></div></div>`
      + (batas ? `<div class='card tgs-c'><h3>Catat transaksi</h3><div class='tgsg' role='group' aria-label='Jenis transaksi'><button type='button' class='${KS == 'keluar' ? 'on' : ''}' aria-pressed='${KS == 'keluar'}' data-a='kj' data-j='keluar'>Pengeluaran</button><button type='button' class='${KS == 'masuk' ? 'on' : ''}' aria-pressed='${KS == 'masuk'}' data-a='kj' data-j='masuk'>Pemasukan</button></div>`
        + `<label>Jumlah<div class='tgrp'><span>Rp</span><input id='tkm' type='number' min='1' inputmode='numeric' placeholder='0'></div></label><label>Keterangan<input id='tkk' type='text' maxlength='200' placeholder='Mis. Beli spidol dan penghapus'></label><button type='button' class='p tgsv' data-a='kas'>Catat transaksi</button></div>`
        + `<div class='card tgs-c'><h3>Batas harian Anda</h3>${lim('keluar', 'Pengeluaran')}${lim('masuk', 'Pemasukan')}<p class='tgh-n'>Di atas batas, minta guru atau pengurus yang mencatat.</p></div>`
        : `<div class='card tgs-c'>${empty('Admin belum mengizinkan bendahara mencatat kas manual. Iuran tetap dapat dicatat di tab Iuran.')}</div>`)
      + `</aside><section class='card tgm'><h3 class='tgm-h'>Catatan kas terbaru</h3>`
      + (rows.length ? rows.map(k => { const inn = (k.jenis == 'masuk') == (+k.jml > 0);
        return `<div class='tgr tgr-k'><span class='tgic ${inn ? 'in' : 'out'}'>${inn ? IC.dn : IC.up}</span><span class='tgn'>${esc(k.ket || '(tanpa keterangan)')}<small>${fd(k.tgl)}${k.rev_of ? ', pembatalan' : ''}${kasMine(k) ? ', dicatat Anda' : ''}</small></span><div class='tga'><b class='${inn ? 'tg-up' : 'tg-dn'}'>${inn ? '+' : '−'}${rp(Math.abs(+k.jml || 0))}</b>${kasCan(k) ? `<button type='button' class='tgln' data-a='kbatal' data-i='${esc(k.id)}'>Batalkan</button>` : ''}</div></div>` }).join('') : empty('Belum ada catatan kas.'))
      + `</section></div>`;
  }

  /* ---------- Pengumuman dan agenda ---------- */
  const mine = a => a.oleh && Data.user && a.oleh == Data.user.id;
  function paintInfo() {
    const b = box(); if (!b) return;
    const ag = IJ == 'agenda', L = (ag ? db.agenda : db.info).filter(mine).sort((a, c) => c.tgl.localeCompare(a.tgl));
    b.innerHTML = `<div class='tgx tgx-r'><aside class='tgx-s'><div class='card tgs-c'><h3>Buat baru</h3><div class='tgsg' role='group' aria-label='Jenis'><button type='button' class='${ag ? '' : 'on'}' aria-pressed='${!ag}' data-a='ij' data-j='pengumuman'>Pengumuman</button><button type='button' class='${ag ? 'on' : ''}' aria-pressed='${ag}' data-a='ij' data-j='agenda'>Agenda</button></div>`
      + `<label>Judul<input id='tij' type='text' maxlength='120' placeholder='${ag ? 'Mis. Kerja bakti kelas' : 'Mis. Besok bawa alat gambar'}'></label>`
      + (ag ? `<label>Tanggal<input id='tit' type='date' value='${today()}'></label>` : '')
      + `<label>${ag ? 'Keterangan (opsional)' : 'Isi pengumuman'}<textarea id='tii' rows='4' maxlength='${ag ? 500 : 2000}'></textarea></label><button type='button' class='p tgsv' data-a='info'>Terbitkan</button><p class='tgh-n'>Tampil ke seluruh siswa dan orang tua dengan label asal Anda. Maksimal 10 per hari.</p></div></aside>`
      + `<section class='card tgm'><h3 class='tgm-h'>${ag ? 'Agenda' : 'Pengumuman'} buatan Anda</h3>${L.length ? L.map(a => `<div class='tgr tgr-k'><span class='tgic in'>${esc(String(a.tgl).slice(8, 10))}</span><span class='tgn'>${esc(a.judul)}<small>${fd(a.tgl)}</small></span><div class='tga'><button type='button' class='tgb2' data-a='iubah' data-i='${esc(a.id)}'>Ubah</button><button type='button' class='tgln dng' data-a='ihapus' data-i='${esc(a.id)}'>Hapus</button></div></div>`).join('') : empty('Belum ada yang Anda buat. Isi formulir di samping untuk menerbitkan yang pertama.')}</section></div>`;
  }

  /* ---------- Aksi ---------- */
  const ACT = {
    st(d) { const cur = DR[d.s] || ''; DR[d.s] = cur == d.k ? '' : d.k; paintAbsen() },
    hadir() { AB.siswa.forEach(s => { if (!DR[s.id]) DR[s.id] = 'H' }); paintAbsen() },
    reset() { AB.siswa.forEach(s => { DR[s.id] = s.st || '' }); paintAbsen() },
    simpan() {
      const rows = AB.siswa.filter(s => (DR[s.id] || '') != (s.st || '')).map(s => ({ sid: s.id, st: DR[s.id] || '' }));
      if (!rows.length) return;
      act(() => Data.pj.absensiSimpan(AB.tgl, rows), 'Absensi tersimpan', () => loadAbsen(AB.tgl));
    },
    mg(d) { loading(); loadIuran(addWk(IU.minggu, +d.d)) },
    if(d) { IF = d.f; paintIuran() },
    kj(d, el) { KS = d.j; el.parentNode.querySelectorAll('button').forEach(x => { const on = x === el; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on) }) },
    bayar(d) {
      const s = IU.siswa.find(x => x.id == d.s), sisa = IU.nominal - (+s.bayar || 0);
      dlg(`<h3>Catat iuran</h3><p><b>${esc(s.nama)}</b> · ${esc(wkTitle(IU.minggu))}</p><label>Jumlah (Rp)<input id='tjm' type='number' min='1' max='${sisa}' inputmode='numeric' value='${sisa}'></label><p class='lab'>Sisa iuran minggu ini ${rp(sisa)}. Tidak boleh melebihi sisa.</p><div class='msg' id='tje'></div><div class='acts'><button id='x' type='button'>Batal</button><span class='sp'></span><button class='p' id='tjo' type='button'>Catat iuran</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => {
          const j = Math.round(+dd.querySelector('#tjm').value);
          if (!(j > 0) || j > sisa) return dd.querySelector('#tje').textContent = 'Jumlah harus antara 1 dan ' + sisa;
          dd.close(); act(() => Data.pj.iuranCatat(s.id, IU.minggu, j), 'Iuran dicatat', async () => { await reload(['kas']); await loadIuran(IU.minggu) });
        };
      });
    },
    ibatal(d) {
      const s = IU.siswa.find(x => x.id == d.s);
      dlg(`<h3>Batalkan pembayaran?</h3><p>Pembayaran iuran <b>${esc(s.nama)}</b> yang Anda catat hari ini akan dibatalkan dan dikeluarkan dari Kas Kelas.</p><div class='acts'><button id='x' type='button'>Tidak</button><span class='sp'></span><button class='p dng' id='tjo' type='button'>Ya, batalkan</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => { dd.close(); act(() => Data.pj.iuranBatal(d.p), 'Pembayaran dibatalkan', async () => { await reload(['kas']); await loadIuran(IU.minggu) }) };
      });
    },
    kas() {
      const j = KS, m = Math.round(+$('#tkm').value), k = $('#tkk').value.trim();
      if (!(m > 0)) return toast('Isi jumlah');
      if (k.length < 3) return toast('Keterangan wajib diisi');
      dlg(`<h3>Catat kas ${j == 'keluar' ? 'keluar' : 'masuk'}?</h3><p><b>${rp(m)}</b><br>${esc(k)}</p><p class='lab'>Catatan kas tidak dapat diubah. Salah input hanya bisa dibatalkan hari ini.</p><div class='acts'><button id='x' type='button'>Periksa lagi</button><span class='sp'></span><button class='p' id='tjo' type='button'>Ya, catat</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => { dd.close(); act(() => Data.pj.kasCatat(j, m, k), 'Kas dicatat', async () => { await reload(['kas']); paintKas() }) };
      });
    },
    kbatal(d) {
      const k = db.kas.find(x => x.id == d.i); if (!k) return;
      dlg(`<h3>Batalkan catatan kas?</h3><p>${esc(k.ket || '')}<br><b>${rp(Math.abs(k.jml))}</b></p><div class='acts'><button id='x' type='button'>Tidak</button><span class='sp'></span><button class='p dng' id='tjo' type='button'>Ya, batalkan</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => { dd.close(); act(() => Data.pj.kasBatal(d.i), 'Catatan dibatalkan', async () => { await reload(['kas']); paintKas() }) };
      });
    },
    ij(d) { IJ = d.j; paintInfo() },
    info() {
      const ag = IJ == 'agenda', j = $('#tij').value.trim(), i = $('#tii').value.trim(), t = ag ? $('#tit').value : null;
      if (j.length < 3) return toast('Judul minimal 3 karakter');
      if (ag && !t) return toast('Isi tanggal agenda');
      act(() => Data.pj.infoSimpan(IJ, null, t, j, i), 'Diterbitkan', async () => { await reload([ag ? 'agenda' : 'pengumuman']); paintInfo() });
    },
    iubah(d) {
      const ag = IJ == 'agenda', a = (ag ? db.agenda : db.info).find(x => x.id == d.i); if (!a) return;
      dlg(`<h3>Ubah ${ag ? 'agenda' : 'pengumuman'}</h3><label>Judul<input id='tej' type='text' maxlength='120' value='${esc(a.judul)}'></label>${ag ? `<label>Tanggal<input id='tet' type='date' value='${esc(a.tgl)}'></label>` : ''}<label>${ag ? 'Keterangan' : 'Isi'}<textarea id='tei' rows='4' maxlength='${ag ? 500 : 2000}'>${esc(ag ? a.ket : a.isi)}</textarea></label><div class='msg' id='tje'></div><div class='acts'><button id='x' type='button'>Batal</button><span class='sp'></span><button class='p' id='tjo' type='button'>Simpan</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => {
          const j = dd.querySelector('#tej').value.trim(); if (j.length < 3) return dd.querySelector('#tje').textContent = 'Judul minimal 3 karakter';
          const t = ag ? dd.querySelector('#tet').value : a.tgl;
          dd.close(); act(() => Data.pj.infoSimpan(IJ, a.id, t, j, dd.querySelector('#tei').value.trim()), 'Perubahan disimpan', async () => { await reload([ag ? 'agenda' : 'pengumuman']); paintInfo() });
        };
      });
    },
    ihapus(d) {
      const ag = IJ == 'agenda', a = (ag ? db.agenda : db.info).find(x => x.id == d.i); if (!a) return;
      dlg(`<h3>Hapus ${ag ? 'agenda' : 'pengumuman'}?</h3><p><b>${esc(a.judul)}</b> akan hilang dari tampilan siswa dan orang tua.</p><div class='acts'><button id='x' type='button'>Batal</button><span class='sp'></span><button class='p dng' id='tjo' type='button'>Hapus</button></div>`, dd => {
        dd.querySelector('#tjo').onclick = () => { dd.close(); act(() => Data.pj.infoHapus(IJ, a.id), 'Dihapus', async () => { await reload([ag ? 'agenda' : 'pengumuman']); paintInfo() }) };
      });
    }
  };
  const CHG = {
    tgl(el) {
      if (dirtyN() && !confirm('Perubahan absensi belum disimpan. Pindah tanggal dan buang perubahan?')) { el.value = AB.tgl; return }
      if (!el.value) { el.value = AB.tgl; return }
      loading(); loadAbsen(el.value);
    }
  };

  window.TGS = { view, init, wew, tab(t) { TAB = t; go() } };
  V.tugas = view;
})();
