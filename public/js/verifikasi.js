/* SekolahHub v2.18: halaman publik verifikasi bukti (QR pada kuitansi PDF).
 * Memanggil fungsi database verifikasi_transaksi (migrasi 018) dengan kunci anon, tanpa login dan tanpa menyimpan sesi.
 * Semua nilai dari server dirender dengan textContent (tidak pernah innerHTML). */
(() => {
  'use strict';
  const REF = /^(TRX|IUR|KAS|REV)\d{6}-[0-9A-F]{8}$/;
  const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const tgl = d => { const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return isNaN(x) ? String(d || '-') : x.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) };
  const jam = w => { const x = new Date(w); return !w || isNaN(x) ? '' : x.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':') + ' WIB/WITA' };
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e };

  /* Model tampilan dari jawaban server (murni, mudah diuji) */
  function model(res) {
    if (!res || res.ada !== true) return { kind: 'er', title: 'Nomor referensi tidak ditemukan', text: 'Dokumen ini tidak terdaftar di sistem sekolah. Jangan percaya dokumen ini sebelum dikonfirmasi pihak sekolah.' };
    const st = res.status;
    const kind = st === 'Berhasil' ? 'ok' : st === 'Dibatalkan' ? 'er' : 'wr';
    const title = st === 'Berhasil' ? 'Bukti ASLI dan berlaku' : st === 'Dibatalkan' ? 'Bukti ASLI, tetapi transaksi DIBATALKAN' : 'Bukti ASLI: ini dokumen pembatalan';
    const rows = [['No. referensi', res.ref], ['Jenis', res.tipe], ['Tanggal', tgl(res.tanggal)], ['Waktu pembukuan', jam(res.waktu)], ['Nama siswa', res.siswa], ['Petugas', res.petugas], ['Dibatalkan oleh', res.ref_pembatalan], ['Sekolah', res.sekolah]].filter(r => r[1]);
    return { kind, title, amount: rp(res.jumlah), rows };
  }
  function paint(m) {
    const box = document.getElementById('vf-res'); box.replaceChildren();
    const b = el('div', 'vf-badge ' + m.kind); b.append(el('i', '', m.kind === 'ok' ? '✓' : m.kind === 'er' ? '✕' : '!'), el('span', '', m.title)); box.append(b);
    if (m.text) { box.append(el('p', 'vf-load', m.text)); return }
    box.append(el('div', 'vf-amt', m.amount));
    const dl = el('dl', 'vf-kv'); m.rows.forEach(r => { dl.append(el('dt', '', r[0]), el('dd', '', String(r[1]))) }); box.append(dl);
  }
  function fail(t) { const box = document.getElementById('vf-res'); box.replaceChildren(); const b = el('div', 'vf-badge wr'); b.append(el('i', '', '!'), el('span', '', 'Belum bisa memeriksa')); box.append(b, el('p', 'vf-load', t)) }

  let sb = null;
  async function check(raw) {
    const ref = String(raw || '').trim().toUpperCase();
    if (!REF.test(ref)) { paint({ kind: 'er', title: 'Format nomor referensi tidak sah', text: 'Contoh format yang benar: TRX261109-ABCD1234.' }); return }
    const box = document.getElementById('vf-res'); box.replaceChildren(el('p', 'vf-load', 'Memeriksa…'));
    const C = window.SH_CONFIG || window.CFG || {};
    if (!C.SUPABASE_URL || !window.supabase) return fail('Layanan verifikasi belum dikonfigurasi oleh sekolah.');
    try {
      sb = sb || window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await sb.rpc('verifikasi_transaksi', { p_ref: ref });
      if (error) return fail(/function|schema cache|does not exist/i.test(error.message || '') ? 'Fitur verifikasi belum diaktifkan oleh sekolah (migrasi 018 belum dijalankan).' : 'Terjadi kendala saat menghubungi server. Coba lagi beberapa saat.');
      paint(model(data));
    } catch (e) { fail('Tidak ada koneksi ke server. Periksa internet Anda lalu coba lagi.') }
  }
  function init() {
    const f = document.getElementById('vf-form'), i = document.getElementById('vf-ref'), q = new URLSearchParams(location.search).get('r');
    f.addEventListener('submit', e => { e.preventDefault(); history.replaceState(null, '', '?r=' + encodeURIComponent(i.value.trim())); check(i.value) });
    if (q) { i.value = q; check(q) } else { f.hidden = false; document.getElementById('vf-res').replaceChildren(el('p', 'vf-load', 'Masukkan nomor referensi yang tertera pada dokumen, atau pindai kode QR di dokumen.')) }
    // Bila pemindaian gagal / format salah, tampilkan juga formulir agar bisa dikoreksi
    if (q && !REF.test(q.trim().toUpperCase())) f.hidden = false;
  }
  window.VF = { model, REF };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
