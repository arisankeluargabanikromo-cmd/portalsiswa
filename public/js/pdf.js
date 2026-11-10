/* SekolahHub v2.18: penulis PDF minimal (tanpa pustaka luar).
 * Mendukung: halaman bertingkat, teks (Helvetica / Bold / Oblique, encoding WinAnsi), persegi, garis, rotasi teks, dan matriks QR sebagai vektor.
 * Koordinat memakai titik (pt) dengan ORIGIN KIRI-ATAS (y ke bawah); dikonversi ke sistem PDF di sini.
 * Sengaja kecil dan deterministik: cukup untuk kuitansi dan dokumen satu-dua halaman. Bukan pengganti pustaka PDF umum.
 */
(() => {
  'use strict';
  // Lebar glyph Helvetica / Helvetica-Bold (AFM standar, satuan 1/1000 em) untuk ASCII 32..126
  const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  // Karakter di luar ASCII yang ada di WinAnsi (kode byte) dan lebarnya (reguler, tebal)
  const WIN = { '·': [0xB7, 278, 278], '–': [0x96, 556, 556], '—': [0x97, 1000, 1000], '‘': [0x91, 222, 278], '’': [0x92, 222, 278], '“': [0x93, 333, 500], '”': [0x94, 333, 500], '•': [0x95, 350, 350], '…': [0x85, 1000, 1000], '©': [0xA9, 737, 737] };
  const FONTS = { r: 'Helvetica', b: 'Helvetica-Bold', i: 'Helvetica-Oblique' };

  // Satu karakter -> [kode byte, lebar]
  function glyph(ch, bold) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return [c, (bold ? WB : WR)[c - 32]];
    if (WIN[ch]) return [WIN[ch][0], WIN[ch][bold ? 2 : 1]];
    if (c >= 0xA0 && c <= 0xFF) return [c, 556];
    if (ch === '\u2212') return [45, bold ? 333 : 333];   // minus -> hubung
    if (ch === '\t') return [32, 278];
    return [63, 556];                                     // '?'
  }
  const width = (s, size, bold) => { let w = 0; for (const ch of String(s)) w += glyph(ch, bold)[1]; return w * size / 1000 };
  function enc(s, bold) {
    let o = '';
    for (const ch of String(s)) { const c = glyph(ch, bold)[0]; o += c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 32 ? ' ' : String.fromCharCode(c) }
    return o;
  }
  const num = n => { const v = Math.round(n * 100) / 100; return String(Object.is(v, -0) ? 0 : v) };
  const col = c => c.map(x => num(x)).join(' ');

  /* Pecah teks jadi baris yang muat dalam maxW (per kata; kata yang terlalu panjang dipotong per karakter) */
  function wrap(text, size, bold, maxW) {
    const out = [];
    for (const para of String(text == null ? '' : text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (width(w, size, bold) > maxW) {      // kata lebih lebar dari baris: potong
          let k = 1; while (k < w.length && width(w.slice(0, k + 1), size, bold) <= maxW) k++;
          if (line) { out.push(line); line = '' }
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        const t = line ? line + ' ' + w : w;
        if (width(t, size, bold) <= maxW) line = t; else { out.push(line); line = w }
      }
      out.push(line);
    }
    return out;
  }

  function doc(opt = {}) {
    const W = opt.w || 595.28, H = opt.h || 841.89, pages = [];
    const info = { Title: opt.title || '', Author: opt.author || '', Subject: opt.subject || '', Producer: 'SekolahHub' };
    function page() {
      const ops = [], p = {
        w: W, h: H, ops,
        /* text(x, y, str, {size, font:'r|b|i', color:[r,g,b], align:'l|c|r', rot:derajat}); y = garis dasar dari atas */
        text(x, y, str, o = {}) {
          const size = o.size || 10, f = o.font || 'r', bold = f === 'b', s = String(str);
          const w = width(s, size, bold), px = o.align === 'r' ? x - w : o.align === 'c' ? x - w / 2 : x, py = H - y;
          const rot = (o.rot || 0) * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot);
          ops.push('q ' + col(o.color || [0, 0, 0]) + ' rg BT /' + f.toUpperCase() + ' ' + num(size) + ' Tf ' + [num(cs), num(sn), num(-sn), num(cs), num(px), num(py)].join(' ') + ' Tm (' + enc(s, bold) + ') Tj ET Q');
          return w;
        },
        rect(x, y, w, h, o = {}) {
          const fill = o.fill, stroke = o.stroke;
          if (!fill && !stroke) return;
          ops.push('q ' + (fill ? col(fill) + ' rg ' : '') + (stroke ? col(stroke) + ' RG ' + num(o.lw || 1) + ' w ' : '') + num(x) + ' ' + num(H - y - h) + ' ' + num(w) + ' ' + num(h) + ' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S') + ' Q');
        },
        line(x1, y1, x2, y2, o = {}) {
          ops.push('q ' + col(o.color || [0, 0, 0]) + ' RG ' + num(o.lw || 0.8) + ' w ' + (o.dash ? '[' + o.dash.join(' ') + '] 0 d ' : '') + num(x1) + ' ' + num(H - y1) + ' m ' + num(x2) + ' ' + num(H - y2) + ' l S Q');
        },
        /* matriks QR sebagai persegi vektor. get(x,y) -> gelap?, n = jumlah modul, quiet = zona tenang (modul) tidak digambar tetapi dilebarkan lewat size */
        qr(get, n, x, y, size, o = {}) {
          const m = size / n; let d = '';
          for (let r = 0; r < n; r++) for (let c = 0; c < n;) { if (get(c, r)) { let l = 1; while (c + l < n && get(c + l, r)) l++; d += num(x + c * m) + ' ' + num(H - y - (r + 1) * m) + ' ' + num(l * m) + ' ' + num(m) + ' re '; c += l } else c++ }
          ops.push('q ' + col(o.color || [0, 0, 0]) + ' rg ' + d + 'f Q');
        }
      };
      pages.push(p); return p;
    }
    function save() {
      const objs = [];                       // isi objek (string latin1), indeks 1..n
      const add = s => { objs.push(s); return objs.length };
      add('');                               // 1: katalog (diisi belakangan)
      add('');                               // 2: daftar halaman
      const fids = {};
      for (const k of ['r', 'b', 'i']) fids[k] = add('<< /Type /Font /Subtype /Type1 /BaseFont /' + FONTS[k] + ' /Encoding /WinAnsiEncoding >>');
      const res = '<< /Font << /R ' + fids.r + ' 0 R /B ' + fids.b + ' 0 R /I ' + fids.i + ' 0 R >> >>';
      const kids = [];
      for (const p of pages) {
        const body = p.ops.join('\n'), cid = add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
        kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(p.w) + ' ' + num(p.h) + '] /Resources ' + res + ' /Contents ' + cid + ' 0 R >>'));
      }
      objs[1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
      objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
      const pd = d => 'D:' + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
      const iid = add('<< ' + Object.keys(info).filter(k => info[k]).map(k => '/' + k + ' (' + enc(info[k], false) + ')').join(' ') + ' /CreationDate (' + pd(opt.date || new Date()) + ') >>');
      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
      objs.forEach((o, i) => { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n' });
      const x = out.length;
      out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info ' + iid + ' 0 R >>\nstartxref\n' + x + '\n%%EOF\n';
      const b = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 255;
      return b;
    }
    return { page, save, W, H };
  }
  window.PDFW = { doc, width, wrap, enc };
})();
