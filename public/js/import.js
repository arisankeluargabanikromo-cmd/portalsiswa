/* SekolahHub: impor data dari Excel (.xlsx) atau CSV ke Siswa, Tabungan, Iuran, Absensi, Kas, Agenda, dan Pengumuman.
   Dimuat setelah pengaturan.js. Bergantung pada vendor/fflate.min.js (zip) dan global app.js:
   db, save, go, A, V, uid, saldo, sis, rp, fd, today, esc, $, toast, logA, csv, Data.
   Alur: pilih berkas -> petakan kolom (otomatis) -> pratinjau & validasi -> impor -> (opsional) urungkan.
   Pembaca .xlsx ditulis sendiri di atas fflate (tanpa SheetJS) dan hanya membaca nilai tersimpan, tidak menjalankan formula/makro. */
(() => {
  'use strict';
  const MAXB = 5 * 1048576, MAXR = 3000;
  const pad = n => String(n).padStart(2, '0');
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const MON = [['jan', 'januari', 'january'], ['feb', 'februari', 'pebruari', 'february'], ['mar', 'maret', 'march'], ['apr', 'april'], ['mei', 'may'], ['jun', 'juni', 'june'], ['jul', 'juli', 'july'], ['agu', 'agt', 'agustus', 'aug', 'august'], ['sep', 'sept', 'september'], ['okt', 'oktober', 'oct', 'october'], ['nov', 'november', 'nop', 'nopember'], ['des', 'desember', 'dec', 'december']];
  const MONI = {}; MON.forEach((a, i) => a.forEach(n => { MONI[n] = i + 1 }));
  const MONN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const colName = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s };
  const colIdx = ref => { const m = /^([A-Za-z]+)/.exec(ref); let n = 0; for (const ch of m[1].toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1 };
  const iso = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() == y && t.getUTCMonth() == m - 1 && t.getUTCDate() == d ? `${y}-${pad(m)}-${pad(d)}` : '' };
  const serialIso = (n, d1904) => { const t = new Date(Date.UTC(1899, 11, 30) + (Math.floor(n) + (d1904 ? 1462 : 0)) * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) };

  /* =============== Pembaca berkas =============== */
  const els = (doc, n) => [...doc.getElementsByTagNameNS('*', n)];
  const txt = e => e ? e.textContent : '';
  function readXlsx(buf) {
    if (typeof fflate == 'undefined') throw new Error('Pustaka zip belum dimuat. Muat ulang halaman.');
    let total = 0;
    const z = fflate.unzipSync(new Uint8Array(buf), { filter: f => { total += f.originalSize; if (total > 60 * 1048576) throw new Error('Berkas terlalu besar setelah dibuka.'); return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) } });
    const xml = n => z[n] ? new DOMParser().parseFromString(fflate.strFromU8(z[n]), 'application/xml') : null;
    const wb = xml('xl/workbook.xml'); if (!wb) throw new Error('Bukan berkas Excel (.xlsx) yang valid.');
    const rel = xml('xl/_rels/workbook.xml.rels'), RN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const tg = {}; if (rel) els(rel, 'Relationship').forEach(r => { tg[r.getAttribute('Id')] = r.getAttribute('Target') });
    const d1904 = els(wb, 'workbookPr').some(e => /^(1|true)$/i.test(e.getAttribute('date1904') || ''));
    /* string bersama */
    const sst = []; const ss = xml('xl/sharedStrings.xml');
    if (ss) els(ss, 'si').forEach(si => { let t = ''; [...si.childNodes].forEach(n => { if (n.localName == 't') t += n.textContent; else if (n.localName == 'r') [...n.childNodes].forEach(x => { if (x.localName == 't') t += x.textContent }) }); sst.push(t) });
    /* gaya: format mana yang berupa tanggal */
    const isDateFmt = (id, code) => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58) || (code && /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, '')) && !/^\s*general\s*$/i.test(code));
    const dateXf = []; const st = xml('xl/styles.xml');
    if (st) { const fm = {}; els(st, 'numFmt').forEach(n => { fm[n.getAttribute('numFmtId')] = n.getAttribute('formatCode') }); const cx = els(st, 'cellXfs')[0]; if (cx) [...cx.childNodes].filter(n => n.localName == 'xf').forEach((x, i) => { const id = +x.getAttribute('numFmtId'); dateXf[i] = isDateFmt(id, fm[id]) }) }
    const sheets = [];
    els(wb, 'sheet').forEach((sh, i) => {
      const rid = sh.getAttributeNS(RN, 'id') || sh.getAttribute('r:id'); let t = tg[rid] || ''; t = t.replace(/^\/?(xl\/)?/, '');
      const doc = xml('xl/' + t); if (!doc) return;
      const rows = []; let seq = 0;
      els(doc, 'row').forEach(r => {
        const ri = r.getAttribute('r') ? +r.getAttribute('r') - 1 : seq; seq = ri + 1; const row = []; let cs = 0;
        [...r.childNodes].filter(c => c.localName == 'c').forEach(c => {
          const ref = c.getAttribute('r'), ci = ref ? colIdx(ref) : cs; cs = ci + 1; if (ci > 120) return;
          const ty = c.getAttribute('t'), sx = +c.getAttribute('s') || 0; let v = null, ce;
          const ve = [...c.childNodes].find(n => n.localName == 'v');
          if (ty == 'inlineStr') { const is = [...c.childNodes].find(n => n.localName == 'is'); v = is ? els(is, 't').map(txt).join('') : ''; ce = { t: 's', v } }
          else if (!ve) return;
          else if (ty == 's') ce = { t: 's', v: sst[+ve.textContent] || '' };
          else if (ty == 'str' || ty == 'e') ce = { t: 's', v: ve.textContent };
          else if (ty == 'b') ce = { t: 'b', v: ve.textContent == '1' };
          else { const raw = ve.textContent.trim(), n = Number(raw); if (raw === '' || isNaN(n)) return; ce = dateXf[sx] && n > 0 && n < 2958466 ? { t: 'd', v: serialIso(n, d1904), n } : { t: 'n', v: n, raw } }
          row[ci] = ce;
        });
        if (row.some(x => x && (x.t != 's' || x.v.trim() !== ''))) rows[ri] = row;
      });
      const dense = rows.filter(Boolean); if (dense.length) sheets.push({ name: sh.getAttribute('name') || 'Sheet' + (i + 1), rows: dense, idx: rows.map((r, k) => r ? k : -1).filter(k => k >= 0) });
    });
    if (!sheets.length) throw new Error('Berkas tidak berisi data.');
    return sheets;
  }
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, ''); const l1 = text.split(/\r?\n/, 1)[0] || '';
    const cnt = ch => { let q = false, n = 0; for (const c of l1) { if (c == '"') q = !q; else if (c == ch && !q) n++ } return n };
    const dl = [',', ';', '\t'].map(c => [c, cnt(c)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = '', q = false;
    const push = () => { row.push(cur); cur = '' }, end = () => { push(); rows.push(row); row = [] };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c == '"') { if (text[i + 1] == '"') { cur += '"'; i++ } else q = false } else cur += c }
      else if (c == '"') q = true; else if (c == dl) push(); else if (c == '\n') end(); else if (c == '\r') { } else cur += c;
    }
    if (cur !== '' || row.length) end();
    const out = rows.map(r => r.map(v => v === '' ? undefined : { t: 's', v })).filter(r => r.some(Boolean));
    if (!out.length) throw new Error('Berkas tidak berisi data.');
    return [{ name: 'CSV', rows: out, idx: out.map((_, i) => i) }];
  }
  async function readFile(f) {
    if (f.size > MAXB) throw new Error('Ukuran berkas maksimal 5 MB.');
    const buf = await f.arrayBuffer(), u = new Uint8Array(buf);
    if (u[0] == 0x50 && u[1] == 0x4B) return readXlsx(buf);
    if (u[0] == 0xD0 && u[1] == 0xCF && u[2] == 0x11) throw new Error('Format Excel lama (.xls) belum didukung. Buka di Excel lalu pilih Simpan Sebagai > Buku Kerja Excel (.xlsx).');
    if (/\.(xlsx|xlsm|xls)$/i.test(f.name)) throw new Error('Berkas ini bukan .xlsx yang valid.');
    let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(u) } catch (e) { s = new TextDecoder('windows-1252').decode(u) }
    if (/[\u0000-\u0008]/.test(s.slice(0, 2000))) throw new Error('Berkas ini bukan Excel atau CSV.');
    return parseCsv(s);
  }

  /* =============== Konversi nilai sel =============== */
  const T = c => { if (!c) return ''; if (c.t == 's') return c.v.trim(); if (c.t == 'n') { const r = c.raw; return /e/i.test(r) ? Number(r).toLocaleString('fullwide', { useGrouping: false }) : r } if (c.t == 'd') return c.v; return c.v ? 'TRUE' : 'FALSE' };
  function parseDateStr(s) {
    s = String(s).trim(); if (!s) return ''; let m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T].*)?$/.exec(s))) return iso(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/.exec(s))) { let y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; return iso(y, +m[2], +m[1]) }
    if ((m = /^(\d{1,2})[\s\-\/.]+([A-Za-z]+)[\s\-\/.,]+(\d{2,4})$/.exec(s))) { const mo = MONI[norm(m[2])]; if (mo) { let y = +m[3]; if (y < 100) y += 2000; return iso(y, mo, +m[1]) } }
    if (/^\d{5}$/.test(s)) return serialIso(+s);
    return '';
  }
  const dateOf = c => !c ? '' : c.t == 'd' ? c.v : c.t == 'n' ? (c.v > 20000 && c.v < 80000 ? serialIso(c.v) : '') : c.t == 's' ? parseDateStr(c.v) : '';
  function monthOf(c, dy) {
    if (!c) return ''; if (c.t == 'd') return c.v.slice(0, 7);
    if (c.t == 'n') { if (c.v > 20000 && c.v < 80000) return serialIso(c.v).slice(0, 7); if (Number.isInteger(c.v) && c.v >= 1 && c.v <= 12 && dy) return dy + '-' + pad(c.v); return '' }
    const s = T(c); let m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})$/.exec(s)) && +m[2] >= 1 && +m[2] <= 12) return m[1] + '-' + pad(+m[2]);
    if ((m = /^(\d{1,2})[-\/.](\d{4})$/.exec(s)) && +m[1] >= 1 && +m[1] <= 12) return m[2] + '-' + pad(+m[1]);
    if ((m = /^([A-Za-z]+)[\s\-\/.,]*(\d{2,4})?$/.exec(s)) && MONI[norm(m[1])]) { let y = m[2] ? +m[2] : dy; if (!y) return ''; if (y < 100) y += 2000; return y + '-' + pad(MONI[norm(m[1])]) }
    if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12 && dy) return dy + '-' + pad(+s);
    const d = parseDateStr(s); return d ? d.slice(0, 7) : '';
  }
  function numOf(c) {
    if (!c) return NaN; if (c.t == 'n') return c.v; if (c.t != 's') return NaN;
    let s = c.v.replace(/rp\.?|idr/ig, '').replace(/[\s\u00a0]/g, ''); if (!s) return NaN;
    const neg = /^\(.*\)$|^-/.test(s); s = s.replace(/[()\-+]/g, ''); let n;
    if (/^\d+$/.test(s)) n = +s;
    else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = +s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = +s.replace(/,/g, '');
    else if (/^\d+[.,]\d+$/.test(s)) n = +s.replace(',', '.'); else return NaN;
    return neg ? -n : n;
  }
  const money = c => { const n = numOf(c); return isNaN(n) ? NaN : Math.round(n) };

  /* =============== Spesifikasi per entitas =============== */
  const ID = [
    { k: 'nis', l: 'NIS', al: ['nis', 'nomorinduk', 'noinduk'], grp: 1 },
    { k: 'nama', l: 'Nama siswa', al: ['nama', 'namasiswa', 'namalengkap', 'namapesertadidik', 'namapeserta', 'siswa'], grp: 1 },
    { k: 'kelas', l: 'Kelas (opsional)', al: ['kelas', 'rombel', 'rombongan', 'rombonganbelajar'], opt: 1 }
  ];
  const JK = v => { const s = norm(v); return /^(l|lk|laki|lakilaki|pria|male|m)$/.test(s) ? 'Laki-laki' : /^(p|pr|perempuan|wanita|female|f)$/.test(s) ? 'Perempuan' : '' };
  const AGAMA = v => { const s = norm(v); const m = { islam: 'Islam', muslim: 'Islam', kristen: 'Kristen', protestan: 'Kristen', katolik: 'Katolik', katholik: 'Katolik', hindu: 'Hindu', buddha: 'Buddha', budha: 'Buddha', konghucu: 'Konghucu', khonghucu: 'Konghucu' }; return m[s] || '' };
  const GOL = v => { const m = /^(ab|a|b|o)/i.exec(String(v).trim()); return m ? m[1].toUpperCase() : '' };
  const STAT = v => { const s = norm(v); return /^(h|hadir|masuk|v|ok|ya|1)$/.test(s) ? 'H' : /^(s|sakit)$/.test(s) ? 'S' : /^(i|izin|ijin|permisi|dispensasi)$/.test(s) ? 'I' : /^(a|alpa|alpha|alfa|mangkir|tanpaketerangan|tk)$/.test(s) ? 'A' : '' };
  const JT = v => { const s = norm(v); return /^(setor|setoran|masuk|debit|deposit|menabung|tabung)$/.test(s) ? 'setor' : /^(tarik|penarikan|keluar|kredit|withdraw|ambil)$/.test(s) ? 'tarik' : '' };
  const JK2 = v => { const s = norm(v); return /^(masuk|pemasukan|in|income|debit|setor|penerimaan)$/.test(s) ? 'masuk' : /^(keluar|pengeluaran|out|expense|kredit|tarik|belanja)$/.test(s) ? 'keluar' : '' };
  const TICK = /^(v|x|ya|y|lunas|sudah|ok|paid|✓|✔|1)$/i;

  function resolve(f, ctx) {
    const nis = T(f.nis), nama = T(f.nama), kelas = T(f.kelas);
    if (!nis && !nama) return { err: 'Isi NIS atau nama siswa' };
    if (nis) { const s = ctx.byNis.get(nis.toLowerCase().replace(/\s+/g, '')) || ctx.byNis0.get(nis.replace(/^0+/, '')); if (s) return { s }; if (!nama) return { err: 'NIS ' + nis + ' tidak ditemukan' } }
    if (nama) {
      let c = ctx.byName.get(norm(nama)) || []; if (c.length > 1 && kelas) c = c.filter(s => norm(s.kelas) == norm(kelas));
      if (c.length == 1) return { s: c[0], warn: nis ? ['NIS tidak cocok, dicocokkan lewat nama'] : [] };
      if (c.length > 1) return { err: 'Nama "' + nama + '" ganda, isi NIS' };
    }
    return { err: 'Siswa tidak ditemukan (' + (nis || nama) + ')' };
  }
  const warnDate = (w, label) => { w.push(label + ' tidak valid, dikosongkan') };
  /* Pencocokan jamak: tiap baris berkas menghabiskan satu catatan identik yang sudah ada (cegah dobel saat impor ulang) */
  const multiset = (out, ctx, keyOf, existing) => {
    const cnt = new Map(); existing.forEach(r => { const k = keyOf(r); cnt.set(k, (cnt.get(k) || 0) + 1) });
    out.filter(o => !o.st).forEach(o => { const k = keyOf(o.rec), n = cnt.get(k) || 0; if (n > 0) { cnt.set(k, n - 1); o.st = 'skip'; o.msg = 'Sudah tercatat (duplikat)' } else o.st = 'new' });
  };
  const keyed = (out, ctx, keyOf, find, diff) => {
    const seen = new Map();
    out.filter(o => !o.st).forEach(o => {
      const k = keyOf(o.rec); if (seen.has(k)) { o.st = 'skip'; o.msg = 'Duplikat di berkas (baris ' + seen.get(k) + ')'; return } seen.set(k, o.n);
      const old = find(o.rec); if (!old) { o.st = 'new'; return } o.old = old;
      if (ctx.dup == 'skip') { o.st = 'skip'; o.msg = 'Sudah ada, dilewati'; return }
      const d = diff(old, o.rec); if (!d.length) { o.st = 'skip'; o.msg = 'Sudah ada, tanpa perubahan'; return } o.st = 'update'; o.msg = 'Mengubah: ' + d.join(', ');
    });
  };

  const SPEC = {
    siswa: {
      title: 'Data siswa', coll: 'siswa', dup: true, tplName: 'template-impor-siswa',
      fields: [
        { k: 'nama', l: 'Nama lengkap', req: 1, al: ['nama', 'namalengkap', 'namasiswa', 'namapesertadidik', 'namapeserta'] },
        { k: 'nis', l: 'NIS', req: 1, al: ['nis', 'nomorinduk', 'noinduk'] },
        { k: 'kelas', l: 'Kelas', req: 1, al: ['kelas', 'rombel', 'rombongan', 'rombonganbelajar'] },
        { k: 'nisn', l: 'NISN', al: ['nisn'] },
        { k: 'jk', l: 'Jenis kelamin', al: ['jeniskelamin', 'jk', 'lp', 'kelamin', 'gender', 'sex'] },
        { k: 'tl', l: 'Tempat lahir', al: ['tempatlahir', 'tmplahir', 'tempat'] },
        { k: 'tgl', l: 'Tanggal lahir', al: ['tanggallahir', 'tgllahir', 'tglllahir', 'lahir'] },
        { k: 'agama', l: 'Agama', al: ['agama'] },
        { k: 'gol', l: 'Golongan darah', al: ['golongandarah', 'goldarah', 'golda'] },
        { k: 'alamat', l: 'Alamat', al: ['alamat', 'alamatlengkap', 'alamatrumah'] },
        { k: 'hp', l: 'Kontak wali (HP/WA)', al: ['hp', 'nohp', 'nomorhp', 'telepon', 'telp', 'notelp', 'whatsapp', 'wa', 'nowa', 'nomorwa', 'kontak', 'kontakwali'] },
        { k: 'ayah', l: 'Nama ayah', al: ['ayah', 'namaayah'] },
        { k: 'ibu', l: 'Nama ibu', al: ['ibu', 'namaibu'] },
        { k: 'wali', l: 'Nama wali', al: ['wali', 'namawali'] },
        { k: 'pkj', l: 'Pekerjaan orang tua', al: ['pekerjaan', 'pekerjaanortu', 'pekerjaanorangtua'] },
        { k: 'hobi', l: 'Hobi', al: ['hobi'] },
        { k: 'cita', l: 'Cita-cita', al: ['citacita', 'cita'] },
        { k: 'masuk', l: 'Tanggal masuk', al: ['tanggalmasuk', 'tglmasuk', 'masuk'] },
        { k: 'target', l: 'Target tabungan (Rp)', al: ['targettabungan', 'target'] }
      ],
      ctx: c => { c.kelas = new Map(db.siswa.map(s => [norm(s.kelas), s.kelas])); c.nis = new Map(db.siswa.map(s => [String(s.nis).toLowerCase().replace(/\s+/g, ''), s])) },
      build(r, ctx) {
        const f = r.f, w = [], rec = {};
        const nama = T(f.nama), nis = T(f.nis).replace(/\s+/g, ''), kl = T(f.kelas);
        if (!nama) return { err: 'Nama kosong' }; if (!nis) return { err: 'NIS kosong (wajib dan unik)' }; if (!kl) return { err: 'Kelas kosong' };
        const kk = norm(kl); if (!ctx.kelas.has(kk)) ctx.kelas.set(kk, kl);
        Object.assign(rec, { nama, nis, kelas: ctx.kelas.get(kk) });
        const text = (k) => { const v = T(f[k]); if (v) rec[k] = v };
        ['nisn', 'tl', 'alamat', 'ayah', 'ibu', 'wali', 'pkj', 'hobi', 'cita'].forEach(text);
        if (T(f.jk)) { const v = JK(T(f.jk)); v ? rec.jk = v : w.push('Jenis kelamin "' + T(f.jk) + '" tidak dikenali, dikosongkan') }
        if (T(f.agama)) { const v = AGAMA(T(f.agama)); v ? rec.agama = v : w.push('Agama "' + T(f.agama) + '" tidak dikenali, dikosongkan') }
        if (T(f.gol)) { const v = GOL(T(f.gol)); v ? rec.gol = v : w.push('Golongan darah tidak dikenali, dikosongkan') }
        ['tgl', 'masuk'].forEach(k => { if (f[k] && T(f[k])) { const d = dateOf(f[k]); d ? rec[k] = d : warnDate(w, k == 'tgl' ? 'Tanggal lahir' : 'Tanggal masuk') } });
        if (f.hp && T(f.hp)) { let h = T(f.hp).replace(/[^\d+]/g, ''); if (f.hp.t == 'n' && /^8\d{8,11}$/.test(h)) h = '0' + h; if (h) rec.hp = h }
        if (f.target && T(f.target)) { const n = money(f.target); isNaN(n) || n < 0 ? w.push('Target tabungan tidak valid, diabaikan') : rec.target = n }
        return { rec, warn: w, label: nama + ' · ' + nis + ' · ' + rec.kelas };
      },
      classify(out, ctx) { keyed(out, ctx, r => r.nis.toLowerCase(), r => ctx.nis.get(r.nis.toLowerCase()), (old, r) => Object.keys(r).filter(k => k != 'nis' && String(old[k] == null ? '' : old[k]) !== String(r[k])).map(k => (SPEC.siswa.fields.find(f => f.k == k) || { l: k }).l.toLowerCase())) },
      add(r) { db.siswa.push({ id: uid(), nisn: '', jk: '', tl: '', tgl: '', agama: '', gol: '', alamat: '', hp: '', ayah: '', ibu: '', wali: '', pkj: '', hobi: '', cita: '', kes: '', masuk: '', bio: '', target: 0, ...r }) },
      merge(old, r) { Object.assign(old, r) }
    },
    tab: {
      title: 'Transaksi tabungan', coll: 'tab', tplName: 'template-impor-tabungan',
      fields: [...ID,
        { k: 'tgl', l: 'Tanggal', req: 1, al: ['tanggal', 'tgl', 'tanggaltransaksi', 'tgltransaksi', 'waktu'] },
        { k: 'jenis', l: 'Jenis (Setor/Tarik)', al: ['jenis', 'jenistransaksi', 'tipe', 'transaksi'] },
        { k: 'jml', l: 'Jumlah (Rp)', al: ['jumlah', 'nominal', 'nilai', 'rp', 'jml', 'uang'] },
        { k: 'setor', l: 'Kolom Setoran (alternatif)', al: ['setoran', 'setor', 'menabung', 'debit'], opt: 1 },
        { k: 'tarik', l: 'Kolom Penarikan (alternatif)', al: ['penarikan', 'tarik', 'kredit'], opt: 1 },
        { k: 'cat', l: 'Catatan', al: ['catatan', 'keterangan', 'ket', 'cat', 'uraian', 'note'] }],
      hint: 'Isi salah satu: kolom Jenis + Jumlah, atau kolom Setoran dan/atau Penarikan terpisah.',
      build(r, ctx) {
        const f = r.f, w = []; const rs = resolve(f, ctx); if (rs.err) return { err: rs.err }; if (rs.warn) w.push(...rs.warn);
        const tgl = dateOf(f.tgl); if (!tgl) return { err: T(f.tgl) ? 'Tanggal "' + T(f.tgl) + '" tidak valid' : 'Tanggal kosong' };
        const cat = T(f.cat), items = [];
        const add = (jenis, jml) => items.push({ rec: { sid: rs.s.id, tgl, jenis, jml, cat }, label: rs.s.nama + ' · ' + fd(tgl) + ' · ' + (jenis == 'setor' ? 'Setor ' : 'Tarik ') + rp(jml) });
        if (f.jml && T(f.jml)) { const j = JT(T(f.jenis)); if (!j) return { err: T(f.jenis) ? 'Jenis "' + T(f.jenis) + '" tidak dikenali (setor/tarik)' : 'Jenis kosong' }; const n = money(f.jml); if (isNaN(n) || n <= 0) return { err: 'Jumlah "' + T(f.jml) + '" tidak valid' }; add(j, n) }
        [['setor', 'setor'], ['tarik', 'tarik']].forEach(([k, j]) => { if (f[k] && T(f[k])) { const n = money(f[k]); if (!isNaN(n) && n > 0) add(j, n); else if (!isNaN(n) && n < 0) return; else if (!/^[-–0]+$/.test(T(f[k]))) w.push('Nilai ' + k + ' "' + T(f[k]) + '" tidak valid, diabaikan') } });
        if (!items.length) return { skip: 1 };
        return { items, warn: w };
      },
      classify(out, ctx) {
        multiset(out, ctx, r => [r.sid, r.tgl, r.jenis, r.jml, norm(r.cat)].join('|'), db.tab);
        const ns = out.filter(o => o.st == 'new').sort((a, b) => a.rec.tgl.localeCompare(b.rec.tgl) || (a.rec.jenis == 'setor' ? -1 : 1) - (b.rec.jenis == 'setor' ? -1 : 1) || a.n - b.n), run = new Map();
        ns.forEach(o => { const s = o.rec.sid; if (!run.has(s)) run.set(s, saldo(s)); const v = run.get(s) + (o.rec.jenis == 'setor' ? o.rec.jml : -o.rec.jml); if (v < 0) { o.st = 'error'; o.msg = 'Saldo tidak cukup (tersedia ' + rp(run.get(s)) + ')' } else run.set(s, v) });
        out.order = ns.filter(o => o.st == 'new');
      },
      add(r) { db.tab.push({ id: uid(), ...r }) }
    },
    iuran: {
      title: 'Pembayaran iuran mingguan', coll: 'iuran', dup: true, tplName: 'template-impor-iuran',
      fields: [...ID,
        { k: 'minggu', l: 'Minggu (tanggal mana saja di minggu itu)', list: 1, al: ['minggu', 'pekan', 'mingguke', 'tanggalminggu', 'untukminggu', 'periode'] },
        { k: 'jml', l: 'Jumlah (Rp)', list: 1, al: ['jumlah', 'nominal', 'iuran', 'bayar', 'dibayar', 'jml'] },
        { k: 'tgl', l: 'Tanggal bayar', list: 1, al: ['tanggalbayar', 'tglbayar', 'dibayarpada', 'tanggal', 'tgl'] },
        { k: 'cat', l: 'Catatan', list: 1, al: ['catatan', 'keterangan', 'ket', 'cat'] }],
      hint: 'Satu baris per pembayaran mingguan. Kolom Minggu berisi tanggal mana saja di minggu yang dibayar; bila kosong, minggu diambil dari Tanggal bayar. Jumlah kosong memakai iuran per minggu di Pengaturan. Setiap pembayaran otomatis masuk ke Kas Kelas.',
      build(r, ctx) {
        const f = r.f, w = []; const rs = resolve(f, ctx); if (rs.err) return { err: rs.err }; if (rs.warn) w.push(...rs.warn);
        const cat = T(f.cat), mg = f.minggu && T(f.minggu) ? dateOf(f.minggu) : '', tb = f.tgl && T(f.tgl) ? dateOf(f.tgl) : '';
        if (f.minggu && T(f.minggu) && !mg) return { err: 'Minggu \"' + T(f.minggu) + '\" tidak valid (pakai tanggal)' };
        if (f.tgl && T(f.tgl) && !tb) return { err: 'Tanggal bayar \"' + T(f.tgl) + '\" tidak valid' };
        if (!mg && !tb) return { err: 'Minggu dan Tanggal bayar sama-sama kosong' };
        const minggu = wkOf(mg || tb), tgl = tb || mg;
        const n = f.jml && T(f.jml) ? money(f.jml) : (+db.cfg.iuran || NaN); if (isNaN(n) || n <= 0) return { err: f.jml && T(f.jml) ? 'Jumlah \"' + T(f.jml) + '\" tidak valid' : 'Jumlah kosong dan iuran per minggu belum diatur di Pengaturan' };
        return { rec: { sid: rs.s.id, bulan: minggu.slice(0, 7), minggu, jml: n, tgl, cat }, warn: w, label: rs.s.nama + ' · ' + wkTitle(minggu) + ' · ' + rp(n) };
      },
      classify(out, ctx) { keyed(out, ctx, r => r.sid + '|' + r.minggu, r => db.iuran.find(x => x.sid == r.sid && x.minggu == r.minggu), (old, r) => ['jml', 'tgl'].filter(k => String(old[k]) !== String(r[k])).map(k => k == 'jml' ? 'jumlah ' + rp(old.jml) + ' → ' + rp(r.jml) : 'tanggal bayar')) },
      add(r) { db.iuran.push({ id: uid(), ...r }) },
      merge(old, r) { old.jml = r.jml; old.tgl = r.tgl; if (r.cat) old.cat = r.cat }
    },
    absensi: {
      title: 'Absensi', coll: 'absensi', dup: true, tplName: 'template-impor-absensi', matrix: 'tgl',
      fields: [...ID,
        { k: 'tgl', l: 'Tanggal', req: 1, list: 1, al: ['tanggal', 'tgl', 'hari'] },
        { k: 'st', l: 'Status (H/S/I/A)', req: 1, list: 1, al: ['status', 'kehadiran', 'absen', 'keterangan', 'st', 'hadir'] }],
      hint: 'Format daftar (satu baris per siswa per hari) atau matriks (kolom tanggal) terdeteksi otomatis. Status: H/Hadir, S/Sakit, I/Izin, A/Alpa.',
      build(r, ctx) {
        const f = r.f, w = []; const rs = resolve(f, ctx); if (rs.err) return { err: rs.err }; if (rs.warn) w.push(...rs.warn);
        let tgl, st;
        if (r.mx) { const t = T(r.mx.cell); if (!t) return { skip: 1 }; tgl = r.mx.date; st = STAT(t); if (!st) return { err: 'Status "' + t + '" tidak dikenali (H/S/I/A)' } }
        else { if (!T(f.st)) return { skip: 1 }; tgl = dateOf(f.tgl); if (!tgl) return { err: T(f.tgl) ? 'Tanggal "' + T(f.tgl) + '" tidak valid' : 'Tanggal kosong' }; st = STAT(T(f.st)); if (!st) return { err: 'Status "' + T(f.st) + '" tidak dikenali (H/S/I/A)' } }
        const N = { H: 'Hadir', S: 'Sakit', I: 'Izin', A: 'Alpa' };
        return { rec: { sid: rs.s.id, tgl, st }, warn: w, label: rs.s.nama + ' · ' + fd(tgl) + ' · ' + N[st] };
      },
      classify(out, ctx) { keyed(out, ctx, r => r.sid + '|' + r.tgl, r => db.absensi.find(x => x.sid == r.sid && x.tgl == r.tgl), (old, r) => old.st != r.st ? ['status ' + old.st + ' → ' + r.st] : []) },
      add(r) { db.absensi.push({ id: r.tgl + '_' + r.sid, ...r }) },
      merge(old, r) { old.st = r.st }
    },
    kas: {
      title: 'Kas kelas', coll: 'kas', tplName: 'template-impor-kas',
      fields: [
        { k: 'tgl', l: 'Tanggal', req: 1, al: ['tanggal', 'tgl', 'waktu'] },
        { k: 'jenis', l: 'Jenis (Masuk/Keluar)', al: ['jenis', 'tipe', 'transaksi'] },
        { k: 'jml', l: 'Jumlah (Rp)', al: ['jumlah', 'nominal', 'nilai', 'jml'] },
        { k: 'in', l: 'Kolom Pemasukan (alternatif)', al: ['pemasukan', 'uangmasuk', 'masuk', 'debit', 'penerimaan'], opt: 1 },
        { k: 'out', l: 'Kolom Pengeluaran (alternatif)', al: ['pengeluaran', 'uangkeluar', 'keluar', 'kredit', 'belanja'], opt: 1 },
        { k: 'ket', l: 'Keterangan', al: ['keterangan', 'ket', 'uraian', 'catatan', 'deskripsi'] }],
      hint: 'Isi salah satu: kolom Jenis + Jumlah, atau kolom Pemasukan dan/atau Pengeluaran terpisah.',
      build(r, ctx) {
        const f = r.f, w = [], ket = T(f.ket), items = [];
        const tgl = dateOf(f.tgl); if (!tgl) return { err: T(f.tgl) ? 'Tanggal "' + T(f.tgl) + '" tidak valid' : 'Tanggal kosong' };
        const add = (jenis, jml) => items.push({ rec: { tgl, jenis, jml, ket }, label: fd(tgl) + ' · ' + (jenis == 'masuk' ? 'Masuk ' : 'Keluar ') + rp(jml) + (ket ? ' · ' + ket : '') });
        if (f.jml && T(f.jml)) { const j = JK2(T(f.jenis)); if (!j) return { err: T(f.jenis) ? 'Jenis "' + T(f.jenis) + '" tidak dikenali (masuk/keluar)' : 'Jenis kosong' }; const n = money(f.jml); if (isNaN(n) || n <= 0) return { err: 'Jumlah "' + T(f.jml) + '" tidak valid' }; add(j, n) }
        [['in', 'masuk'], ['out', 'keluar']].forEach(([k, j]) => { if (f[k] && T(f[k])) { const n = money(f[k]); if (!isNaN(n) && n > 0) add(j, n); else if (isNaN(n) && !/^[-–0]+$/.test(T(f[k]))) w.push('Nilai ' + k + ' "' + T(f[k]) + '" tidak valid, diabaikan') } });
        if (!items.length) return { skip: 1 };
        return { items, warn: w };
      },
      classify(out, ctx) { multiset(out, ctx, r => [r.tgl, r.jenis, r.jml, norm(r.ket)].join('|'), db.kas) },
      add(r) { db.kas.push({ id: uid(), ...r }) }
    },
    agenda: {
      title: 'Agenda', coll: 'agenda', dup: true, tplName: 'template-impor-agenda',
      fields: [
        { k: 'tgl', l: 'Tanggal', req: 1, al: ['tanggal', 'tgl', 'waktu', 'hari'] },
        { k: 'judul', l: 'Judul kegiatan', req: 1, al: ['judul', 'kegiatan', 'agenda', 'acara', 'nama', 'namakegiatan'] },
        { k: 'ket', l: 'Keterangan', al: ['keterangan', 'ket', 'deskripsi', 'tempat', 'catatan', 'detail'] }],
      build(r) {
        const f = r.f, tgl = dateOf(f.tgl), judul = T(f.judul); if (!judul) return { err: 'Judul kosong' }; if (!tgl) return { err: T(f.tgl) ? 'Tanggal "' + T(f.tgl) + '" tidak valid' : 'Tanggal kosong' };
        return { rec: { tgl, judul, ket: T(f.ket) }, label: fd(tgl) + ' · ' + judul };
      },
      classify(out, ctx) { keyed(out, ctx, r => r.tgl + '|' + norm(r.judul), r => db.agenda.find(x => x.tgl == r.tgl && norm(x.judul) == norm(r.judul)), (old, r) => String(old.ket || '') !== r.ket && r.ket ? ['keterangan'] : []) },
      add(r) { db.agenda.push({ id: uid(), ...r }) },
      merge(old, r) { if (r.ket) old.ket = r.ket }
    },
    info: {
      title: 'Pengumuman', coll: 'info', dup: true, tplName: 'template-impor-pengumuman',
      fields: [
        { k: 'tgl', l: 'Tanggal (kosong = hari ini)', al: ['tanggal', 'tgl', 'waktu'] },
        { k: 'judul', l: 'Judul', req: 1, al: ['judul', 'pengumuman', 'perihal', 'subjek', 'topik'] },
        { k: 'isi', l: 'Isi pengumuman', al: ['isi', 'keterangan', 'ket', 'deskripsi', 'konten', 'pesan', 'detail'] }],
      build(r) {
        const f = r.f, w = [], judul = T(f.judul); if (!judul) return { err: 'Judul kosong' };
        let tgl = f.tgl && T(f.tgl) ? dateOf(f.tgl) : ''; if (f.tgl && T(f.tgl) && !tgl) return { err: 'Tanggal "' + T(f.tgl) + '" tidak valid' }; if (!tgl) { tgl = today(); w.push('Tanggal kosong, memakai hari ini') }
        return { rec: { tgl, judul, isi: T(f.isi) }, warn: w, label: fd(tgl) + ' · ' + judul };
      },
      classify(out, ctx) { keyed(out, ctx, r => r.tgl + '|' + norm(r.judul), r => db.info.find(x => x.tgl == r.tgl && norm(x.judul) == norm(r.judul)), (old, r) => String(old.isi || '') !== r.isi && r.isi ? ['isi'] : []) },
      add(r) { db.info.push({ id: uid(), ...r }) },
      merge(old, r) { if (r.isi) old.isi = r.isi }
    }
  };

  /* =============== Deteksi header & pemetaan =============== */
  function matrixCols(spec, hdr, dy) {
    if (!spec.matrix) return null; const cols = [];
    hdr.forEach((c, i) => {
      if (!c) return;
      if (spec.matrix == 'bulan') {
        let ym = '';
        if (c.t == 'd') ym = c.v.slice(0, 7);
        else if (c.t == 's') { const s = c.v.trim(), m = /^([A-Za-z]+)[\s\-\/.,]*(\d{2,4})?$/.exec(s); if (m && MONI[norm(m[1])]) { let y = m[2] ? +m[2] : dy; if (y && y < 100) y += 2000; ym = y ? y + '-' + pad(MONI[norm(m[1])]) : 'M' + pad(MONI[norm(m[1])]) } }
        if (ym) cols.push({ col: i, ym, name: c.t == 'd' ? MONN[+c.v.slice(5, 7) - 1] + ' ' + c.v.slice(0, 4) : T(c) });
      } else { const d = c.t == 'd' ? c.v : c.t == 's' ? parseDateStr(c.v) : c.t == 'n' && c.v > 40000 && c.v < 60000 ? serialIso(c.v) : ''; if (d) cols.push({ col: i, date: d, name: fd(d) }) }
    });
    return cols.length >= 3 ? cols : null;
  }
  function detectHeader(spec, rows, dy) {
    const al = new Set(spec.fields.flatMap(f => f.al)); let best = -1, bi = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i] || []; let sc = r.reduce((n, c) => n + (c && al.has(norm(T(c))) ? 1 : 0), 0);
      const mc = matrixCols(spec, r, dy); if (mc) sc += mc.length; if (sc > best) { best = sc; bi = i }
    }
    return best > 0 ? bi : 0;
  }
  function autoMap(spec, hdr, mcols) {
    const used = new Set(mcols ? mcols.map(m => m.col) : []), map = {}, names = hdr.map(c => norm(T(c)));
    const fields = spec.fields.filter(f => !(mcols && f.list));
    fields.forEach(f => { const i = names.findIndex((n, k) => !used.has(k) && n && f.al.includes(n)); if (i >= 0) { map[f.k] = i; used.add(i) } });
    fields.forEach(f => { if (f.k in map) return; const i = names.findIndex((n, k) => !used.has(k) && n && f.al.some(a => a.length >= 4 && (n.includes(a) || (n.length >= 4 && a.includes(n))))); if (i >= 0) { map[f.k] = i; used.add(i) } });
    return map;
  }

  /* =============== Analisis =============== */
  function makeCtx() {
    const ctx = { dup: S.dup, year: S.year, byNis: new Map(), byNis0: new Map(), byName: new Map() };
    const z = new Map();
    db.siswa.forEach(s => { ctx.byNis.set(String(s.nis).toLowerCase().replace(/\s+/g, ''), s); const k = String(s.nis).replace(/^0+/, ''); z.set(k, z.has(k) ? null : s); const nn = norm(s.nama); ctx.byName.set(nn, [...(ctx.byName.get(nn) || []), s]) });
    z.forEach((s, k) => { if (s) ctx.byNis0.set(k, s) });
    if (SPEC[S.kind].ctx) SPEC[S.kind].ctx(ctx);
    return ctx;
  }
  function expand() {
    const sh = S.sheets[S.si], rows = sh.rows, out = [];
    for (let i = S.hdr + 1; i < rows.length; i++) {
      const row = rows[i] || [], f = {}; Object.keys(S.map).forEach(k => { const c = row[S.map[k]]; if (c && !(c.t == 's' && c.v.trim() === '')) f[k] = c });
      const n = sh.idx[i] + 1;
      if (S.mcols) S.mcols.forEach(m => { const cell = row[m.col]; if (!cell) return; out.push({ n, f, row, mx: { cell, ym: m.ym && m.ym[0] == 'M' ? S.year + '-' + m.ym.slice(1) : m.ym, date: m.date } }) });
      else if (Object.keys(f).length) out.push({ n, f, row });
    }
    return out;
  }
  function analyze() {
    const spec = SPEC[S.kind], ctx = makeCtx(), out = [];
    expand().forEach(raw => {
      let b; try { b = spec.build(raw, ctx) } catch (e) { b = { err: 'Galat: ' + e.message } }
      if (b.skip) return; if (b.err) { out.push({ n: raw.n, st: 'error', msg: b.err, raw }); return }
      (b.items || [b]).forEach(it => out.push({ n: raw.n, raw, warn: b.warn || [], rec: it.rec, label: it.label }));
    });
    spec.classify(out, ctx); return out;
  }

  /* =============== Antarmuka =============== */
  let S = null;
  const dlgEl = () => $('#dlg');
  const icUp = `<svg viewBox='0 0 24 24' width='30' height='30' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 16V4M7 9l5-5 5 5'/><path d='M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3'/></svg>`;
  function show(html) {
    const d = dlgEl(); d.innerHTML = html; d.classList.add('imp'); if (!d.open) { d.showModal(); d.addEventListener('close', () => { d.classList.remove('imp'); S = null }, { once: true }) }
    const x = d.querySelector('#imx'); if (x) x.onclick = () => d.close();
  }
  const head = () => `<h3>Impor ${esc(SPEC[S.kind].title)} dari Excel</h3>`;

  function stepPick(msg) {
    const spec = SPEC[S.kind];
    const cols = spec.fields.filter(f => !f.opt).map(f => f.l + (f.req ? '*' : '')).join(', ');
    show(head() + `<p class='lab'>Unggah berkas <b>.xlsx</b> atau <b>.csv</b>. Judul kolom dikenali otomatis dan bisa Anda sesuaikan di langkah berikutnya. Maksimal ${MAXR.toLocaleString('id-ID')} baris, 5 MB.</p>`
      + `<label class='drz' id='drz' for='imf'>${icUp}<b>Pilih berkas atau seret ke sini</b><span class='lab'>.xlsx · .csv</span></label><input id='imf' type='file' accept='.xlsx,.xlsm,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv' hidden>`
      + `<div class='msg' id='imm' role='alert'>${esc(msg || '')}</div>`
      + `<details class='imd'><summary>Kolom yang dikenali</summary><p class='lab'>${esc(cols)}${spec.hint ? '. ' + esc(spec.hint) : ''}</p></details>`
      + `<div class='acts'><button type='button' class='imt' id='imt'>Unduh template Excel</button><span class='sp'></span><button id='imx' type='button'>Batal</button></div>`);
    const d = dlgEl(), inp = d.querySelector('#imf'), z = d.querySelector('#drz');
    d.querySelector('#imt').onclick = () => IMP.tpl(S.kind);
    const go1 = async f => {
      if (!f) return; const m = d.querySelector('#imm'); m.style.color = 'var(--mu)'; m.textContent = 'Membaca berkas…';
      try { S.sheets = await readFile(f); S.file = { name: f.name, size: f.size }; S.si = S.sheets.findIndex(s => s.rows.length > 1); if (S.si < 0) S.si = 0; setupSheet(); stepMap() }
      catch (e) { m.style.color = ''; m.textContent = e.message || 'Gagal membaca berkas' }
    };
    inp.onchange = () => go1(inp.files[0]);
    ['dragenter', 'dragover'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add('on') }));
    ['dragleave', 'drop'].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove('on') }));
    z.addEventListener('drop', e => go1(e.dataTransfer.files[0]));
  }
  function setupSheet() {
    const spec = SPEC[S.kind], rows = S.sheets[S.si].rows;
    S.hdr = detectHeader(spec, rows, S.year); rehead();
  }
  function rehead() {
    const spec = SPEC[S.kind], rows = S.sheets[S.si].rows, hdr = rows[S.hdr] || [];
    S.headers = hdr; S.mcols = matrixCols(spec, hdr, S.year); S.map = autoMap(spec, hdr, S.mcols);
  }
  const opts = (S0, sel) => `<option value=''>— jangan diimpor —</option>` + S0.headers.map((c, i) => c ? `<option value='${i}' ${sel === i ? 'selected' : ''}>${colName(i)} · ${esc(T(c).slice(0, 28) || '(kosong)')}</option>` : '').join('');

  function stepMap() {
    const spec = SPEC[S.kind], sh = S.sheets[S.si], dataRows = sh.rows.length - S.hdr - 1;
    const fields = spec.fields.filter(f => !(S.mcols && f.list));
    const idOk = !spec.fields.some(f => f.grp) || ['nis', 'nama'].some(k => k in S.map);
    show(head()
      + `<div class='imf'><b>${esc(S.file.name)}</b><span class='lab'>${(S.file.size / 1024).toFixed(0)} KB · ${dataRows} baris data</span></div>`
      + `<div class='imm2'>${S.sheets.length > 1 ? `<label>Lembar kerja<select id='imsh'>${S.sheets.map((s, i) => `<option value='${i}' ${i == S.si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>` : ''}<label>Baris judul kolom (nomor baris di Excel)<input id='imhd' type='number' min='1' max='${sh.idx[sh.idx.length - 1] + 1}' value='${sh.idx[S.hdr] + 1}'></label>`
      + (spec.matrix == 'bulan' ? `<label>Tahun (untuk judul bulan tanpa tahun)<input id='imyr' type='number' min='2000' max='2100' value='${S.year}'></label>` : '') + `</div>`
      + (S.mcols ? `<div class='nt ok'>Format matriks terdeteksi: ${S.mcols.length} kolom ${spec.matrix == 'bulan' ? 'bulan' : 'tanggal'} (${esc(S.mcols.slice(0, 4).map(m => m.name).join(', '))}${S.mcols.length > 4 ? ', …' : ''}). Setiap sel berisi data diimpor sebagai satu catatan.</div>` : '')
      + `<h4 class='sh4'>Petakan kolom</h4><div class='imm'>${fields.map(f => `<label>${esc(f.l)}${f.req ? " <span class='rq' title='Wajib'>*</span>" : ''}<select data-f='${f.k}'>${opts(S, S.map[f.k])}</select></label>`).join('')}</div>`
      + (spec.hint ? `<p class='lab'>${esc(spec.hint)}</p>` : '')
      + (spec.dup ? `<div class='imr' role='radiogroup' aria-label='Jika data sudah ada'><b>Jika data sudah ada:</b><label class='chk'><input type='radio' name='imd' value='update' ${S.dup == 'update' ? 'checked' : ''}>Perbarui</label><label class='chk'><input type='radio' name='imd' value='skip' ${S.dup == 'skip' ? 'checked' : ''}>Lewati</label></div>` : '')
      + `<div class='msg' id='imm' role='alert'>${idOk ? '' : 'Petakan minimal kolom NIS atau Nama siswa.'}</div>`
      + `<div class='acts'><button type='button' id='imb'>Ganti berkas</button><span class='sp'></span><button id='imx' type='button'>Batal</button><button type='button' class='p' id='imn'>Periksa data</button></div>`);
    const d = dlgEl(), msg = t => { d.querySelector('#imm').textContent = t };
    d.querySelectorAll('[data-f]').forEach(s => { s.onchange = () => { if (s.value === '') delete S.map[s.dataset.f]; else S.map[s.dataset.f] = +s.value } });
    d.querySelectorAll('[name=imd]').forEach(r => { r.onchange = () => { S.dup = r.value } });
    const sel = d.querySelector('#imsh'); if (sel) sel.onchange = () => { S.si = +sel.value; setupSheet(); stepMap() };
    d.querySelector('#imhd').onchange = e => { const want = (+e.target.value || 1) - 1; let k = sh.idx.findIndex(x => x >= want); if (k < 0) k = sh.idx.length - 1; S.hdr = k; rehead(); stepMap() };
    const yr = d.querySelector('#imyr'); if (yr) yr.onchange = () => { S.year = +yr.value || S.year; rehead(); stepMap() };
    d.querySelector('#imb').onclick = () => stepPick();
    d.querySelector('#imn').onclick = () => {
      for (const f of fields) if (f.req && !(f.k in S.map)) return msg('Kolom wajib belum dipetakan: ' + f.l);
      if (spec.fields.some(f => f.grp) && !['nis', 'nama'].some(k => k in S.map)) return msg('Petakan minimal kolom NIS atau Nama siswa.');
      if (dataRows > MAXR) return msg('Terlalu banyak baris (' + dataRows + '). Maksimal ' + MAXR + ' per impor; pecah berkasnya.');
      const needAmt = S.kind == 'tab' || S.kind == 'kas';
      if (needAmt && !(('jml' in S.map && 'jenis' in S.map) || ['setor', 'tarik', 'in', 'out'].some(k => k in S.map))) return msg(S.kind == 'tab' ? 'Petakan kolom Jenis + Jumlah, atau kolom Setoran/Penarikan.' : 'Petakan kolom Jenis + Jumlah, atau kolom Pemasukan/Pengeluaran.');
      if (S.kind == 'iuran' && !('minggu' in S.map) && !('tgl' in S.map)) return msg('Petakan kolom Minggu atau Tanggal bayar.');
      if (S.kind == 'absensi' && !S.mcols && !(('tgl' in S.map) && ('st' in S.map))) return msg('Petakan kolom Tanggal dan Status, atau pakai berkas format matriks (kolom tanggal).');
      S.res = analyze(); stepPreview();
    };
  }

  const BD = { new: 'Baru', update: 'Ubah', skip: 'Lewati', error: 'Masalah' };
  function stepPreview() {
    const spec = SPEC[S.kind], res = S.res, c = { new: 0, update: 0, skip: 0, error: 0 }; res.forEach(o => c[o.st]++);
    const ok = c.new + c.update, warns = res.filter(o => o.warn && o.warn.length && o.st != 'error').length;
    const list = [...res.filter(o => o.st == 'error'), ...res.filter(o => o.st != 'error')].slice(0, 250);
    show(head()
      + `<div class='imf'><b>${esc(S.file.name)}</b><span class='lab'>${res.length} baris diperiksa</span></div>`
      + `<div class='ims' aria-label='Ringkasan'><span class='ibd new'>${c.new} baru</span>${spec.dup || c.update ? `<span class='ibd update'>${c.update} diperbarui</span>` : ''}<span class='ibd skip'>${c.skip} dilewati</span><span class='ibd error'>${c.error} bermasalah</span>${warns ? `<span class='ibd warn'>${warns} catatan</span>` : ''}</div>`
      + (res.length ? `<div class='ipl' role='list'>${list.map(o => `<div class='ipr' role='listitem'><span class='mu'>#${o.n}</span><span class='ibd ${o.st}'>${BD[o.st]}</span><span class='ipm'>${esc(o.label || (o.raw && o.raw.row ? o.raw.row.filter(Boolean).slice(0, 3).map(T).join(' · ') : ''))}${o.msg ? `<small class='${o.st == 'error' ? 'er' : 'mu'}'>${esc(o.msg)}</small>` : ''}${o.warn && o.warn.length ? `<small class='wn'>${esc(o.warn.join('; '))}</small>` : ''}</span></div>`).join('')}${res.length > list.length ? `<div class='ipr'><span></span><span></span><span class='mu'>…dan ${res.length - list.length} baris lainnya</span></div>` : ''}</div>` : `<div class='empty'>Tidak ada baris data yang bisa dibaca. Periksa pemetaan kolom.</div>`)
      + `<div class='acts'><button type='button' id='imb'>Kembali</button>${c.error ? `<button type='button' id='imc'>Unduh laporan masalah</button>` : ''}<span class='sp'></span><button id='imx' type='button'>Batal</button><button type='button' class='p' id='imo' ${ok ? '' : 'disabled'}>Impor ${ok} baris</button></div>`);
    const d = dlgEl(); d.querySelector('#imb').onclick = () => stepMap();
    const rc = d.querySelector('#imc'); if (rc) rc.onclick = () => csv('masalah-impor-' + S.kind, [['Baris', 'Status', 'Keterangan', 'Data asli'], ...res.filter(o => o.st == 'error').map(o => [o.n, 'Masalah', o.msg, (o.raw && o.raw.row ? o.raw.row.map(T).join(' | ') : '')])]);
    d.querySelector('#imo').onclick = commit;
  }
  function commit() {
    const spec = SPEC[S.kind], res = S.res, before = JSON.stringify(db[spec.coll]);
    let n = 0, u = 0;
    (res.order || res.filter(o => o.st == 'new')).forEach(o => { spec.add(o.rec); n++ });
    res.filter(o => o.st == 'update').forEach(o => { spec.merge(o.old, o.rec); u++ });
    const sk = res.filter(o => o.st == 'skip' || o.st == 'error').length;
    logA('Impor ' + spec.title + ' dari Excel: ' + n + ' baru' + (u ? ', ' + u + ' diperbarui' : '') + (sk ? ', ' + sk + ' dilewati' : '')); save(); go();
    const coll = spec.coll, kind = S.kind, title = spec.title;
    show(`<h3>Impor selesai</h3><div class='ims'><span class='ibd new'>${n} ditambahkan</span>${u ? `<span class='ibd update'>${u} diperbarui</span>` : ''}${sk ? `<span class='ibd skip'>${sk} dilewati</span>` : ''}</div><p class='lab'>Data ${esc(title.toLowerCase())} sudah tersimpan. Salah impor? Anda bisa mengurungkannya sekarang.</p><div class='acts'><button type='button' id='imu'>Urungkan impor</button><span class='sp'></span><button type='button' class='p' id='imx'>Selesai</button></div>`);
    dlgEl().querySelector('#imu').onclick = () => { db[coll] = JSON.parse(before); logA('Impor ' + title + ' diurungkan'); save(); go(); dlgEl().close(); toast('Impor diurungkan') };
  }

  /* =============== Template Excel (.xlsx) =============== */
  const X = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const dser = s => Math.round((Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
  function sheetXml(sh) {
    const cell = (v, r, c) => {
      const ref = colName(c) + (r + 1); if (v == null || v === '') return '';
      if (typeof v == 'object' && v.d) return `<c r="${ref}" s="2"><v>${dser(v.d)}</v></c>`;
      if (typeof v == 'number') return `<c r="${ref}" s="${sh.money && sh.money.includes(c) ? 3 : 0}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${r == 0 && sh.header !== false ? 1 : sh.wrap ? 4 : 0}"><is><t xml:space="preserve">${X(v)}</t></is></c>`;
    };
    const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${sh.colStyle && sh.colStyle[i] != null ? ` style="${sh.colStyle[i]}"` : ''}/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${sh.header !== false ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sh.rows.map((r, ri) => `<row r="${ri + 1}"${ri == 0 && sh.header !== false ? ' ht="24" customHeight="1"' : ''}>${r.map((v, ci) => cell(v, ri, ci)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  }
  function makeXlsx(sheets) {
    const u = s => fflate.strToU8(s), H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', NS = 'http://schemas.openxmlformats.org/', f = {};
    f['[Content_Types].xml'] = u(H + `<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    f['_rels/.rels'] = u(H + `<Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${NS}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    f['xl/workbook.xml'] = u(H + `<workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
    f['xl/_rels/workbook.xml.rels'] = u(H + `<Relationships xmlns="${NS}package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    f['xl/styles.xml'] = u(H + `<styleSheet xmlns="${NS}spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A7571"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
    sheets.forEach((s, i) => { f['xl/worksheets/sheet' + (i + 1) + '.xml'] = u(sheetXml(s)) });
    return fflate.zipSync(f);
  }
  function tplSheets(kind) {
    const sis = db.siswa.slice().sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama));
    const T5 = 5, D2 = 2;   // gaya kolom: teks (@) dan tanggal
    const P = (rows) => ({ name: 'Petunjuk', rows, widths: [26, 90], header: false, wrap: true });
    const dummy = new Date().getFullYear();
    if (kind == 'siswa') return [
      { name: 'Data Siswa', rows: [['Nama Lengkap', 'NIS', 'Kelas', 'NISN', 'Jenis Kelamin', 'Tempat Lahir', 'Tanggal Lahir', 'Agama', 'Golongan Darah', 'Alamat', 'No HP Wali', 'Nama Ayah', 'Nama Ibu', 'Nama Wali', 'Pekerjaan Orang Tua', 'Hobi', 'Cita-cita', 'Tanggal Masuk', 'Target Tabungan']], widths: [26, 14, 9, 14, 16, 16, 15, 12, 14, 34, 16, 20, 20, 20, 20, 14, 14, 15, 16], colStyle: { 1: T5, 3: T5, 10: T5, 6: D2, 17: D2 } },
      P([['Kolom', 'Penjelasan'], ['Nama Lengkap*, NIS*, Kelas*', 'Wajib diisi. NIS harus unik. Jika NIS sudah ada di aplikasi, data siswa tersebut diperbarui (atau dilewati, sesuai pilihan saat impor). Kolom kosong tidak menghapus data yang sudah ada.'], ['NIS, NISN, No HP', 'Kolom ini sudah berformat Teks agar angka 0 di depan tidak hilang. Jangan ubah format kolomnya.'], ['Jenis Kelamin', 'L / P, atau Laki-laki / Perempuan.'], ['Tanggal Lahir, Tanggal Masuk', 'Format tanggal Excel, atau tulis 2014-05-21 atau 21/05/2014.'], ['Agama, Golongan Darah', 'Agama: Islam, Kristen, Katolik, Hindu, Buddha, Konghucu. Golongan darah: A, B, AB, O.'], ['Target Tabungan', 'Angka rupiah, misal 500000.'], ['Contoh baris', 'Aditya Pratama | 2024101 | 5A | | L | Surabaya | 21/05/2014 | Islam | O | Jl. Melati 3 | 081234567890'], ['Catatan', 'Hapus baris contoh bila ada. Hanya lembar pertama ("Data Siswa") yang dibaca.']])];
    if (kind == 'tab') return [
      { name: 'Transaksi', rows: [['NIS', 'Nama', 'Tanggal', 'Jenis', 'Jumlah', 'Catatan']], widths: [14, 28, 14, 12, 14, 30], colStyle: { 0: T5, 2: D2 } },
      { name: 'Daftar Siswa', rows: [['NIS', 'Nama', 'Kelas'], ...sis.map(s => [String(s.nis), s.nama, s.kelas])], widths: [14, 30, 10], colStyle: { 0: T5 } },
      P([['Kolom', 'Penjelasan'], ['NIS atau Nama', 'Isi salah satu untuk menunjuk siswa (NIS lebih diutamakan). Nama harus sama dengan data di aplikasi. Lihat lembar "Daftar Siswa".'], ['Tanggal*', 'Format tanggal Excel, atau 2026-03-05 / 05/03/2026.'], ['Jenis', 'Setor atau Tarik.'], ['Jumlah', 'Angka rupiah, misal 20000. Penarikan tidak boleh melebihi saldo.'], ['Alternatif', 'Boleh memakai dua kolom terpisah bernama "Setoran" dan "Penarikan" sebagai pengganti Jenis + Jumlah.'], ['Impor ulang', 'Baris yang sama persis dengan transaksi yang sudah ada dilewati, sehingga aman diimpor dua kali.']])];
    if (kind == 'iuran') {
      const mg = wkOf(today());
      return [
        { name: 'Iuran mingguan', rows: [['NIS', 'Nama', 'Kelas', 'Minggu', 'Jumlah', 'Tanggal Bayar', 'Catatan'], ...sis.map(s => [String(s.nis), s.nama, s.kelas, mg, '', '', ''])], widths: [14, 28, 9, 14, 12, 14, 24], colStyle: { 0: T5 } },
        P([['Kolom', 'Penjelasan'], ['Format', 'Satu baris per pembayaran per minggu. Daftar siswa sudah terisi dari aplikasi; hapus baris siswa yang tidak membayar.'], ['Minggu', 'Tanggal mana saja di minggu yang dibayar (Senin sampai Minggu), misal 2026-11-09. Bila kosong, minggu diambil dari Tanggal Bayar.'], ['Jumlah', 'Nominal rupiah. Kosong = iuran per minggu di Pengaturan.'], ['Tanggal Bayar', 'Tanggal uang diterima. Bila kosong, memakai tanggal minggu.'], ['Kas Kelas', 'Setiap pembayaran yang diimpor otomatis tercatat sebagai pemasukan di Kas Kelas.'], ['Impor ulang', 'Pembayaran minggu yang sudah tercatat dilewati atau diperbarui sesuai pilihan saat impor.']])];
    }
    if (kind == 'absensi') return [
      { name: 'Absensi', rows: [['NIS', 'Nama', 'Kelas', 'Tanggal', 'Status'], ...sis.map(s => [String(s.nis), s.nama, s.kelas, { d: today() }, ''])], widths: [14, 28, 9, 14, 10], colStyle: { 0: T5, 3: D2 } },
      P([['Kolom', 'Penjelasan'], ['Status', 'H = Hadir, S = Sakit, I = Izin, A = Alpa (boleh ditulis lengkap). Baris dengan status kosong dilewati.'], ['Tanggal', 'Ubah tanggal sesuai hari absensi. Satu siswa hanya punya satu status per hari.'], ['Alternatif', 'Format matriks juga didukung: satu baris per siswa dan kolom berjudul tanggal (misal 03/03/2026), isi sel H/S/I/A.']])];
    if (kind == 'kas') return [
      { name: 'Kas Kelas', rows: [['Tanggal', 'Pemasukan', 'Pengeluaran', 'Keterangan']], widths: [14, 16, 16, 40], colStyle: { 0: D2 } },
      P([['Kolom', 'Penjelasan'], ['Pemasukan / Pengeluaran', 'Isi angka rupiah pada salah satu kolom. Satu baris boleh memuat keduanya (dicatat sebagai dua transaksi).'], ['Alternatif', 'Boleh memakai kolom Jenis (Masuk/Keluar) + Jumlah.'], ['Impor ulang', 'Baris yang sama persis dengan catatan yang sudah ada dilewati.']])];
    if (kind == 'agenda') return [
      { name: 'Agenda', rows: [['Tanggal', 'Judul', 'Keterangan']], widths: [14, 34, 44], colStyle: { 0: D2 } },
      P([['Kolom', 'Penjelasan'], ['Tanggal*, Judul*', 'Wajib diisi. Agenda dengan tanggal dan judul yang sama dianggap sudah ada.']])];
    return [
      { name: 'Pengumuman', rows: [['Tanggal', 'Judul', 'Isi']], widths: [14, 34, 60], colStyle: { 0: D2 } },
      P([['Kolom', 'Penjelasan'], ['Judul*', 'Wajib diisi. Tanggal kosong memakai hari ini.']])];
  }
  function download(name, u8) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }

  /* =============== API publik =============== */
  window.IMP = {
    open(kind) {
      if (!SPEC[kind]) return; if (!Data.canWrite()) return toast('Anda tidak punya izin untuk mengimpor data');
      if (typeof fflate == 'undefined') return toast('Pustaka impor belum termuat. Muat ulang halaman.');
      S = { kind, dup: 'update', year: (typeof IY != 'undefined' && IY) || new Date().getFullYear() }; stepPick();
    },
    tpl(kind) { download(SPEC[kind].tplName + '.xlsx', makeXlsx(tplSheets(kind))) },
    _t: { readXlsx, parseCsv, parseDateStr, numOf, monthOf, makeXlsx, SPEC }
  };
})();
