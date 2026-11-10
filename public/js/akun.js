/* SekolahHub: manajemen akun (khusus admin) dan pengalaman login pertama akun portal.
   - Persetujuan terpandu: peran + siswa yang ditautkan dipilih dalam satu langkah (fungsi SQL approve_account, atomik).
   - Klaim pendaftaran (jenis + NIS) hanya SARAN untuk admin: dicocokkan ke data siswa, tidak pernah memberi akses sendiri.
   - Peran 'siswa': akun milik satu siswa, hanya-baca, hanya melihat data siswa itu. Ditegakkan di database (RLS + trigger).
   Dimuat setelah pengaturan.js. Memakai global: db, Data, V, A, go, cur, save, logA, sis, tbl, empty, esc, fd, $, toast, ROLEL. */
(() => {
  'use strict';
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
  const ROLES = [
    ['siswa', 'Siswa', 'Hanya melihat data dirinya sendiri'],
    ['ortu', 'Orang tua', 'Hanya melihat data anak yang ditautkan'],
    ['viewer', 'Hanya lihat', 'Melihat seluruh kelas, tanpa mengubah data'],
    ['pengurus', 'Pengurus', 'Mengelola tabungan, iuran, absensi, dan data kelas'],
    ['admin', 'Admin', 'Akses penuh, termasuk pengaturan dan akun']
  ];
  const KJ = { siswa: 'Siswa', ortu: 'Orang tua', staf: 'Guru / staf' };
  let U = [], LN = {}, FLT = 'semua';

  const dlg = (html, wire) => { const d = $('#dlg'); d.innerHTML = html; d.showModal(); const x = d.querySelector('#x'); if (x) x.onclick = () => d.close(); if (wire) wire(d); return d };
  const byKelas = () => db.siswa.slice().sort((a, b) => String(a.kelas).localeCompare(String(b.kelas)) || String(a.nama).localeCompare(String(b.nama)));
  const matchNis = u => { const n = norm(u.klaim_nis); return n ? db.siswa.find(s => norm(s.nis) == n) : null };
  const refresh = () => { if (cur == 'pengaturan' && window.PG && PG.users) PG.users(); else go() };

  /* Info klaim pendaftar + hasil pencocokan NIS (untuk admin) */
  const claimHtml = u => {
    if (!u.klaim_jenis && !u.klaim_nis) return `<span class='akc mu'>Tidak ada klaim saat mendaftar</span>`;
    const m = matchNis(u), t = `Mengaku ${KJ[u.klaim_jenis] || 'pengguna'}${u.klaim_nis ? ' · NIS ' + esc(u.klaim_nis) : ''}`;
    const r = !u.klaim_nis ? '' : m ? `<span class='akc ok'>Cocok: ${esc(m.nama)} (${esc(m.kelas)})</span>` : `<span class='akc wn'>NIS tidak ditemukan di data siswa</span>`;
    return `<span class='akc mu'>${t}</span>${r}`;
  };

  /* ===== Dialog persetujuan / pengaturan akun ===== */
  async function setujui(uid, force) {
    if (uid == Data.user.id) return toast('Peran akun sendiri tidak dapat diubah');
    try { [U, LN] = await Promise.all([Data.users(), Data.links()]) } catch (e) { return toast(e.message) }
    const u = U.find(x => x.id == uid); if (!u) return toast('Akun tidak ditemukan');
    const ext = Data.akunExt, cur0 = LN[uid] || [], m = matchNis(u);
    let role = force || (u.role != 'pending' ? u.role : (u.klaim_jenis == 'siswa' ? 'siswa' : u.klaim_jenis == 'ortu' ? 'ortu' : 'viewer'));
    if (role == 'siswa' && !ext) role = 'viewer';
    const sel = new Set(cur0.length ? cur0 : (m && (role == 'siswa' || role == 'ortu') ? [m.id] : []));
    const taken = new Map(); U.forEach(x => { if (x.role == 'siswa' && x.id != uid) (LN[x.id] || []).forEach(s => taken.set(s, x.email)) });
    const isNew = u.role == 'pending';

    const d = dlg(`<h3>${isNew ? 'Setujui akun' : 'Atur akun'}</h3>`
      + `<div class='akb'><b>${esc(u.email)}</b><span class='lab'>Mendaftar ${fd(String(u.created_at).slice(0, 10))}${u.disetujui_pada ? ' · disetujui ' + fd(String(u.disetujui_pada).slice(0, 10)) : ''}</span><div class='akn'>${claimHtml(u)}</div></div>`
      + `<h4 class='sh4'>Peran</h4><div class='rls' role='radiogroup' aria-label='Peran'>${ROLES.map(r => `<label class='rl ${r[0] == role ? 'on' : ''} ${r[0] == 'siswa' && !ext ? 'off' : ''}'><input type='radio' name='rl' value='${r[0]}' ${r[0] == role ? 'checked' : ''} ${r[0] == 'siswa' && !ext ? 'disabled' : ''}><span><b>${r[1]}</b><small>${r[2]}</small></span></label>`).join('')}</div>`
      + (ext ? '' : `<div class='nt' style='margin-top:10px'>Peran <b>Siswa</b> membutuhkan migrasi <b>010</b> di Supabase. Lihat README.</div>`)
      + `<div id='pks'></div><div class='msg' id='ake'></div>`
      + `<div class='acts'><button id='x' type='button'>Batal</button><span class='sp'></span><button class='p' id='aok' type='button'>${isNew ? 'Setujui' : 'Simpan'}</button></div>`, d => {
      const er = t => { d.querySelector('#ake').textContent = t || '' };
      const draw = () => {
        const one = role == 'siswa', many = role == 'ortu', box = d.querySelector('#pks');
        if (!one && !many) { box.innerHTML = ''; return }
        if (one && sel.size > 1) { const f = [...sel][0]; sel.clear(); sel.add(f) }
        box.innerHTML = `<h4 class='sh4'>${one ? 'Siswa pemilik akun' : 'Anak yang ditautkan'}</h4><p class='lab'>Akun ini hanya akan melihat data ${one ? 'siswa yang dipilih' : 'siswa yang dipilih'} (tabungan, iuran, absensi, profil), tanpa hak mengubah. Data siswa lain tidak terlihat.</p>`
          + `<input id='pq' type='search' placeholder='Cari nama, NIS, atau kelas' autocomplete='off' aria-label='Cari siswa'>`
          + `<div class='pkl' id='pkl' role='${one ? 'radiogroup' : 'group'}'>${db.siswa.length ? byKelas().map(s => { const tk = one && taken.get(s.id); return `<label class='pkr' data-q='${esc((s.nama + ' ' + s.nis + ' ' + s.kelas).toLowerCase())}'><input type='${one ? 'radio' : 'checkbox'}' name='pk' value='${s.id}' ${sel.has(s.id) ? 'checked' : ''} ${tk ? 'disabled' : ''}><span class='pkn'><b>${esc(s.nama)}</b><small>NIS ${esc(s.nis)} · ${esc(s.kelas)}</small></span>${tk ? `<em class='pkt' title='${esc(tk)}'>sudah punya akun</em>` : ''}${m && m.id == s.id ? `<em class='pkm'>cocok klaim</em>` : ''}</label>` }).join('') : `<div class='empty'>Belum ada data siswa. Tambahkan siswa lebih dulu.</div>`}</div><div class='lab' id='pkc'></div>`;
        const cnt = () => { d.querySelector('#pkc').textContent = sel.size ? sel.size + ' siswa dipilih' + (one && sis(sel.values().next().value).nama ? ': ' + sis(sel.values().next().value).nama : '') : 'Belum ada siswa dipilih' };
        box.querySelectorAll('[name=pk]').forEach(i => { i.onchange = () => { if (one) { sel.clear(); sel.add(i.value) } else i.checked ? sel.add(i.value) : sel.delete(i.value); cnt() } });
        box.querySelector('#pq').oninput = e => { const q = e.target.value.trim().toLowerCase(); box.querySelectorAll('.pkr').forEach(r => { r.style.display = !q || r.dataset.q.includes(q) ? '' : 'none' }) };
        cnt();
      };
      d.querySelectorAll('[name=rl]').forEach(r => { r.onchange = () => { role = r.value; d.querySelectorAll('.rl').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); er(''); draw() } });
      draw();
      d.querySelector('#aok').onclick = async () => {
        const sids = ['siswa', 'ortu'].includes(role) ? [...sel] : [];
        if (role == 'siswa' && sids.length != 1) return er('Pilih tepat satu siswa untuk akun siswa.');
        if (role == 'ortu' && sids.length < 1) return er('Pilih minimal satu siswa untuk akun orang tua.');
        const b = d.querySelector('#aok'); b.disabled = true; er('Menyimpan…');
        try {
          await Data.approve(uid, role, sids);
          logA('Akun ' + u.email + (isNew ? ' disetujui' : ' diatur') + ' sebagai ' + ROLEL[role] + (sids.length ? ' (tertaut: ' + sids.map(i => sis(i).nama).join(', ') + ')' : ''));
          save(); d.close(); toast(isNew ? 'Akun disetujui' : 'Akun diperbarui'); refresh();
        } catch (e) { er(e.message || 'Gagal menyimpan'); b.disabled = false }
      };
    });
    d.addEventListener('close', () => { if (cur == 'pengguna') go() }, { once: true });   // mengembalikan pilihan peran bila dibatalkan
  }
  function cabut(uid) {
    const u = U.find(x => x.id == uid); if (!u) return go();
    const d = dlg(`<h3>Cabut akses akun?</h3><p><b>${esc(u.email)}</b> akan kembali berstatus <b>Menunggu</b>: tidak bisa membuka data apa pun dan tautan siswanya dihapus. Akun tidak dihapus dan bisa disetujui lagi kapan saja.</p><div class='msg' id='ake'></div><div class='acts'><button id='x' type='button'>Batal</button><span class='sp'></span><button class='p dng' id='aok' type='button'>Cabut akses</button></div>`, d => {
      d.querySelector('#aok').onclick = async () => { try { await Data.approve(uid, 'pending', []); logA('Akses akun ' + u.email + ' dicabut'); save(); d.close(); toast('Akses dicabut'); refresh() } catch (e) { d.querySelector('#ake').textContent = e.message } };
    });
    d.addEventListener('close', () => { if (cur == 'pengguna') go() }, { once: true });
  }
  async function peran(uid, role) {
    if (role == 'siswa' || role == 'ortu') return setujui(uid, role);
    if (role == 'pending') return cabut(uid);
    const u = U.find(x => x.id == uid);
    try { await Data.approve(uid, role, []); logA('Peran akun ' + (u ? u.email : '') + ' diubah menjadi ' + ROLEL[role]); save(); toast('Peran diperbarui'); go() } catch (e) { toast(e.message); go() }
  }

  /* ===== Halaman Pengguna ===== */
  const FL = [['semua', 'Semua'], ['pending', 'Menunggu'], ['siswa', 'Siswa'], ['ortu', 'Orang tua'], ['staf', 'Staf']];
  const inFlt = (u, f) => f == 'semua' || (f == 'staf' ? ['viewer', 'pengurus', 'admin'].includes(u.role) : u.role == f);
  function draw() {
    const el = $('#ul'); if (!el) return;
    const fl = $('#ufl'); if (fl) fl.innerHTML = FL.map(f => `<button type='button' class='s chip ${FLT == f[0] ? 'on' : ''}' onclick="ACC.flt('${f[0]}')">${f[1]} · ${U.filter(u => inFlt(u, f[0])).length}</button>`).join('');
    const rows = U.filter(u => inFlt(u, FLT)).map(x => {
      const me = x.id == Data.user.id, ln = (LN[x.id] || []).map(i => db.siswa.find(s => s.id == i)).filter(Boolean);
      const act = me ? '' : x.role == 'pending' ? `<button type='button' class='p s' onclick="A.setujui('${x.id}')">Tinjau & setujui</button>` : ['siswa', 'ortu'].includes(x.role) ? `<button type='button' class='s' onclick="A.setujui('${x.id}')">Atur tautan</button>` : '';
      const claim = x.role == 'pending' ? `<div class='akn'>${claimHtml(x)}</div>` : '';
      const tertaut = ['siswa', 'ortu'].includes(x.role) ? `<div class='ucl'><span class='mu'>Tertaut ke:</span> ${ln.length ? ln.map(s => `<b>${esc(s.nama)}</b> <span class='mu'>(${esc(s.kelas)})</span>`).join(', ') : "<span class='mu'>belum ditautkan</span>"}</div>` : '';
      return `<div class='uc' role='listitem'><div class='ucm'><b>${esc(x.email)}</b>${me ? " <span class='tag'>Anda</span>" : ''}${claim}<div class='lab'>Terdaftar ${fd(String(x.created_at).slice(0, 10))}</div></div>`
        + `<div class='ucr'><label>Peran<select ${me ? 'disabled title="Peran akun sendiri tidak dapat diubah"' : ''} aria-label='Peran ${esc(x.email)}' onchange="A.peran('${x.id}',this.value)">${['pending', 'viewer', 'pengurus', 'siswa', 'ortu', 'admin'].map(r => `<option value='${r}' ${r == x.role ? 'selected' : ''} ${r == 'siswa' && !Data.akunExt && x.role != 'siswa' ? 'disabled' : ''}>${ROLEL[r]}</option>`).join('')}</select></label>${tertaut}</div>`
        + `<div class='uca'>${act}</div></div>`;
    });
    el.innerHTML = rows.length ? rows.join('') : empty('Tidak ada akun pada filter ini.');
  }
  V.pengguna = () => {
    Promise.all([Data.users(), Data.links()]).then(([u, ln]) => { U = u; LN = ln; draw() }).catch(err => { const e = $('#ul'); if (e) e.innerHTML = empty(esc(err.message)) });
    return `<h2>Pengguna</h2><p class='sub'>Setujui akun baru, atur peran, dan tautkan akun siswa atau orang tua ke data siswa. Akun siswa dan orang tua hanya bisa melihat data yang ditautkan.</p><div id='ufl' class='chips' style='margin-bottom:12px'></div><div class='card ucs' id='ul' role='list'>${empty('Memuat daftar pengguna...')}</div>`;
  };

  /* ===== Profil siswa: status akun (khusus admin) ===== */
  const ACC = window.ACC = {
    flt(f) { FLT = f; draw() },
    profil() {
      const el = $('#akun-s'); if (!el) return; const s = db.siswa.find(x => x.id == PID); if (!s) return;
      Promise.all([Data.users(), Data.links()]).then(([u, ln]) => {
        const box = $('#akun-s'); if (!box) return;
        const ak = u.find(x => x.role == 'siswa' && (ln[x.id] || []).includes(PID)), ot = u.filter(x => x.role == 'ortu' && (ln[x.id] || []).includes(PID));
        const kl = u.filter(x => x.role == 'pending' && norm(x.klaim_nis) == norm(s.nis) && norm(s.nis));
        box.innerHTML = (ak ? `<span class='akc ok'>Akun siswa aktif · ${esc(ak.email)}</span><button class='s' onclick="A.setujui('${ak.id}')">Atur</button>` : `<span class='akc mu'>Belum punya akun siswa</span>`)
          + (ot.length ? `<span class='akc mu'>${ot.length} akun orang tua</span>` : '')
          + kl.map(x => `<span class='akc wn'>Pendaftar menunggu: ${esc(x.email)}</span><button class='p s' onclick="A.setujui('${x.id}')">Tinjau</button>`).join('');
      }).catch(() => { const b = $('#akun-s'); if (b) b.remove() });
    },
    /* Sambutan satu kali saat akun portal pertama kali dibuka setelah disetujui */
    welcome() {
      let k; try { k = 'sh.welcome.' + Data.user.id; if (localStorage.getItem(k)) return } catch (e) { return }
      if (!db.siswa.length) return;
      try { localStorage.setItem(k, '1') } catch (e) {}
      const sw = Data.role == 'siswa', nm = db.siswa.map(s => s.nama), kar = sw ? 'Kartu pelajar Anda' : (db.siswa.length > 1 ? 'Kartu pelajar anak Anda (pilih anak di bagian atas halaman)' : 'Kartu pelajar anak Anda');
      dlg(`<h3>Selamat datang${sw ? ', ' + esc(String(db.siswa[0].nama).split(' ')[0]) : ''}!</h3>`
        + `<p>Akun ${sw ? 'Anda' : 'untuk ' + esc(nm.join(', '))} sudah disetujui admin <b>${esc(db.cfg.sekolah)}</b>.</p>`
        + `<ul class='wl'><li>${kar} tampil di bagian paling atas Beranda.</li><li>Anda dapat membuka menu <b>Keuangan</b> (Tabungan, Kas Kelas, Iuran, Pengingat) dan <b>Kelas</b> (Data Siswa, Struktur Kelas, Absensi, Agenda, Pengumuman, Voting).</li><li>Akun ini <b>hanya-lihat</b>. Tidak ada data yang bisa diubah${sw ? '' : ' dan suara pemilihan hanya diberikan siswa dari akunnya sendiri'}, dan data pribadi siswa lain tidak dapat dilihat.</li></ul>`
      + `<div class='pbar' style='justify-content:flex-end;margin:16px 0 0'><button class='p' id='x' type='button'>Mulai</button></div>`);   // .pbar: tidak disembunyikan mode baca-saja (.ro)
    }
  };
  Object.assign(A, { setujui, peran, cabut });
})();
