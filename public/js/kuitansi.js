/* SekolahHub v2.18: kuitansi / bukti transaksi PDF dengan QR verifikasi.
 * KW.build(desc, {origin}) -> Uint8Array PDF;  KW.pdf(desc) membangun lalu mengunduh.
 * desc = { judul, status:'Berhasil'|'Dibatalkan'|'Pembatalan', ref, amount, words, when, rows:[[label,nilai]], ttd:[label,...], petugas, foot,
 *          sekolah, alamat, telp, app }
 * QR berisi tautan {origin}/verifikasi?r={ref}. Halaman itu memanggil fungsi database verifikasi_transaksi (migrasi 018), yang hanya
 * mengembalikan data minimal (tipe, tanggal, nominal, status, nama tersamar). Dokumen ini bukan pengganti pembukuan: keaslian ditentukan server.
 */
(() => {
  'use strict';
  const P = window.PDFW;
  const TEAL = [0.12, 0.56, 0.55], INK = [0.08, 0.13, 0.14], MUT = [0.38, 0.45, 0.46], LINE = [0.84, 0.88, 0.88], OK = [0.1, 0.55, 0.32], ERR = [0.78, 0.18, 0.2], AMB = [0.72, 0.45, 0.05];
  const W = 419.53, M = 30, CW = W - 2 * M, LX = 136;      // A5 potret; LX = kolom nilai

  function urlOf(ref, origin) { return String(origin || (typeof location != 'undefined' ? location.origin : '')).replace(/\/+$/, '') + '/verifikasi?r=' + encodeURIComponent(ref || '') }

  function build(d, opt = {}) {
    const url = urlOf(d.ref, opt.origin);
    const st = d.status || 'Berhasil', stc = st === 'Dibatalkan' ? ERR : st === 'Pembatalan' ? AMB : OK;
    const Q = (window.IDC && window.IDC.QR) || opt.QR || null, qr = d.ref && Q ? Q.make(url) : null;

    // ---- ukur dulu agar tinggi halaman mengikuti isi ----
    const nameL = P.wrap(d.sekolah || '', 13, true, CW - 110), addr = [d.alamat, d.telp ? 'Telp. ' + d.telp : ''].filter(Boolean).join(' · ');
    const addrL = addr ? P.wrap(addr, 7.5, false, CW - 110) : [];
    let y = 26 + nameL.length * 16 + addrL.length * 10 + 10;
    const yTitle = y + 14; y = yTitle + 26;                               // judul + nomor
    const yBadge = y; y += 30;
    const yAmt = y, wordsL = d.words ? P.wrap(d.words, 8.5, false, CW - 24) : [], amtH = 56 + wordsL.length * 11; y += amtH + 16;
    const rows = (d.rows || []).filter(r => r && r[1] != null && String(r[1]) !== '').map(r => ({ l: String(r[0]), v: P.wrap(r[1], 9.5, false, W - M - LX) }));
    const yRows = y; rows.forEach(r => { r.h = Math.max(1, r.v.length) * 12 + 8; y += r.h });
    y += 14;
    const yBlk = y, qrS = 92, urlL = P.wrap(url, 6.8, false, W - M - LX), blkH = Math.max(qrS + 6, 54 + urlL.length * 9);
    y += blkH + 10;
    const ttd = d.ttd && d.ttd.length ? d.ttd : [], yTtd = y; if (ttd.length) y += 72;
    const yFoot = y + 6, footL = P.wrap(d.foot || '', 7, false, CW);
    const H = Math.max(595.28, yFoot + footL.length * 9 + 38);

    // ---- gambar ----
    const pdf = P.doc({ w: W, h: H, title: (d.judul || 'Bukti') + ' ' + (d.ref || ''), author: d.sekolah || '', subject: 'Bukti transaksi', date: opt.date }), p = pdf.page();
    if (st === 'Dibatalkan') {   // cap diagonal di tengah halaman (titik tengah teks = titik tengah halaman)
      const ws = 50, ww = P.width('DIBATALKAN', ws, true), ang = 28 * Math.PI / 180;
      p.text(W / 2 - Math.cos(ang) * ww / 2, H / 2 + 20 + Math.sin(ang) * ww / 2, 'DIBATALKAN', { size: ws, font: 'b', color: [0.98, 0.86, 0.86], rot: 28 });
    }
    p.rect(0, 0, W, 8, { fill: TEAL });
    let ty = 34; nameL.forEach(l => { p.text(M, ty, l, { size: 13, font: 'b', color: INK }); ty += 16 }); addrL.forEach(l => { p.text(M, ty - 4, l, { size: 7.5, color: MUT }); ty += 10 });
    p.text(W - M, 34, d.app || 'SekolahHub', { size: 8, font: 'b', color: TEAL, align: 'r' });
    p.text(W - M, 44, 'Bukti digital terverifikasi', { size: 7, color: MUT, align: 'r' });
    p.line(M, yTitle - 16, W - M, yTitle - 16, { color: LINE });
    p.text(W / 2, yTitle, String(d.judul || 'BUKTI TRANSAKSI').toUpperCase(), { size: 14, font: 'b', color: INK, align: 'c' });
    p.text(W / 2, yTitle + 15, 'No. Referensi  ' + (d.ref || '-'), { size: 9, color: MUT, align: 'c' });
    const bw = P.width(st.toUpperCase(), 9, true) + 28; p.rect(W / 2 - bw / 2, yBadge, bw, 20, { stroke: stc, lw: 1.2 }); p.text(W / 2, yBadge + 14, st.toUpperCase(), { size: 9, font: 'b', color: stc, align: 'c' });
    p.rect(M, yAmt, CW, amtH, { fill: [0.94, 0.97, 0.97] });
    p.text(W / 2, yAmt + 17, 'NOMINAL', { size: 7.5, font: 'b', color: MUT, align: 'c' });
    p.text(W / 2, yAmt + 44, d.amount || '', { size: 24, font: 'b', color: st === 'Dibatalkan' ? ERR : INK, align: 'c' });
    wordsL.forEach((l, i) => p.text(W / 2, yAmt + 60 + i * 11, i === 0 ? 'Terbilang: ' + l : l, { size: 8.5, font: 'i', color: MUT, align: 'c' }));
    let ry = yRows; rows.forEach(r => { p.text(M, ry + 11, r.l, { size: 8.5, color: MUT }); r.v.forEach((l, i) => p.text(LX, ry + 11 + i * 12, l, { size: 9.5, color: INK })); ry += r.h; p.line(M, ry - 3, W - M, ry - 3, { color: LINE, lw: 0.5 }) });
    // blok verifikasi
    if (qr) { p.rect(M, yBlk, qrS, qrS, { stroke: LINE, lw: 0.8 }); p.qr(qr.get, qr.n, M + 5, yBlk + 5, qrS - 10) }
    else p.rect(M, yBlk, qrS, qrS, { stroke: LINE, lw: 0.8 });
    if (!qr) p.text(M + qrS / 2, yBlk + qrS / 2 + 3, 'QR tidak tersedia', { size: 7, color: MUT, align: 'c' });
    p.text(LX, yBlk + 10, 'Verifikasi keaslian', { size: 9.5, font: 'b', color: INK });
    P.wrap('Pindai kode QR atau buka tautan di bawah, lalu pastikan nomor referensi, tanggal, dan nominal sama dengan dokumen ini.', 7.8, false, W - M - LX).forEach((l, i) => p.text(LX, yBlk + 23 + i * 10, l, { size: 7.8, color: MUT }));
    const uy = yBlk + 23 + 3 * 10 + 6; urlL.forEach((l, i) => p.text(LX, uy + i * 9, l, { size: 6.8, color: TEAL }));
    // tanda tangan
    if (ttd.length) { const cw = CW / ttd.length; ttd.forEach((t, i) => { const cx = M + cw * i + cw / 2; p.text(cx, yTtd + 8, t[0] || String(t), { size: 8.5, color: MUT, align: 'c' }); p.line(cx - cw / 2 + 14, yTtd + 50, cx + cw / 2 - 14, yTtd + 50, { color: MUT, lw: 0.6 }); if (t[1]) p.text(cx, yTtd + 60, String(t[1]), { size: 8.5, font: 'b', color: INK, align: 'c' }) }) }
    p.line(M, yFoot - 4, W - M, yFoot - 4, { color: LINE, lw: 0.5 });
    footL.forEach((l, i) => p.text(M, yFoot + 6 + i * 9, l, { size: 7, color: MUT }));
    const at = (opt.date || new Date()).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    p.text(M, H - 18, 'Dicetak ' + at + (d.petugas ? ' · Petugas ' + d.petugas : ''), { size: 7, color: MUT });
    p.text(W - M, H - 18, d.app || 'SekolahHub', { size: 7, color: MUT, align: 'r' });
    return pdf.save();
  }

  function download(bytes, name) {
    const b = new Blob([bytes], { type: 'application/pdf' }), u = URL.createObjectURL(b), a = document.createElement('a');
    a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 15000);
  }
  function pdf(d) {
    try { const bytes = build(d), name = 'Kuitansi_' + String(d.ref || 'bukti').replace(/[^\w.-]/g, '_') + '.pdf'; download(bytes, name); return bytes }
    catch (e) { console.error(e); if (typeof toast == 'function') toast('PDF gagal dibuat: ' + (e && e.message || e)); return null }
  }
  window.KW = { build, pdf, urlOf };
})();
