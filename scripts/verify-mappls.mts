// Run:  NODE_NO_WARNINGS=1 npx tsx scripts/verify-mappls.mts
// Mappls Aug-2025 auth: the Static Key is passed as the `access_token` QUERY PARAM (not URL path, not
// OAuth). Geocoding host = search.mappls.com. This confirms whether Mappls actually HAS Muthoot Finance /
// Canara Bank / the shop near Badarpur — the coverage question free OSM failed.
import '../src/config/load-env.js';

const KEY = process.env.MAPPLS_REST_KEY;
if (!KEY) { console.error('Set MAPPLS_REST_KEY=<Static Key> in .env first.'); process.exit(1); }

async function geocode(q: string) {
  const url = `https://search.mappls.com/search/address/geocode?access_token=${encodeURIComponent(KEY!)}&itemCount=3&address=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const txt = await res.text();
  if (!res.ok) { console.log(`geocode "${q}": HTTP ${res.status} — ${txt.slice(0, 160)}\n`); return; }
  let j: any = {}; try { j = JSON.parse(txt); } catch {}
  const rs = j.copResults ? [j.copResults] : (j.results || []);
  console.log(`geocode "${q}": ${rs.length} result(s)`);
  for (const r of rs.slice(0, 3))
    console.log(`   - ${r.formattedAddress || r.placeName || '?'} | ${r.latitude},${r.longitude} | eLoc ${r.eLoc || '-'} | ${r.geocodeLevel || ''}`);
  console.log('');
}

for (const q of [
  'Aryan Enterprises Bankey Lal Market Badarpur New Delhi',
  'Muthoot Finance Badarpur New Delhi 110044',
  'Canara Bank Badarpur New Delhi',
]) await geocode(q);
process.exit(0);
