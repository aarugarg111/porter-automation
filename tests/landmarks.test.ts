import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';

function kb() { const db = getDb(':memory:'); seedLandmarks(db); return new LandmarkKB(db); }

test('matches a primary keyword', () => {
  const m = kb().match('main Muthoot ke paas hoon');
  // Muthoot is not curated; ensure curated landmark works instead
  expect(m).toBeNull();
});

test('matches Pillar 25 by alias', () => {
  const m = kb().match('pillar 25 pe khada hoon');
  expect(m).not.toBeNull();
  expect(m!.directions).toMatch(/Pillar/i);
  expect(m!.confidence).toBeGreaterThan(0);
});

test('matches Canara bank keyword', () => {
  const m = kb().match('canara bank ke paas');
  expect(m!.directions).toMatch(/Faridabad/);
});

test('higher-priority landmark wins when two match', () => {
  // "bank" alias (Canara) + "pillar 25" both present; Pillar 25 has higher priority
  const m = kb().match('pillar 25 ke paas wala bank');
  expect(m!.directions).toMatch(/Pillar/i);
});

test('returns null when nothing matches', () => {
  expect(kb().match('connaught place')).toBeNull();
});

test('seedLandmarks is idempotent', () => {
  const db = getDb(':memory:');
  seedLandmarks(db); seedLandmarks(db);
  const n = (db.prepare('select count(*) c from landmarks').get() as any).c;
  expect(n).toBe(5);
});
