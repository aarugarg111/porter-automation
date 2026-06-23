// src/maps/google.ts
// Google Maps Platform — the one map with real Badarpur POIs (verified: it even returns "Aryan
// Enterprises, Bosch dealer" at the exact spot). For a landmark the driver names that ISN'T in Aryan's
// curated list, we look it up near the shop and work out how far + which way the SHOP is from there, so
// the LLM brain can give a grounded next step. Places API (New) textSearch + a little geo math, no SDK.

export interface PlaceHit { name: string; address: string; distM: number; dirToShop: string }

export interface MapsProvider {
  // Where did the driver say he is → how to head to the shop from there. null if no confident nearby match.
  locate(spokenPlace: string): Promise<PlaceHit | null>;
}

const SHOP_LAT = Number(process.env.SHOP_LAT) || 28.5000777; // Aryan Enterprises (Google-verified)
const SHOP_LNG = Number(process.env.SHOP_LNG) || 77.3018299;
const MAX_M = Number(process.env.MAPS_MAX_M) || 8000; // matches farther than this are probably the wrong place
const FILLER = /^(haan|haan ji|ji|ji haan|ok|okay|theek|theek hai|achha|accha|hello|hmm+|haa+)$/i;

const toR = Math.PI / 180;
function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// 8-point compass word for the bearing from point A to point B.
function compass(aLat: number, aLng: number, bLat: number, bLng: number): string {
  const y = Math.sin((bLng - aLng) * toR) * Math.cos(bLat * toR);
  const x = Math.cos(aLat * toR) * Math.sin(bLat * toR)
    - Math.sin(aLat * toR) * Math.cos(bLat * toR) * Math.cos((bLng - aLng) * toR);
  const brg = (Math.atan2(y, x) / toR + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(brg / 45) % 8];
}

export class GoogleMaps implements MapsProvider {
  constructor(private key: string) {}

  async locate(spokenPlace: string): Promise<PlaceHit | null> {
    const q = (spokenPlace || '').trim();
    if (q.length < 5 || FILLER.test(q)) return null; // skip fillers / confirmations — not a place
    let res: Response;
    try {
      res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'X-Goog-Api-Key': this.key,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({
          textQuery: q, languageCode: 'hi',
          locationBias: { circle: { center: { latitude: SHOP_LAT, longitude: SHOP_LNG }, radius: 5000 } },
        }),
      });
    } catch (e) { console.error('[maps]', (e as Error).message); return null; }
    if (!res.ok) { console.error('[maps]', res.status, (await res.text()).slice(0, 120)); return null; }
    const j = await res.json() as any;
    const p = j.places?.[0];
    if (!p?.location) return null;
    const { latitude: lat, longitude: lng } = p.location;
    const distM = Math.round(haversineM(lat, lng, SHOP_LAT, SHOP_LNG));
    if (distM > MAX_M) return null; // too far → wrong place, ignore
    return { name: p.displayName?.text || q, address: p.formattedAddress || '', distM, dirToShop: compass(lat, lng, SHOP_LAT, SHOP_LNG) };
  }
}

// ── Shop briefing: fetched ONCE at boot and baked into every call's system prompt ────────────────────
// The shop's full Google identity + every nearby landmark (with distance + direction FROM the shop), so
// the agent already knows the whole neighbourhood instead of discovering it one turn at a time.
let SHOP_BRIEFING = '';
export function getShopBriefing(): string { return SHOP_BRIEFING; }

async function gget(url: string, key: string, fieldMask: string, body?: object) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json() as any;
}

export async function loadShopBriefing(key: string): Promise<number> {
  // 1) the shop's own Google record (canonical name + address + types)
  let shopLine = `Aryan Enterprises, 446 Bankey Lal Market, Mathura Road, Badarpur 110044 (in front of Metro Pillar 25).`;
  try {
    const s = await gget('https://places.googleapis.com/v1/places:searchText', key,
      'places.displayName,places.formattedAddress,places.primaryTypeDisplayName',
      { textQuery: 'Aryan Enterprises Bankey Lal Market Mathura Road Badarpur', languageCode: 'en',
        locationBias: { circle: { center: { latitude: SHOP_LAT, longitude: SHOP_LNG }, radius: 800 } } });
    const p = s.places?.[0];
    if (p) shopLine = `${p.displayName?.text} — ${p.formattedAddress}${p.primaryTypeDisplayName?.text ? ` (${p.primaryTypeDisplayName.text})` : ''}.`;
  } catch (e) { console.error('[maps] shop details', (e as Error).message); }

  // 2) everything around the shop, nearest first
  const nearby: string[] = [];
  try {
    const n = await gget('https://places.googleapis.com/v1/places:searchNearby', key,
      'places.displayName,places.location,places.primaryTypeDisplayName',
      { locationRestriction: { circle: { center: { latitude: SHOP_LAT, longitude: SHOP_LNG }, radius: 350 } },
        maxResultCount: 20, rankPreference: 'DISTANCE' });
    for (const p of (n.places || [])) {
      const loc = p.location; if (!loc) continue;
      const d = Math.round(haversineM(SHOP_LAT, SHOP_LNG, loc.latitude, loc.longitude));
      if (d < 8) continue; // the shop itself
      const dir = compass(SHOP_LAT, SHOP_LNG, loc.latitude, loc.longitude);
      const type = p.primaryTypeDisplayName?.text ? `, ${p.primaryTypeDisplayName.text}` : '';
      nearby.push(`  - ${p.displayName?.text}${type} — ~${d}m ${dir} of the shop`);
    }
  } catch (e) { console.error('[maps] nearby', (e as Error).message); }

  SHOP_BRIEFING = nearby.length
    ? `WHAT THE MAP KNOWS (use to recognise wherever the driver says he is, and point him here):\n- THE SHOP: ${shopLine}\n- NEARBY LANDMARKS (nearest first, with how far + which way they are FROM the shop — so if he's at one, send him the opposite way):\n${nearby.join('\n')}`
    : '';
  return nearby.length;
}
