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
// Compass direction of the SHOP as seen from the driver's spot (so we can say "shop is to your <dir>").
function bearingToShop(fromLat: number, fromLng: number): string {
  const y = Math.sin((SHOP_LNG - fromLng) * toR) * Math.cos(SHOP_LAT * toR);
  const x = Math.cos(fromLat * toR) * Math.sin(SHOP_LAT * toR)
    - Math.sin(fromLat * toR) * Math.cos(SHOP_LAT * toR) * Math.cos((SHOP_LNG - fromLng) * toR);
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
    return { name: p.displayName?.text || q, address: p.formattedAddress || '', distM, dirToShop: bearingToShop(lat, lng) };
  }
}
