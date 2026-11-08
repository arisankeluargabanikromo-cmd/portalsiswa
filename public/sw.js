/* Service worker: jaringan dulu, cache sebagai cadangan. Data tetap dari Supabase (lintas origin, tidak disentuh). */
const V = 'sekolahhub-v2.14.9';
const SHELL = ['./', 'css/style.css', 'css/mobile.css', 'css/idcard.css', 'css/siswa.css', 'css/bank.css', 'css/statement.css', 'js/theme.js', 'js/config.js', 'js/data.js', 'js/app.js', 'vendor/fflate.min.js', 'js/pengaturan.js', 'js/akun.js', 'js/import.js', 'js/idcard.js', 'js/siswa.js', 'js/bank.js', 'js/statement.js', 'js/auth.js', 'js/mobile.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x != V).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method != 'GET' || u.origin != location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)) } return res })
    .catch(() => caches.match(r).then(m => m || caches.match('./'))));
});
