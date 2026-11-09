/* SekolahHub: lapisan data Supabase
 * - Autentikasi (email + kata sandi) dan peran pengguna
 * - Memuat semua data ke objek `db` yang dipakai app.js
 * - Menyimpan perubahan dengan membandingkan `db` terhadap snapshot terakhir (hanya baris yang berubah dikirim)
 * - Sinkronisasi realtime antar perangkat
 */
(() => {
  'use strict';
  const CFG = window.SH_CONFIG || {};
  let sb = null;

  // Kolom buku besar (migrasi 013). Dikirim hanya bila migrasi sudah dijalankan (Data.bankOk !== false).
  // ref, rev_of, waktu, petugas: kosong dikirim sebagai NULL (indeks unik pada ref/rev_of). waktu dan petugas dicap ulang oleh server.
  const BANK = ['ref', 'rev_of', 'kanal', 'waktu', 'petugas'], BANKX = new Set([...BANK, 'kat']), NUL = new Set(['ref', 'rev_of', 'waktu', 'petugas']);
  // Pemetaan koleksi di app.js -> tabel Supabase
  const MAP = {
    siswa:    { table: 'siswa', order: 'nama', dates: ['tgl', 'masuk'],
                cols: ['nama','nis','nisn','kelas','jk','tl','tgl','agama','gol','alamat','hp','ayah','ibu','wali','pkj','hobi','cita','kes','masuk','bio','foto','cover','target'] },
    tab:      { table: 'tabungan',   order: 'tgl', dates: ['tgl'], cols: ['sid','tgl','jenis','jml','cat', ...BANK] },
    iuran:    { table: 'iuran',      order: 'bulan', dates: ['tgl','minggu'], cols: ['sid','bulan','minggu','jml','tgl','cat', ...BANK] },   // minggu = tanggal Senin (migrasi 012)
    absensi:  { table: 'absensi',    order: 'tgl', dates: ['tgl'], cols: ['sid','tgl','st'] },
    kas:      { table: 'kas',        order: 'tgl', dates: ['tgl'], cols: ['tgl','jenis','jml','ket','kat', ...BANK] },
    agenda:   { table: 'agenda',     order: 'tgl', dates: ['tgl'], cols: ['tgl','judul','ket'] },
    info:     { table: 'pengumuman', order: 'tgl', dates: ['tgl'], cols: ['tgl','judul','isi'] },
    vote:     { table: 'voting',     order: 'created_at', cols: ['judul','open','kand','suara'] },
    struktur: { table: 'struktur',   order: 'created_at', cols: ['jab','sid'] },
    log:      { table: 'aktivitas',  order: 't', desc: true, keep: true, limit: 150, cols: ['t','m'] }
  };
  const LEDGER = new Set(['tab', 'iuran']);
  const ORDER = Object.keys(MAP); // siswa lebih dulu karena tabel lain bergantung padanya
  const DEFAULT = { open: true, kand: [], suara: {}, jml: 0, t: 0 };
  const uid = () => Math.random().toString(36).slice(2, 10);

  const snap = {};       // koleksi -> Map(id -> JSON baris terakhir yang diketahui server)
  let snapCfg = '';
  let chain = Promise.resolve(), busy = 0, lastPush = 0;

  /* v2.16 (privasi): baris kas turunan iuran ('iu_*') tidak lagi membawa nama siswa ke server. Kolom ket kas terbaca oleh akun Siswa
     (RLS kas_siswa), jadi nama hanya dipasang di memori staf (app.js enrichKas) dan dibuang di sini sebelum dikirim / dibandingkan. */
  const KET_NAMA = /^((?:Pembatalan )?[Ii]uran mingguan) · .* · (Mg .*)$/;
  const stripKet = t => String(t || '').replace(KET_NAMA, '$1 · $2');
  function toRow(k, it) {
    const m = MAP[k], r = { id: it.id };
    for (const c of m.cols) {
      if (k === 'iuran' && c === 'minggu' && Data.weekOk === false) continue;
      if (BANKX.has(c) && Data.bankOk === false) continue;
      let v = it[c];
      if (m.dates && m.dates.includes(c) && !v) v = null;
      else if (NUL.has(c) && !v) v = null;
      else if (v === undefined || v === null) v = c in DEFAULT ? DEFAULT[c] : '';
      if (c === 'jml' || c === 't' || c === 'target') v = Number(v) || 0;
      r[c] = v;
    }
    if (k === 'kas' && String(it.id).startsWith('iu_')) r.ket = stripKet(r.ket);
    return r;
  }
  function fromRow(k, r) {
    const o = { id: r.id };
    for (const c of MAP[k].cols) {
      const v = r[c];
      o[c] = v == null ? (c === 'kand' ? [] : c === 'suara' ? {} : '') : v;
    }
    return o;
  }
  // Kolom tambahan (logo, kepsek, alamat, telp) hanya dikirim bila migrasi 007 sudah dijalankan; bila tidak, simpan tetap berhasil.
  let cfgExt = false, cfgIns = false, cfgNip = false, cfgBank = false, cfgApp = false;   // cfgApp: migrasi 014 (nama aplikasi)
     // cfgBank: migrasi 013 (tutup buku, saldo mengendap, batas otorisasi)
     // cfgIns: migrasi 008 (instansi), cfgNip: migrasi 009 (NIP kepala sekolah)
  const cfgRow = c => Object.assign({ id: 1, sekolah: c.sekolah || '', tahun: c.tahun || '', walikelas: c.walikelas || '', iuran: Number(c.iuran) || 0, wa_tab: c.watab || '', wa_iuran: c.waiuran || '' },
    cfgExt ? { logo: c.logo || '', kepsek: c.kepsek || '', alamat: c.alamat || '', telp: c.telp || '' } : {}, cfgIns ? { instansi: c.instansi || '' } : {}, cfgNip ? { kepsek_nip: c.kepsek_nip || '' } : {}, cfgApp ? { app_nama: c.app_nama || 'SekolahHub' } : {},
    cfgBank ? { tutup_buku: c.tutup || null, saldo_min: Number(c.saldomin) || 0, limit_otor: Number(c.limitotor) || 0 } : {});

  // Hitung perubahan sekarang juga (sinkron), kirim ke server lewat antrian
  function plan(db) {
    const up = {}, del = {}, alive = new Set((db.siswa || []).map(x => x.id)), undo = [];
    for (const k of ORDER) {
      const m = MAP[k], prev = snap[k] || new Map(), cur = new Map();
      for (const it of db[k] || []) {
        if (!it.id) it.id = k === 'log' ? 'l' + it.t + uid().slice(0, 3) : uid();
        const r = toRow(k, it), j = JSON.stringify(r);
        cur.set(it.id, j);
        if (prev.get(it.id) !== j) { (up[k] = up[k] || []).push(r); undo.push([k, it.id, prev.get(it.id)]) }
      }
      if (!m.keep) for (const id of prev.keys()) if (!cur.has(id)) {
        // Buku besar tidak boleh dihapus baris demi baris oleh pengurus. Bila siswanya yang dihapus, server membersihkan turunannya (cascade).
        if (LEDGER.has(k) && !alive.has(JSON.parse(prev.get(id)).sid)) continue;
        (del[k] = del[k] || []).push(id); undo.push([k, id, prev.get(id)]);
      }
      snap[k] = m.keep ? new Map([...prev, ...cur]) : cur; // jejak aktivitas tidak pernah dihapus dari server
    }
    const c = JSON.stringify(cfgRow(db.cfg || {}));
    let oldCfg = null;
    if (c !== snapCfg) { up.cfg = JSON.parse(c); oldCfg = snapCfg; snapCfg = c; }
    /* Snapshot diperbarui lebih dulu (agar push berikutnya hanya mengirim selisih). Bila server menolak, rollback() mengembalikan
       snapshot baris yang gagal sehingga perubahan itu dikirim ulang pada penyimpanan berikutnya, bukan hilang diam-diam. */
    const rollback = () => {
      for (const [k, id, old] of undo) { const m = snap[k]; if (!m) continue; if (old === undefined) m.delete(id); else m.set(id, old) }
      if (oldCfg !== null) snapCfg = oldCfg;
    };
    return { up, del, rollback };
  }
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  /* Urutan sisip buku besar: kredit asli, debit asli, pembatalan debit, pembatalan kredit. Trigger server memeriksa saldo saat tiap baris
     masuk, sehingga urutan acak (mis. saat pemulihan cadangan, id acak pada tanggal yang sama) bisa menolak penarikan yang sebenarnya sah
     atau pembatalan sebelum transaksi asalnya ada. Sort stabil: urutan lain dipertahankan. */
  const debit = r => r.jenis === 'tarik' || r.jenis === 'keluar';
  const lrank = r => r.rev_of ? (debit(r) ? 2 : 3) : (debit(r) ? 1 : 0);
  const ordered = (k, rows) => LEDGER.has(k) || k === 'kas' ? rows.slice().sort((a, b) => lrank(a) - lrank(b)) : rows;
  async function run({ up, del }) {
    for (const k of ORDER) for (const part of chunk(ordered(k, up[k] || []), 300)) {
      const { error } = await sb.from(MAP[k].table).upsert(part);
      if (error) throw error;
    }
    if (up.cfg) { const { error } = await sb.from('pengaturan').upsert(up.cfg); if (error) throw error; }
    for (const k of [...ORDER].reverse()) for (const part of chunk(del[k] || [], 100)) {
      const { error } = await sb.from(MAP[k].table).delete().in('id', part);
      if (error) throw error;
    }
  }
  async function all(m) {
    let out = [], from = 0;
    for (;;) { // paginasi: Supabase membatasi 1000 baris per permintaan
      const { data, error } = await sb.from(m.table).select('*')
        .order(m.order, { ascending: !m.desc }).order('id').range(from, from + 999);
      if (error) throw error;
      out = out.concat(data);
      if (data.length < 1000 || (m.limit && out.length >= m.limit)) break;
      from += 1000;
    }
    return m.limit ? out.slice(0, m.limit) : out;
  }

  const BUCKET = 'foto-siswa', urlCache = new Map(), own = new Map();
  async function signPaths(paths) {
    const now = Date.now();
    const need = [...new Set(paths)].filter(p => { const c = urlCache.get(p); return !c || c.exp - now < 7200000; });
    for (const part of chunk(need, 100)) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(part, 86400);
      if (error) throw error;
      data.forEach(r => { if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: now + 86400000 }); });
    }
  }
  async function signPhotos(db) {
    const paths = [];
    for (const s of db.siswa || []) for (const k of ['foto', 'cover']) if (s[k] && !String(s[k]).startsWith('data:')) paths.push(s[k]);
    try { await signPaths(paths); } catch (e) { console.warn('Foto tidak bisa dimuat:', e.message); }
  }

  const Data = {
    user: null, role: 'pending', onError: null, rb: null, onStatus: null, status: 'ok', lastError: null,
    _st(s) { Data.status = s; if (Data.onStatus) Data.onStatus(s); },
    canWrite: () => ['admin', 'pengurus'].includes(Data.role),

    async init() {
      if (!/^https:\/\/.+\.supabase\.co/.test(CFG.SUPABASE_URL || '') || !CFG.SUPABASE_ANON_KEY)
        throw new Error('Isi SUPABASE_URL dan SUPABASE_ANON_KEY di public/js/config.js (lokal) atau Environment Variables Vercel.');
      if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
        { auth: { persistSession: true, autoRefreshToken: true } });
      Data.brandP = Data.brandPublik();   // paralel dengan pemeriksaan sesi: merek terbaru sudah siap saat layar masuk digambar
      const { data } = await sb.auth.getSession();
      await Data._profile(data.session);
    },
    async _profile(session) {
      Data.user = session ? session.user : null;
      Data.role = 'pending'; Data.klaim = null;
      if (!Data.user) return;
      let r = await sb.from('profiles').select('role,klaim_jenis,klaim_nis').eq('id', Data.user.id).maybeSingle();
      if (r.error) r = await sb.from('profiles').select('role').eq('id', Data.user.id).maybeSingle();   // sebelum migrasi 010
      const data = r.data;
      Data.role = (data && data.role) || 'pending';
      if (data && (data.klaim_jenis || data.klaim_nis)) Data.klaim = { jenis: data.klaim_jenis || '', nis: data.klaim_nis || '' };
    },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : error.message);
      return null;
    },
    async signup(email, password, meta) {
      // meta (klaim_jenis, klaim_nis) hanya saran untuk admin; tidak pernah memberi akses.
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta || {} } });
      if (error) throw error;
      return data.session ? null : 'Akun dibuat. Periksa email untuk konfirmasi, lalu masuk.';
    },
    // Otorisasi transaksi bernilai besar / pembatalan: verifikasi ulang kata sandi akun yang sedang masuk.
    async reauth(password) {
      if (!Data.user || !Data.user.email) throw new Error('Sesi tidak valid. Silakan masuk ulang.');
      if (!password) throw new Error('Kata sandi wajib diisi.');
      const { error } = await sb.auth.signInWithPassword({ email: Data.user.email, password });
      if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Kata sandi salah.' : error.message);
    },
    async logout() { await sb.auth.signOut(); location.reload(); },

    async loadTable(db, k) {
      if (k === 'vote' && Data.role === 'siswa') {   // akun Siswa tidak membaca tabel voting (suara rahasia); hanya rekap lewat voting_siswa() (migrasi 015)
        db.vote = (await Data.voteSiswa()) || [];
        snap[k] = new Map(db.vote.map(it => [it.id, JSON.stringify(toRow(k, it))]));
        return db;
      }
      db[k] = (await all(MAP[k])).map(r => fromRow(k, r));
      snap[k] = new Map(db[k].map(it => [it.id, JSON.stringify(toRow(k, it))]));
    },
    async loadCfg(db) {
      const { data } = await sb.from('pengaturan').select('*').eq('id', 1).maybeSingle();
      const c = data || {};
      cfgExt = !!data && 'logo' in data; Data.cfgExt = cfgExt;
      cfgIns = !!data && 'instansi' in data; Data.cfgIns = cfgIns;
      cfgNip = !!data && 'kepsek_nip' in data; Data.cfgNip = cfgNip;
      cfgBank = !!data && 'tutup_buku' in data; Data.cfgBank = cfgBank;
      cfgApp = !!data && 'app_nama' in data; Data.cfgApp = cfgApp;
      db.cfg = { sekolah: c.sekolah || 'Nama Sekolah', tahun: c.tahun || '', walikelas: c.walikelas || '',
        iuran: Number(c.iuran) || 0, watab: c.wa_tab || '', waiuran: c.wa_iuran || '',
        logo: c.logo || '', kepsek: c.kepsek || '', alamat: c.alamat || '', telp: c.telp || '', instansi: c.instansi || '', kepsek_nip: c.kepsek_nip || '', app_nama: c.app_nama || 'SekolahHub',
        tutup: c.tutup_buku || '', saldomin: Number(c.saldo_min) || 0, limitotor: Number(c.limit_otor) || 0 };
      snapCfg = JSON.stringify(cfgRow(db.cfg));
    },
    // Muat semua tabel secara paralel
    async pull() {
      const db = {};
      // Probe migrasi lebih dulu: toRow() memakai Data.weekOk / Data.bankOk, jadi snapshot harus dibentuk setelah keduanya diketahui
      // (bila tidak, database tanpa migrasi mengirim ulang semua baris pada push pertama).
      await Promise.all([Data.probeWeekly(), Data.probeBank()]);
      await Promise.all([...ORDER.map(k => Data.loadTable(db, k)), Data.loadCfg(db), Data.loadRekan(db)]);
      await signPhotos(db);
      return db;
    },
    // Migrasi 012: apakah kolom iuran.minggu sudah ada. false = iuran mingguan dinonaktifkan dan UI menampilkan petunjuk migrasi.
    weekOk: null,
    async probeWeekly() {
      try { const { error } = await sb.from('iuran').select('minggu').limit(1); Data.weekOk = !error } catch (e) { Data.weekOk = false }
    },
    // Migrasi 013: apakah kolom buku besar (ref, rev_of, ...) sudah ada. false = menu Keuangan berjalan tanpa fitur perbankan dan menampilkan petunjuk migrasi.
    bankOk: null,
    async probeBank() {
      try { const { error } = await sb.from('tabungan').select('ref').limit(1); Data.bankOk = !error } catch (e) { Data.bankOk = false }
    },
    // Akun Siswa: nama teman sekelas (id, nama, kelas) untuk menampilkan nama pengurus dan kandidat voting. Fungsi rekan_kelas() dari migrasi 011.
    // Gagal-diam bila migrasi belum dijalankan; db.rekan tidak pernah ikut disimpan ke server.
    async loadRekan(db) {
      db.rekan = [];
      if (Data.role !== 'siswa') return;
      try { const { data, error } = await sb.rpc('rekan_kelas'); if (!error && Array.isArray(data)) db.rekan = data; } catch (e) { /* abaikan */ }
    },
    // Voting akun Siswa. Mengembalikan daftar pemilihan untuk kelas siswa: {id, judul, open, kand, hitung:{kandidat:jumlah}, total, saya}.
    // null bila migrasi 015 belum dijalankan atau jaringan gagal; Data.voteOk menyimpan statusnya.
    voteOk: null,
    async voteSiswa() {
      try {
        const { data, error } = await sb.rpc('voting_siswa');
        Data.voteOk = !error && Array.isArray(data);
        if (!Data.voteOk) return null;
        return data.map(v => ({ id: v.id, judul: v.judul, open: !!v.open, kand: Array.isArray(v.kand) ? v.kand : [], suara: {}, hitung: v.hitung || {}, total: +v.total || 0, saya: v.saya || '' }));
      } catch (e) { Data.voteOk = false; return null; }
    },
    // Beri suara atas nama akun yang sedang login. Siapa pemilihnya ditentukan server dari sesi, bukan dari kiriman aplikasi.
    async beriSuara(id, kand) {
      const { error } = await sb.rpc('beri_suara', { p_id: id, p_kand: kand });
      if (error) throw new Error(/function .*beri_suara|schema cache/i.test(error.message) ? 'Fitur voting per akun belum aktif. Hubungi admin (migrasi 015).' : error.message);
    },
    // Muat ulang hanya tabel yang berubah (dipakai realtime)
    async refresh(db, tables) {
      await Promise.all([...ORDER.filter(k => tables.has(MAP[k].table)).map(k => Data.loadTable(db, k)),
        ...(tables.has('pengaturan') ? [Data.loadCfg(db)] : []),
        ...(tables.has('siswa') ? [Data.loadRekan(db)] : [])]);
      if (tables.has('siswa')) await signPhotos(db);
    },
    push(db) {
      Data.ver = (Data.ver || 0) + 1;   // v2.15: membatalkan cache saldo di app.js
      const p = plan(db);
      const until = Date.now() + 4000; // abaikan gema realtime dari tulisan sendiri
      Object.keys(p.up).concat(Object.keys(p.del)).forEach(k => own.set(k === 'cfg' ? 'pengaturan' : MAP[k].table, until));
      busy++; Data._st('saving'); Data.lastError = null;
      chain = chain.then(() => run(p)).then(() => Data._st(busy > 1 ? 'saving' : 'ok'))
        .catch(e => { p.rollback(); Data.ver = (Data.ver || 0) + 1; Data.lastError = e; Data._st('error'); if (Data.onError) Data.rb = Promise.resolve(Data.onError(e)).catch(() => {}) })
        .then(() => { busy--; lastPush = Date.now(); });
      return chain;
    },
    // Foto siswa di Supabase Storage (bucket privat, URL bertanda tangan)
    url(p) { if (!p) return ''; if (p.startsWith('data:')) return p; const c = urlCache.get(p); return c ? c.url : ''; },
    async upload(sid, kind, blob) {
      const path = sid + '/' + kind + '-' + Date.now() + '.jpg';
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      await signPaths([path]);
      return path;
    },
    drop(p) { if (p && !p.startsWith('data:')) { urlCache.delete(p); sb.storage.from(BUCKET).remove([p]).catch(() => {}); } },
    dataToBlob(u) {
      const bin = atob(u.split(',')[1]), a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return new Blob([a], { type: 'image/jpeg' });
    },

    // Realtime: kumpulkan tabel yang berubah, lalu panggil cb(Set tabel). cb boleh mengembalikan false untuk menunda.
    subscribe(cb) {
      const dirty = new Set(); let t;
      const run = async () => {
        if (busy) { t = setTimeout(run, 1500); return; }
        const batch = new Set(dirty); dirty.clear();
        if (!batch.size) return;
        if ((await cb(batch)) === false) { batch.forEach(x => dirty.add(x)); t = setTimeout(run, 3000); }
      };
      const ch = sb.channel('sekolahhub');
      Object.values(MAP).map(m => m.table).concat('pengaturan').forEach(table =>
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          if ((own.get(table) || 0) > Date.now()) return;
          dirty.add(table); clearTimeout(t); t = setTimeout(run, 700);
        }));
      ch.subscribe();
    },

    // Tautan orang tua ke siswa (hanya admin yang boleh mengubah)
    async links() {
      const { data, error } = await sb.from('wali_siswa').select('uid,sid');
      if (error) throw error;
      const m = {}; data.forEach(r => (m[r.uid] = m[r.uid] || []).push(r.sid));
      return m;
    },
    async children(uid) {
      const { data, error } = await sb.from('wali_siswa').select('sid').eq('uid', uid);
      if (error) throw error;
      return data.map(r => r.sid);
    },
    async setChildren(uid, sids) {
      const del = await sb.from('wali_siswa').delete().eq('uid', uid);
      if (del.error) throw del.error;
      if (sids.length) {
        const ins = await sb.from('wali_siswa').insert(sids.map(sid => ({ uid, sid })));
        if (ins.error) throw ins.error;
      }
    },

    // Manajemen pengguna (hanya admin yang lolos RLS)
    akunExt: false,
    async users() {
      let r = await sb.from('profiles').select('id,email,role,created_at,klaim_jenis,klaim_nis,disetujui_pada').order('created_at');
      Data.akunExt = !r.error;   // migrasi 010 sudah dijalankan?
      if (r.error) r = await sb.from('profiles').select('id,email,role,created_at').order('created_at');
      if (r.error) throw r.error;
      return r.data;
    },
    /* Setujui / ubah peran / cabut akses + tautan siswa dalam satu transaksi (fungsi approve_account, migrasi 010). */
    async approve(id, role, sids) {
      sids = sids || [];
      const { error } = await sb.rpc('approve_account', { p_uid: id, p_role: role, p_sids: sids });
      if (!error) return;
      if (/approve_account|schema cache|PGRST202/i.test((error.code || '') + ' ' + (error.message || ''))) {
        if (role === 'siswa') throw new Error('Peran Siswa membutuhkan migrasi 010 di Supabase. Lihat README.');
        await Data.setRole(id, role); if (role === 'ortu') await Data.setChildren(id, sids); return;   // jalur lama
      }
      throw error;
    },
    async setRole(id, role) {
      const { error } = await sb.from('profiles').update({ role }).eq('id', id);
      if (error) throw error;
    },

    // Logo sekolah (bucket publik 'logo-sekolah', migrasi 007)
    cfgExt: false,
    cfgIns: false,
    cfgNip: false,
    cfgApp: false,
    cfgBank: false,
    // Data merek untuk layar masuk (sebelum login). null bila migrasi 014 belum dijalankan atau jaringan gagal.
    async brandPublik() {
      try {
        if (!sb) return null;
        const { data, error } = await sb.rpc('brand_publik');
        if (error || !data) return null;
        return { u: data.logo ? Data.logoUrl(data.logo) : '', n: data.sekolah || '', a: data.app_nama || '', i: data.instansi || '', ad: data.alamat || '', tl: data.telp || '' };
      } catch (e) { return null; }
    },
    logoUrl(p) { return p ? sb.storage.from('logo-sekolah').getPublicUrl(p).data.publicUrl : ''; },
    async uploadLogo(blob) {
      const path = 'logo-' + Date.now() + '.png';
      const { error } = await sb.storage.from('logo-sekolah').upload(path, blob, { contentType: 'image/png', upsert: false });
      if (error) throw error;
      return path;
    },
    dropLogo(p) { if (p) sb.storage.from('logo-sekolah').remove([p]).catch(() => {}); },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },

    // Preferensi tema per akun (tabel 'preferensi', migrasi 006). Gagal diam-diam bila tabel belum ada.
    async getTema() {
      if (!Data.user) return null;
      const { data, error } = await sb.from('preferensi').select('tema').eq('uid', Data.user.id).maybeSingle();
      return error || !data ? null : data.tema;
    },
    async setTema(tema) {
      if (!Data.user) return;
      await sb.from('preferensi').upsert({ uid: Data.user.id, tema, updated_at: new Date().toISOString() });
    }
  };
  window.Data = Data;
})();
