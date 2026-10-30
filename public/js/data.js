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

  // Pemetaan koleksi di app.js -> tabel Supabase
  const MAP = {
    siswa:    { table: 'siswa', order: 'nama', dates: ['tgl', 'masuk'],
                cols: ['nama','nis','nisn','kelas','jk','tl','tgl','agama','gol','alamat','hp','ayah','ibu','wali','pkj','hobi','cita','kes','masuk','bio','foto','cover','target'] },
    tab:      { table: 'tabungan',   order: 'tgl', dates: ['tgl'], cols: ['sid','tgl','jenis','jml','cat'] },
    iuran:    { table: 'iuran',      order: 'bulan', dates: ['tgl'], cols: ['sid','bulan','jml','tgl','cat'] },
    absensi:  { table: 'absensi',    order: 'tgl', dates: ['tgl'], cols: ['sid','tgl','st'] },
    kas:      { table: 'kas',        order: 'tgl', dates: ['tgl'], cols: ['tgl','jenis','jml','ket'] },
    agenda:   { table: 'agenda',     order: 'tgl', dates: ['tgl'], cols: ['tgl','judul','ket'] },
    info:     { table: 'pengumuman', order: 'tgl', dates: ['tgl'], cols: ['tgl','judul','isi'] },
    vote:     { table: 'voting',     order: 'created_at', cols: ['judul','open','kand','suara'] },
    struktur: { table: 'struktur',   order: 'created_at', cols: ['jab','sid'] },
    log:      { table: 'aktivitas',  order: 't', desc: true, keep: true, limit: 150, cols: ['t','m'] }
  };
  const ORDER = Object.keys(MAP); // siswa lebih dulu karena tabel lain bergantung padanya
  const DEFAULT = { open: true, kand: [], suara: {}, jml: 0, t: 0 };
  const uid = () => Math.random().toString(36).slice(2, 10);

  const snap = {};       // koleksi -> Map(id -> JSON baris terakhir yang diketahui server)
  let snapCfg = '';
  let chain = Promise.resolve(), busy = 0, lastPush = 0;

  function toRow(k, it) {
    const m = MAP[k], r = { id: it.id };
    for (const c of m.cols) {
      let v = it[c];
      if (m.dates && m.dates.includes(c) && !v) v = null;
      else if (v === undefined || v === null) v = c in DEFAULT ? DEFAULT[c] : '';
      if (c === 'jml' || c === 't' || c === 'target') v = Number(v) || 0;
      r[c] = v;
    }
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
  const cfgRow = c => ({ id: 1, sekolah: c.sekolah || '', tahun: c.tahun || '', walikelas: c.walikelas || '', iuran: Number(c.iuran) || 0, wa_tab: c.watab || '', wa_iuran: c.waiuran || '' });

  // Hitung perubahan sekarang juga (sinkron), kirim ke server lewat antrian
  function plan(db) {
    const up = {}, del = {};
    for (const k of ORDER) {
      const m = MAP[k], prev = snap[k] || new Map(), cur = new Map();
      for (const it of db[k] || []) {
        if (!it.id) it.id = k === 'log' ? 'l' + it.t + uid().slice(0, 3) : uid();
        const r = toRow(k, it), j = JSON.stringify(r);
        cur.set(it.id, j);
        if (prev.get(it.id) !== j) (up[k] = up[k] || []).push(r);
      }
      if (!m.keep) for (const id of prev.keys()) if (!cur.has(id)) (del[k] = del[k] || []).push(id);
      snap[k] = m.keep ? new Map([...prev, ...cur]) : cur; // jejak aktivitas tidak pernah dihapus dari server
    }
    const c = JSON.stringify(cfgRow(db.cfg || {}));
    if (c !== snapCfg) { up.cfg = JSON.parse(c); snapCfg = c; }
    return { up, del };
  }
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  async function run({ up, del }) {
    for (const k of ORDER) for (const part of chunk(up[k] || [], 300)) {
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
    user: null, role: 'pending', onError: null,
    canWrite: () => ['admin', 'pengurus'].includes(Data.role),

    async init() {
      if (!/^https:\/\/.+\.supabase\.co/.test(CFG.SUPABASE_URL || '') || !CFG.SUPABASE_ANON_KEY)
        throw new Error('Isi SUPABASE_URL dan SUPABASE_ANON_KEY di public/js/config.js (lokal) atau Environment Variables Vercel.');
      if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
        { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await sb.auth.getSession();
      await Data._profile(data.session);
    },
    async _profile(session) {
      Data.user = session ? session.user : null;
      Data.role = 'pending';
      if (!Data.user) return;
      const { data } = await sb.from('profiles').select('role').eq('id', Data.user.id).maybeSingle();
      Data.role = (data && data.role) || 'pending';
    },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : error.message);
      return null;
    },
    async signup(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      return data.session ? null : 'Akun dibuat. Periksa email untuk konfirmasi, lalu masuk.';
    },
    async logout() { await sb.auth.signOut(); location.reload(); },

    async loadTable(db, k) {
      db[k] = (await all(MAP[k])).map(r => fromRow(k, r));
      snap[k] = new Map(db[k].map(it => [it.id, JSON.stringify(toRow(k, it))]));
    },
    async loadCfg(db) {
      const { data } = await sb.from('pengaturan').select('*').eq('id', 1).maybeSingle();
      const c = data || {};
      db.cfg = { sekolah: c.sekolah || 'Nama Sekolah', tahun: c.tahun || '', walikelas: c.walikelas || '',
        iuran: Number(c.iuran) || 0, watab: c.wa_tab || '', waiuran: c.wa_iuran || '' };
      snapCfg = JSON.stringify(cfgRow(db.cfg));
    },
    // Muat semua tabel secara paralel
    async pull() {
      const db = {};
      await Promise.all([...ORDER.map(k => Data.loadTable(db, k)), Data.loadCfg(db)]);
      await signPhotos(db);
      return db;
    },
    // Muat ulang hanya tabel yang berubah (dipakai realtime)
    async refresh(db, tables) {
      await Promise.all([...ORDER.filter(k => tables.has(MAP[k].table)).map(k => Data.loadTable(db, k)),
        ...(tables.has('pengaturan') ? [Data.loadCfg(db)] : [])]);
      if (tables.has('siswa')) await signPhotos(db);
    },
    push(db) {
      const p = plan(db);
      const until = Date.now() + 4000; // abaikan gema realtime dari tulisan sendiri
      Object.keys(p.up).concat(Object.keys(p.del)).forEach(k => own.set(k === 'cfg' ? 'pengaturan' : MAP[k].table, until));
      busy++;
      chain = chain.then(() => run(p))
        .catch(e => { if (Data.onError) Data.onError(e); })
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
    async users() {
      const { data, error } = await sb.from('profiles').select('id,email,role,created_at').order('created_at');
      if (error) throw error;
      return data;
    },
    async setRole(id, role) {
      const { error } = await sb.from('profiles').update({ role }).eq('id', id);
      if (error) throw error;
    }
  };
  window.Data = Data;
})();
