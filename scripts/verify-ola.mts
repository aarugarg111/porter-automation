// Run after putting OLA_MAPS_API_KEY in .env:  NODE_NO_WARNINGS=1 npx tsx scripts/verify-ola.mts
// Ola Maps (Krutrim) — free tier 500K calls/mo, no card. API key passed as ?api_key= query param.
// Confirms the key works AND whether Ola actually HAS Muthoot Finance / Canara Bank / the shop near
// Badarpur — the coverage question free OSM failed and we're verifying before wiring (no blind build).
import '../src/config/load-env.js';

const KEY = process.env.OLA_MAPS_API_KEY;
if (!KEY) { console.error('Set OLA_MAPS_API_KEY=<key> in .env first.'); process.exit(1); }

const LOC = '28.4958,77.3023'; // Badarpur Border metro — closest known coord to the shop
const REQ = 'porter-verify-0001'; // some Ola endpoints want an X-Request-Id

async function hit(label: string, url: string) {
  try {
    const res = await fetch(url, { headers: { 'X-Request-Id': REQ } });
    const txt = await res.text();
    if (!res.ok) { console.log(`${label}: HTTP ${res.status} — ${txt.slice(0, 150)}\n`); return; }
    let j: any = {}; try { j = JSON.parse(txt); } catch {}
    const preds = j.predictions || j.geocodingResults || j.results || [];
    console.log(`${label}: OK (${preds.length})`);
    for (const p of preds.slice(0, 4))
      console.log('   -', p.description || p.formatted_address || p.name, '|', (p.geometry?.location ? `${p.geometry.location.lat},${p.geometry.location.lng}` : ''));
    console.log('');
  } catch (e) { console.log(`${label}: ERR ${(e as Error).message}\n`); }
}

const B = 'https://api.olamaps.io/places/v1';
await hit('autocomplete "Connaught Place" (sanity)', `${B}/autocomplete?input=${encodeURIComponent('Connaught Place')}&api_key=${KEY}`);
for (const q of ['Muthoot Finance Badarpur', 'Aryan Enterprises Badarpur', 'Canara Bank Badarpur']) {
  await hit(`autocomplete "${q}"`, `${B}/autocomplete?input=${encodeURIComponent(q)}&location=${LOC}&api_key=${KEY}`);
  await hit(`geocode "${q}"`, `${B}/geocode?address=${encodeURIComponent(q)}&api_key=${KEY}`);
}
process.exit(0);
