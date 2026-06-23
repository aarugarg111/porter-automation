import type { DatabaseSync } from 'node:sqlite';
import { listLandmarks, type LandmarkRow } from './repo.js';
// Keep latin a-z0-9 AND the Devanagari block (U+0900–U+097F): Hindi speech-to-text returns Devanagari
// (मैं बदरपुर बॉर्डर…), so stripping it would leave nothing to match. Aliases carry both scripts.
const norm = (s:string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]/g,' ').replace(/\s+/g,' ').trim();
export class LandmarkKB {
  private rows: LandmarkRow[];
  constructor(db: DatabaseSync) { this.rows = listLandmarks(db); }
  match(spoken: string): { directions:string; confidence:number } | null {
    const hay = ` ${norm(spoken)} `;
    let best: { directions:string; confidence:number; priority:number } | null = null;
    for (const r of this.rows) {
      const terms = [r.keyword, ...r.aliases.split(',')].map(norm).filter(Boolean);
      for (const t of terms) {
        if (t && hay.includes(` ${t} `)) {
          const confidence = Math.min(1, t.length / Math.max(norm(spoken).length, 1) + 0.3);
          if (!best || r.priority > best.priority) best = { directions:r.directions, confidence, priority:r.priority };
        }
      }
    }
    return best ? { directions: best.directions, confidence: best.confidence } : null;
  }
}
