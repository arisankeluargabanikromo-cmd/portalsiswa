/* SekolahHub: Kartu ID siswa (tab "Kartu ID" di halaman Data Siswa).
   Dimuat setelah app.js. Memakai global dari app.js: db, Data, Brand, V, A, $, esc, empty, kfs, Q, KF, T, go, toast, logA, save, ico, avc.
   Isi file ini:
     1. QR      : pembuat kode QR kecil (mode byte, koreksi M, versi 1-6) tanpa pustaka luar
     2. Kartu   : tampilan depan dan belakang (ukuran CR80, potret atau lanskap)
     3. Galeri  : tab Kartu ID (cari, saring, pilih, pratinjau)
     4. Cetak   : lembar A4 (potong manual, bolak-balik sudah dicerminkan) atau printer kartu CR80
   Tidak butuh migrasi database. Pilihan tampilan disimpan per perangkat (localStorage 'sh.idcard'). */
(() => {
  'use strict';

  /* ================= 1. QR ================= */
  /*QR-START*/
  const QR = (() => {
    const EXP = [], LOG = [];
    for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x > 255) x ^= 0x11d }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
    // versi: [kata kode data, kata kode koreksi per blok, jumlah blok] untuk tingkat koreksi M
    const VER = { 1: [16, 10, 1], 2: [28, 16, 1], 3: [44, 26, 1], 4: [64, 18, 2], 5: [86, 24, 2], 6: [108, 16, 4] };
    const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
    const MASK = [
      (x, y) => (x + y) % 2 == 0, (x, y) => y % 2 == 0, (x, y) => x % 3 == 0, (x, y) => (x + y) % 3 == 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 == 0, (x, y) => x * y % 2 + x * y % 3 == 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 == 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 == 0];

    function gen(n) {
      let p = [1];
      for (let i = 0; i < n; i++) { const q = new Array(p.length + 1).fill(0); p.forEach((c, j) => { q[j] ^= c; q[j + 1] ^= mul(c, EXP[i]) }); p = q }
      return p;
    }
    function ecc(data, n) {
      const g = gen(n), r = new Array(n).fill(0);
      for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f) }
      return r;
    }

    function make(text) {
      const bytes = [...new TextEncoder().encode(String(text))];
      let v = 0;
      for (const k of [1, 2, 3, 4, 5, 6]) if (bytes.length <= VER[k][0] - 2) { v = k; break }
      if (!v) return null;
      const [dc, ec, nb] = VER[v], size = 17 + 4 * v;

      // 1) aliran bit: mode byte, panjang, data, terminator, pengisi
      const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1) };
      put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
      put(0, Math.min(4, dc * 8 - bits.length));
      while (bits.length % 8) bits.push(0);
      const cw = [];
      for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
      for (let p = 0xEC; cw.length < dc; p ^= 0xEC ^ 0x11) cw.push(p);

      // 2) blok, koreksi kesalahan Reed-Solomon, penyisipan
      const per = dc / nb, blocks = [], eccs = [];
      for (let i = 0; i < nb; i++) { const d = cw.slice(i * per, (i + 1) * per); blocks.push(d); eccs.push(ecc(d, ec)) }
      const all = [];
      for (let i = 0; i < per; i++) blocks.forEach(b => all.push(b[i]));
      for (let i = 0; i < ec; i++) eccs.forEach(b => all.push(b[i]));

      // 3) pola fungsi
      const m = Array.from({ length: size }, () => new Array(size).fill(false));
      const fn = Array.from({ length: size }, () => new Array(size).fill(false));
      const set = (x, y, d) => { m[y][x] = !!d; fn[y][x] = true };
      for (let i = 0; i < size; i++) { set(6, i, i % 2 == 0); set(i, 6, i % 2 == 0) }
      const finder = (cx, cy) => {
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d != 2 && d != 4) }
        }
      };
      finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
      const al = ALIGN[v];
      al.forEach((cx, i) => al.forEach((cy, j) => {
        if ((i == 0 && j == 0) || (i == 0 && j == al.length - 1) || (i == al.length - 1 && j == 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
      }));
      const fmt = mask => {
        let r = mask;
        for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >> 9) * 0x537);
        const b = ((mask << 10) | r) ^ 0x5412, g = i => (b >> i) & 1;
        for (let i = 0; i <= 5; i++) set(8, i, g(i));
        set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
        for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
        for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
        for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
        set(8, size - 8, true);
      };
      fmt(0);

      // 4) tempatkan data (zig-zag dari kanan bawah)
      let k = 0;
      for (let r = size - 1; r >= 1; r -= 2) {
        if (r == 6) r = 5;
        for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
          const x = r - j, up = ((r + 1) & 2) == 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && k < all.length * 8) { m[y][x] = ((all[k >> 3] >> (7 - (k & 7))) & 1) == 1; k++ }
        }
      }

      // 5) pilih topeng dengan penalti terendah
      const apply = mk => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASK[mk](x, y)) m[y][x] = !m[y][x] };
      const penalty = () => {
        let p = 0, dark = 0;
        for (let a = 0; a < 2; a++) for (let i = 0; i < size; i++) {
          let run = 1, s = '';
          for (let j = 0; j < size; j++) {
            const c = a ? m[j][i] : m[i][j]; s += c ? '1' : '0';
            if (j && c == (a ? m[j - 1][i] : m[i][j - 1])) { run++; if (run == 5) p += 3; else if (run > 5) p++ } else run = 1;
          }
          p += 40 * (s.match(/(?=10111010000|00001011101)/g) || []).length;
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          if (m[y][x]) dark++;
          if (x < size - 1 && y < size - 1 && m[y][x] == m[y][x + 1] && m[y][x] == m[y + 1][x] && m[y][x] == m[y + 1][x + 1]) p += 3;
        }
        return p + (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
      };
      let best = 0, bs = Infinity;
      for (let mk = 0; mk < 8; mk++) { apply(mk); fmt(mk); const s = penalty(); if (s < bs) { bs = s; best = mk } apply(mk) }
      apply(best); fmt(best);
      return { n: size, get: (x, y) => m[y][x] };
    }

    // SVG satu <path> (baris gelap digabung per larik). q = zona tenang dalam modul
    function svg(text, q = 2) {
      const o = make(text); if (!o) return '';
      const n = o.n, t = n + 2 * q; let d = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n;) {
        if (o.get(x, y)) { let l = 1; while (x + l < n && o.get(x + l, y)) l++; d += `M${x + q} ${y + q}h${l}v1h-${l}z`; x += l } else x++;
      }
      return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="Kode QR berisi NIS"><path d="${d}" fill="#000"/></svg>`;
    }
    return { make, svg };
  })();
  /*QR-END*/

  /*C128-START*/
  /* Code 128 (set B, dan set C untuk NIS angka agar lebih rapat). Keluaran: SVG satu path, tinggi 1 satuan */
  const C128 = (() => {
    const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
      + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
      + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
      + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
      + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
      + '114131 311141 411131 211412 211214 211232 2331112').split(' ');
    function codes(text) {
      const t = String(text), out = [];
      if (/^\d{2,}$/.test(t)) {
        let i = 0;
        if (t.length % 2) { out.push(104, t.charCodeAt(0) - 32, 99); i = 1 } else out.push(105);
        for (; i < t.length; i += 2) out.push(+t.slice(i, i + 2));
      } else {
        out.push(104);
        for (const ch of t) { const c = ch.charCodeAt(0); out.push(c >= 32 && c <= 126 ? c - 32 : 31) }
      }
      let sum = out[0]; for (let i = 1; i < out.length; i++) sum += out[i] * i;
      out.push(sum % 103, 106);
      return out;
    }
    function svg(text, q = 10) {
      if (!String(text || '').trim()) return '';
      let x = q, d = '';
      codes(text).forEach(c => { const p = P[c]; for (let i = 0; i < p.length; i++) { const w = +p[i]; if (i % 2 == 0) d += `M${x} 0h${w}v1h-${w}z`; x += w } });
      return `<svg viewBox="0 0 ${x + q} 1" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode NIS"><path d="${d}" fill="#000"/></svg>`;
    }
    return { codes, svg, P };
  })();
  /*C128-END*/

  /* ================= 2. Pilihan & kartu ================= */
  // Warna kartu = media cetak fisik, jadi sengaja tetap (tidak mengikuti tema terang/gelap aplikasi).
  // g1 -> g2 -> g3: gradien (awal terang, tengah gelap, akhir cerah), rg: cincin foto dan garis gelombang
  const TEMA = {
    teal: { n: 'Teal', g1: '#4fd8a4', g2: '#0a3560', g3: '#10b5b5', rg: '#2d8678' },
    biru: { n: 'Biru', g1: '#5bb8ff', g2: '#0b2c66', g3: '#2f8be0', rg: '#2b6cb0' },
    merah: { n: 'Merah', g1: '#ff8f7d', g2: '#5e1220', g3: '#d2475a', rg: '#a23444' },
    hijau: { n: 'Hijau', g1: '#8be38f', g2: '#0c4a2b', g3: '#2fae6a', rg: '#2a7a4b' },
    ungu: { n: 'Ungu', g1: '#a99bff', g2: '#2a1a6b', g3: '#7b64e0', rg: '#4b3aa8' },
    oranye: { n: 'Oranye', g1: '#ffc15e', g2: '#6b2d03', g3: '#ee8a1d', rg: '#b3561a' }
  };
  const LS = 'sh.idcard3', DEF = { warna: 'teal', ori: 'lan', tampak: 'depan', alamat: 1, wali: 1, mode: 'a4', sisi: 'duplex' };
  const O = Object.assign({}, DEF);
  try { Object.assign(O, JSON.parse(localStorage.getItem(LS) || '{}')) } catch (e) { }
  if (!TEMA[O.warna]) O.warna = DEF.warna;
  if (!['por', 'lan'].includes(O.ori)) O.ori = DEF.ori;
  if (!['depan', 'belakang'].includes(O.tampak)) O.tampak = DEF.tampak;
  if (!['a4', 'cr80'].includes(O.mode)) O.mode = DEF.mode;
  if (!['duplex', 'depan', 'belakang'].includes(O.sisi)) O.sisi = DEF.sisi;
  const keep = () => { try { localStorage.setItem(LS, JSON.stringify(O)) } catch (e) { } };

  let SW = 'daftar';          // tab aktif di Data Siswa
  let PF = '';                // saring: '' semua, 'tanpa' = belum ada foto
  const SEL = new Set();      // id siswa terpilih

  const hasFoto = s => !!Data.url(s.foto);
  const byName = (a, b) => String(a.kelas).localeCompare(String(b.kelas), 'id', { numeric: true }) || String(a.nama).localeCompare(String(b.nama), 'id');
  const find = id => db.siswa.find(s => s.id == id);
  const visible = () => {
    const q = String(Q || '').toLowerCase();
    return db.siswa.filter(s => (s.nama + s.nis + s.kelas).toLowerCase().includes(q) && (!KF || s.kelas == KF) && (PF != 'tanpa' || !hasFoto(s))).sort(byName);
  };
  const chosen = () => db.siswa.filter(s => SEL.has(s.id)).sort(byName);
  const tgl = d => d ? new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const tier = (t, a, b, c) => { const n = String(t || '').length; return n > c ? 'ic-t4' : n > b ? 'ic-t3' : n > a ? 'ic-t2' : 'ic-t1' };
  const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 17l20 9-20 9-20-9z"/><path d="M20 34v8c0 3 6 6 12 6s12-3 12-6v-8l-12 5.5z"/><path d="M52 26v14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
  const logo = () => { const u = Brand.url(); return u ? `<img src="${esc(u)}" alt="" onerror="IDC.bad(this)">` : MARK };
  const style = () => { const t = TEMA[O.warna]; return `--g1:${t.g1};--g2:${t.g2};--g3:${t.g3};--rg:${t.rg}` };
  const tglS = d => d ? new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  // garis gelombang dekoratif (seperti contoh) di area putih kartu
  const WAVES = (() => {
    let d = '';
    for (let k = 0; k < 14; k++) { const y = 3 + k * 2.4, a = 3 + k * .45, o = k * .9; d += `<path d="M0 ${(y + 6).toFixed(1)} C ${(26 + o).toFixed(1)} ${(y - a).toFixed(1)}, ${(54 - o).toFixed(1)} ${(y + a + 8).toFixed(1)}, 84 ${(y + 3).toFixed(1)} S ${(134 + o).toFixed(1)} ${(y - a - 2).toFixed(1)}, 160 ${(y + 4).toFixed(1)}"/>` }
    return `<svg class="ic-wv" viewBox="0 0 160 44" preserveAspectRatio="none" aria-hidden="true">${d}</svg>`;
  })();
  // baris label : nilai. Baris tanpa nilai dilewati. it = [label, nilai, kelas dd opsional]
  const rows = (it, cls) => `<dl class="ic-rows ${cls || ''}">${it.filter(i => i && String(i[1] || '').trim()).map(i => `<div><dt>${i[0]}</dt><i>:</i><dd class="${i[2] || ''}">${esc(i[1])}</dd></div>`).join('')}</dl>`;
  // Tingkat ukuran huruf agar teks panjang tetap muat (teks boleh membungkus, tidak pernah dipotong)
  const sz = (t, a, b) => { const n = String(t || '').length; return n > b ? 'ic-s3' : n > a ? 'ic-s2' : '' };

  // Kop yang sama di depan dan belakang: logo, instansi induk, nama sekolah, alamat sekolah (semua rata tengah)
  function kop(extra) {
    const c = db.cfg, ins = String(c.instansi || '').trim(), sk = String(c.sekolah || '').trim(), al = String(c.alamat || '').trim();
    return `<div class="ic-hdc"><div class="ic-kopb"><span class="ic-lg">${logo()}</span><div class="ic-bn">`
      + (ins ? `<small class="${sz(ins, 34, 40)}">${esc(ins)}</small>` : '')
      + `<b class="${tier(sk, 24, 34, 50)}">${esc(sk)}</b>`
      + (al ? `<em class="${sz(al, 52, 72)}">${esc(al)}</em>` : '') + `</div></div>${extra || ''}</div>`;
  }

  // Ukuran huruf baris data depan dipilih otomatis supaya semua teks muat tanpa dipotong
  const FITC = { lan: { w: 30.6, f: 2.62, lim: 6.1 }, por: { w: 28.6, f: 2.4, lim: 5.0 } };
  function fitCls(items) {
    const g = FITC[O.ori], list = items.filter(i => i && String(i[1] || '').trim());
    for (const sc of [1, .92, .85, .78, .72]) {
      const cpl = Math.max(8, Math.floor(g.w / (g.f * sc * .6)));
      const n = list.reduce((t, i) => t + Math.max(1, Math.ceil(String(i[1]).trim().length / (i[2] && i[2].includes('ic-nm') ? cpl * .92 : cpl))), 0);
      if (n * sc <= g.lim) return 'ic-f' + Math.round(sc * 100);
    }
    return 'ic-f72';
  }

  function front(s, lazy) {
    const c = db.cfg, nm = String(s.nama || '').trim(), sk = c.sekolah || '', ta = c.tahun || '', ph = Data.url(s.foto);
    const ini = esc(nm.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?');
    const fb = `<span style="background:${avc(nm)}">${ini}</span>`;     // cadangan bila foto kosong atau gagal dimuat
    const lahir = [s.tl, tglS(s.tgl)].filter(Boolean).join(', ');
    const items = [['Nama', nm, 'ic-nm'], ['NIS', s.nis], ['Jenis Kelamin', s.jk], ['Lahir', lahir], O.alamat ? ['Alamat', s.alamat] : null];
    return `<div class="idf ic-fr">${WAVES}<div class="ic-hd"></div>${kop('<div class="ic-ttl">KARTU PELAJAR</div>')}
<div class="ic-ph">${ph ? `<img src="${esc(ph)}" alt="Foto ${esc(nm)}"${lazy ? ' loading="lazy" decoding="async"' : ''} data-fb="${encodeURIComponent(fb)}" onerror="this.outerHTML=decodeURIComponent(this.dataset.fb)">` : fb}</div>
<div class="ic-bc">${C128.svg(String(s.nis || ''), 0)}</div>
${rows(items, fitCls(items))}
<div class="ic-ft">${ta ? 'Tahun Ajaran ' + esc(ta) : esc(sk)}</div></div>`;
  }

  // Ketentuan penggunaan kartu (rata tengah, kalimat singkat)
  const KETENTUAN = ['Kartu wajib dibawa selama berada di lingkungan sekolah.', 'Kartu tidak boleh dipinjamkan atau dipindahtangankan.',
    'Bila hilang, rusak, atau ditemukan, segera hubungi atau kembalikan ke sekolah.'];

  function back(s) {
    const c = db.cfg, hp = String(s.hp || '').trim(), kn = String(c.kepsek || '').trim(), np = String(c.kepsek_nip || '').trim();
    // dua kode QR sejajar: NIS, dan WhatsApp wali (tautan wa.me dari nomor kontak wali)
    const qc = (svg, lab, val) => `<div class="ic-qc"><div class="ic-qb">${svg}</div><div class="ic-cp"><small>${lab}</small><b>${esc(val)}</b></div></div>`;
    const wn = typeof waNum == 'function' ? waNum(hp) : '', wali = !O.wali || !hp ? '' : wn ? qc(QR.svg('https://wa.me/' + wn), 'WhatsApp Wali', hp)
      : `<div class="ic-qc ic-nq"><div class="ic-cp"><small>Kontak Wali</small><b>${esc(hp)}</b></div></div>`;
    // tanda tangan: nama dan NIP kepala sekolah (bila kosong, diberi garis titik agar bisa diisi tangan)
    const sgn = `<div class="ic-sgn"><small>Kepala Sekolah,</small><i></i><b class="${sz(kn, 26, 34)}">${esc(kn || '...............................')}</b>`
      + (np ? `<span>NIP.&nbsp;${esc(np)}</span>` : kn ? '' : '<span>NIP.&nbsp;..........................</span>') + '</div>';
    return `<div class="idf ic-bk">${WAVES}<div class="ic-hd"></div>${kop()}
<div class="ic-bb">${qc(QR.svg(String(s.nis || '')), 'NIS', s.nis)}${wali}</div>
<div class="ic-fl"><div class="ic-tc"><h4>Ketentuan Penggunaan Kartu</h4>${KETENTUAN.map(t => `<p>${t}</p>`).join('')}</div>${sgn}</div>
<div class="ic-ft"></div></div>`;
  }

  const card = (s, side, lazy) => `<div class="idc ${O.ori}" style="${style()}">${side == 'belakang' ? back(s) : front(s, lazy)}</div>`;

  /* ================= 3. Galeri (tab Kartu ID) ================= */
  const swatch = k => `<button type="button" style="--c:linear-gradient(135deg,${TEMA[k].g1},${TEMA[k].g2} 55%,${TEMA[k].g3})" aria-pressed="${O.warna == k}" aria-label="Warna ${TEMA[k].n}" title="${TEMA[k].n}" onclick="IDC.set('warna','${k}')"></button>`;
  const seg = (k, items) => `<div class="idseg" role="group">${items.map(i => `<button type="button" class="${O[k] == i[0] ? 'on' : ''}" aria-pressed="${O[k] == i[0]}" onclick="IDC.set('${k}','${i[0]}')">${i[1]}</button>`).join('')}</div>`;
  const chk = (k, l) => `<label class="idck"><input type="checkbox" ${O[k] ? 'checked' : ''} onchange="IDC.set('${k}',this.checked?1:0)">${l}</label>`;
  const opts = () => `<div><span class="lab">Warna kartu</span><div class="idsw">${Object.keys(TEMA).map(swatch).join('')}</div></div>
<div><span class="lab">Orientasi</span>${seg('ori', [['por', 'Potret'], ['lan', 'Lanskap']])}</div>
<div><span class="lab">Pratinjau sisi</span>${seg('tampak', [['depan', 'Depan'], ['belakang', 'Belakang']])}</div>
<div><span class="lab">Data tambahan</span><div class="idcks">${chk('alamat', 'Alamat siswa (depan)')}${chk('wali', 'WhatsApp wali (belakang)')}</div></div>`;

  const optHead = () => `${TEMA[O.warna].n} · ${O.ori == 'por' ? 'Potret' : 'Lanskap'} · ${O.tampak == 'depan' ? 'Depan' : 'Belakang'}`;
  const tile = s => {
    const on = SEL.has(s.id), nm = esc(s.nama);
    return `<div class="idtile ${on ? 'sel' : ''}" data-id="${s.id}">
<label class="idsel" title="Pilih ${nm}"><input type="checkbox" ${on ? 'checked' : ''} onchange="IDC.toggle('${s.id}',this.checked)" aria-label="Pilih ${nm}"></label>
<button type="button" class="idprev" onclick="IDC.one('${s.id}')" aria-label="Pratinjau kartu ${nm}">${card(s, O.tampak, true)}</button>
<div class="idcap"><b>${nm}</b><span>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)}</span>${hasFoto(s) ? '' : '<span class="tag idwt">Belum ada foto</span>'}</div></div>`;
  };

  const infoHTML = () => {
    const nf = db.siswa.filter(s => !hasFoto(s)).length, ns = chosen().length;
    return `<p class="lab idinfo">${visible().length} kartu ditampilkan · ${nf ? `<b>${nf} siswa belum punya foto</b>` : 'semua siswa sudah berfoto'}${ns ? ` · <b class="idpick">${ns} dipilih</b> <button type="button" class="idlink" onclick="IDC.kosong()">Kosongkan</button>` : ''}</p>`;
  };
  function gal() {
    if (!db.siswa.length) return empty('Belum ada siswa. Tambahkan siswa di tab Daftar siswa.');
    const l = visible();
    return infoHTML() + (l.length ? `<div class="idg ${O.ori}">${l.map(tile).join('')}</div>` : empty('Tidak ada siswa yang cocok dengan pencarian atau saringan.'));
  }
  // dipakai sebagai T (global app.js) agar kolom cari dan saringan kelas bawaan ikut menyegarkan galeri
  const draw = () => { const h = gal(); setTimeout(upd, 0); return h };

  function upd() {
    const b = $('#idpb'); if (!b) return;
    const n = SEL.size ? chosen().length : visible().length;
    b.textContent = SEL.size ? `Cetak terpilih (${n})` : `Cetak semua (${n})`; b.disabled = !n;
    const a = $('#idsa'); if (a) { const v = visible(); a.textContent = v.length && v.every(s => SEL.has(s.id)) ? 'Batal pilih' : 'Pilih semua' }
  }
  const refresh = () => { const g = $('#tb'); if (g) g.innerHTML = T() };

  /* ================= 4. Cetak ================= */
  const PER = { por: [3, 3], lan: [2, 5] };        // kolom x baris per lembar A4
  const FMT = { por: '54mm 85.6mm', lan: '85.6mm 54mm' };

  function pagesHTML(list, mode, sisi) {
    const faces = side => s => `<div class="ic-pc">${card(s, side)}</div>`;
    if (mode == 'cr80') {
      return list.map(s => (sisi != 'belakang' ? `<section class="ic-pg ic-cr ${O.ori}">${card(s, 'depan')}</section>` : '')
        + (sisi != 'depan' ? `<section class="ic-pg ic-cr ${O.ori}">${card(s, 'belakang')}</section>` : '')).join('');
    }
    const [cols, rows] = PER[O.ori], per = cols * rows; let h = '';
    const sheet = (chunk, side) => {
      const cells = [];
      for (let r = 0; r < rows; r++) {
        const rw = chunk.slice(r * cols, (r + 1) * cols); while (rw.length < cols) rw.push(null);
        if (side == 'belakang') rw.reverse();             // cermin: sisi belakang pas saat kertas dibalik di sisi panjang
        cells.push(...rw);
      }
      return `<section class="ic-pg ic-a4 ${O.ori}" style="--cols:${cols}"><div class="ic-gr">${cells.map(s => s ? faces(side)(s) : '<div class="ic-pc ic-ev"></div>').join('')}</div></section>`;
    };
    for (let i = 0; i < list.length; i += per) {
      const chunk = list.slice(i, i + per);
      if (sisi != 'belakang') h += sheet(chunk, 'depan');
      if (sisi != 'depan') h += sheet(chunk, 'belakang');
    }
    return h;
  }
  const jumlah = (n, mode, sisi) => {
    const sd = sisi == 'duplex' ? 2 : 1;
    if (mode == 'cr80') return `${n * sd} halaman ukuran kartu (${n} kartu)`;
    const per = PER[O.ori][0] * PER[O.ori][1], sheets = Math.ceil(n / per);
    return `${sheets} lembar A4, ${sheets * sd} halaman (${per} kartu per lembar)`;
  };

  async function doPrint(list, mode, sisi) {
    let st = $('#idpg'); if (!st) { st = document.createElement('style'); st.id = 'idpg'; document.head.appendChild(st) }
    st.textContent = `@page{size:${mode == 'cr80' ? FMT[O.ori] : 'A4 portrait'};margin:0}`;
    let h = $('#idprint'); if (!h) { h = document.createElement('div'); h.id = 'idprint'; document.body.appendChild(h) }
    h.innerHTML = pagesHTML(list, mode, sisi); h.dataset.mode = mode;
    document.body.classList.add('idp');
    const imgs = [...h.querySelectorAll('img')].map(i => i.decode ? i.decode().catch(() => { }) : Promise.resolve());
    await Promise.race([Promise.all(imgs), new Promise(r => setTimeout(r, 4000))]);
    const done = () => { document.body.classList.remove('idp'); h.innerHTML = ''; st.textContent = '' };
    addEventListener('afterprint', done, { once: true });
    print();
  }

  /* ================= API publik ================= */
  window.IDC = { QR,
    on: () => SW == 'kartu',
    tabs(a) {
      const ic = ico(`<rect x='3' y='5' width='18' height='14' rx='2.5'/><circle cx='9' cy='11' r='2'/><path d='M14 10h4M14 14h4M6 16.5c.6-1.5 1.6-2.2 3-2.2s2.4.7 3 2.2'/>`);
      return `<div class="idtabs" role="tablist" aria-label="Tampilan data siswa">${[['daftar', 'Daftar siswa', ''], ['kartu', 'Kartu ID', ic]].map(t => `<button type="button" role="tab" aria-selected="${t[0] == a}" class="${t[0] == a ? 'on' : ''}" onclick="IDC.tab('${t[0]}')">${t[2]}${t[1]}</button>`).join('')}</div>`;
    },
    tab(t) { SW = t; go() },
    view() {
      T = draw;
      return `<h2>Data Siswa</h2><p class="sub">Kartu pelajar berfoto dan beridentitas, siap dicetak untuk seluruh siswa atau per kelas.</p>${IDC.tabs('kartu')}
<div class="bar"><input type="search" placeholder="Cari nama, NIS, atau kelas" value="${esc(Q)}" aria-label="Cari siswa" oninput="Q=this.value;$('#tb').innerHTML=T()">${kfs()}<select aria-label="Saring foto" onchange="IDC.pf(this.value)"><option value="">Semua siswa</option><option value="tanpa" ${PF == 'tanpa' ? 'selected' : ''}>Belum ada foto</option></select><span class="sp"></span><button type="button" id="idsa" onclick="IDC.pilih()">Pilih semua</button><button type="button" class="idpp" id="idpb" onclick="IDC.cetak()">Cetak</button></div>
<details class="card idopt" id="idopt" ${innerWidth > 860 ? 'open' : ''}><summary>Tampilan kartu<span class="lab" id="idoh">${optHead()}</span></summary><div class="idob" id="idob">${opts()}</div></details><div id="tb">${draw()}</div>`;
    },
    set(k, v) { O[k] = v; keep(); $('#idob').innerHTML = opts(); $('#idoh').textContent = optHead(); refresh() },
    pf(v) { PF = v; refresh() },
    toggle(id, on) {
      on ? SEL.add(id) : SEL.delete(id);
      const t = document.querySelector(`.idtile[data-id="${id}"]`); if (t) t.classList.toggle('sel', on);
      const i = $('.idinfo'); if (i) i.outerHTML = infoHTML();
      upd();
    },
    pilih() {
      const v = visible(), all = v.length && v.every(s => SEL.has(s.id));
      v.forEach(s => all ? SEL.delete(s.id) : SEL.add(s.id)); refresh();
    },
    kosong() { SEL.clear(); refresh() },
    bad(el) { el.outerHTML = MARK },

    // Kartu satu siswa untuk Beranda akun Siswa: SELALU lanskap, tanpa mengubah pilihan tampilan galeri (O.ori) di perangkat ini.
    hero(id, side) {
      const s = find(id); if (!s) return '';
      const prev = O.ori; O.ori = 'lan';
      try { return card(s, side == 'belakang' ? 'belakang' : 'depan') } finally { O.ori = prev }
    },

    // Pratinjau kartu sendiri untuk akun Siswa: depan dan belakang, lanskap, hanya tombol Tutup
    lihat(id) {
      const s = find(id); if (!s) return;
      const d = $('#dlg');
      d.innerHTML = `<h3>Kartu Pelajar · ${esc(s.nama)}</h3>
<div class="idpair lan"><figure><div class="idc-w">${IDC.hero(id, 'depan')}</div><figcaption>Depan</figcaption></figure><figure><div class="idc-w">${IDC.hero(id, 'belakang')}</div><figcaption>Belakang</figcaption></figure></div>
<div class="acts idacts"><button type="button" id="x" class="idx">Tutup</button></div>`;
      d.classList.add('idd'); d.showModal();
      d.addEventListener('close', () => d.classList.remove('idd'), { once: true });
      $('#x').onclick = () => d.close();
    },

    // Pratinjau satu siswa (depan dan belakang)
    one(id) {
      const s = find(id); if (!s) return;
      const d = $('#dlg'), ok = hasFoto(s);
      d.innerHTML = `<h3>Kartu ID · ${esc(s.nama)}</h3>${ok ? '' : `<p class="idwarn">Siswa ini belum punya foto. Tambahkan foto agar kartu lengkap.</p>`}
<div class="idpair ${O.ori}"><figure><div class="idc-w">${card(s, 'depan')}</div><figcaption>Depan</figcaption></figure><figure><div class="idc-w">${card(s, 'belakang')}</div><figcaption>Belakang</figcaption></figure></div>
<div class="acts idacts"><button type="button" id="x" class="idx">Tutup</button><a class="btn w" href="#ubah-${s.id}" id="idu">Ubah data</a><button type="button" class="w" id="idf">${ok ? 'Ganti foto' : 'Tambah foto'}</button><button type="button" class="p w" id="idc">Cetak kartu</button></div>`;
      d.classList.add('idd'); d.showModal();
      d.addEventListener('close', () => d.classList.remove('idd'), { once: true });
      $('#x').onclick = () => d.close();
      $('#idu').onclick = () => d.close();
      $('#idf').onclick = () => { d.close(); A.foto(s.id, 'foto') };
      $('#idc').onclick = () => { d.close(); IDC.cetak([s.id]) };
    },

    // Dialog cetak
    cetak(ids) {
      if (!Data.canWrite()) return;
      const src = ids ? ids.map(find).filter(Boolean).sort(byName) : (SEL.size ? chosen() : visible());
      if (!src.length) return toast('Belum ada kartu untuk dicetak');
      const tanpa = src.filter(s => !hasFoto(s)), d = $('#dlg');
      d.innerHTML = `<h3>Cetak kartu ID</h3><p class="lab">${src.length} siswa · ${src.length == 1 ? esc(src[0].nama) : (KF && !SEL.size ? 'Kelas ' + esc(KF) : 'urut kelas dan nama')}</p>
${tanpa.length ? `<div class="idwarn"><b>${tanpa.length} siswa belum punya foto</b> (${esc(tanpa.slice(0, 3).map(s => s.nama).join(', '))}${tanpa.length > 3 ? ', dan lainnya' : ''}).<label class="idck"><input type="checkbox" id="idk" checked>Lewati siswa tanpa foto</label></div>` : ''}
<label>Media cetak<select id="idm"><option value="a4" ${O.mode == 'a4' ? 'selected' : ''}>Kertas A4 (potong manual)</option><option value="cr80" ${O.mode == 'cr80' ? 'selected' : ''}>Printer kartu PVC (CR80)</option></select></label>
<label>Sisi yang dicetak<select id="ids"><option value="duplex" ${O.sisi == 'duplex' ? 'selected' : ''}>Depan dan belakang (bolak-balik)</option><option value="depan" ${O.sisi == 'depan' ? 'selected' : ''}>Depan saja</option><option value="belakang" ${O.sisi == 'belakang' ? 'selected' : ''}>Belakang saja</option></select></label>
<p class="idsum" id="idsm"></p>
<ul class="idtips"><li>Di jendela cetak pilih skala <b>100%</b> (bukan "Sesuaikan ke halaman"), margin <b>Tidak ada</b>, dan aktifkan <b>Grafik latar belakang</b>.</li><li>Cetak bolak-balik: pilih <b>dua sisi</b>, balik pada <b>sisi panjang</b>. Sisi belakang sudah dicerminkan agar pas.</li></ul>
<div class="acts"><button type="button" id="x">Batal</button><button type="button" class="p" id="ok">Cetak</button></div>`;
      d.showModal();
      const val = () => ({ mode: $('#idm').value, sisi: $('#ids').value, skip: !!($('#idk') && $('#idk').checked) });
      const sum = () => { const v = val(), n = v.skip ? src.length - tanpa.length : src.length; $('#idsm').textContent = n ? 'Hasil: ' + jumlah(n, v.mode, v.sisi) + '.' : 'Tidak ada kartu yang bisa dicetak.' };
      ['idm', 'ids', 'idk'].forEach(i => { const e = $('#' + i); if (e) e.onchange = sum });
      sum();
      $('#x').onclick = () => d.close();
      $('#ok').onclick = () => {
        const v = val(), list = v.skip ? src.filter(hasFoto) : src;
        if (!list.length) return toast('Tidak ada kartu yang bisa dicetak');
        O.mode = v.mode; O.sisi = v.sisi; keep(); d.close();
        logA('Cetak kartu ID: ' + list.length + ' siswa' + (list.length == 1 ? ' · ' + list[0].nama : '')); save();
        doPrint(list, v.mode, v.sisi);
      };
    }
  };

  // Keluar dari halaman Data Siswa = kembali ke tab Daftar saat dibuka lagi
  addEventListener('hashchange', () => { if (location.hash.slice(1) != 'siswa') { SW = 'daftar'; PF = '' } });
})();
