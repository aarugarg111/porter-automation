// Run AFTER putting MAPPLS_CLIENT_ID + MAPPLS_CLIENT_SECRET in .env:
//   NODE_NO_WARNINGS=1 npx tsx scripts/verify-mappls.mts
// Confirms (a) auth works, (b) Mappls actually HAS Muthoot Finance / Canara Bank / Aryan Enterprises
// near the shop — the coverage question free OSM failed. If this prints those POIs, we wire the adapter.
import '../src/config/load-env.js';

const id = process.env.MAPPLS_CLIENT_ID;
const secret = process.env.MAPPLS_CLIENT_SECRET;
if (!id || !secret) { console.error('Set MAPPLS_CLIENT_ID + MAPPLS_CLIENT_SECRET in .env first.'); process.exit(1); }

// Badarpur Border metro — closest known coordinate to the shop (OSM had this one).
const REF = '28.4958,77.3023';

async function token(): Promise<string> {
  const res = await fetch('https://outpost.mappls.com/api/security/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id!, client_secret: secret! }),
  });
  const j: any = await res.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

async function get(url: string, tok: string) {
  const res = await fetch(url, { headers: { Authorization: `bearer ${tok}` } });
  const txt = await res.text();
  if (!res.ok) return `HTTP ${res.status}: ${txt.slice(0, 160)}`;
  try { return JSON.parse(txt); } catch { return txt.slice(0, 200); }
}

const tok = await token();
console.log('✓ auth ok\n');

for (const kw of ['Muthoot Finance', 'Canara Bank', 'Aryan Enterprises']) {
  const r: any = await get(`https://atlas.mappls.com/api/places/nearby/json?keywords=${encodeURIComponent(kw)}&refLocation=${REF}&radius=1500`, tok);
  const list = r?.suggestedLocations || r?.results || [];
  console.log(`NEARBY "${kw}": ${Array.isArray(list) ? list.length : 0} result(s)`);
  for (const p of (list || []).slice(0, 4))
    console.log('   -', p.placeName || p.poi || p.placeAddress, '| dist', p.distance, 'm |', p.latitude + ',' + p.longitude);
  console.log('');
}
process.exit(0);
