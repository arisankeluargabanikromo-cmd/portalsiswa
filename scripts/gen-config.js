// Menulis public/js/config.js dari environment variable (dipakai Vercel saat build).
const fs = require('fs'), u = process.env.SUPABASE_URL, k = process.env.SUPABASE_ANON_KEY;
if (u && k) {
  fs.writeFileSync('public/js/config.js', `window.SH_CONFIG = ${JSON.stringify({ SUPABASE_URL: u, SUPABASE_ANON_KEY: k })};\n`);
  console.log('config.js dibuat dari environment variable');
} else console.warn('SUPABASE_URL / SUPABASE_ANON_KEY belum di-set: memakai public/js/config.js apa adanya');
