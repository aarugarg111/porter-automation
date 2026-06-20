import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
test('seeds HOME once', () => {
  const db = getDb(':memory:'); seedHome(db); seedHome(db);
  const rows = db.prepare("select * from locations where is_home=1").all();
  expect(rows.length).toBe(1);
  expect((rows[0] as any).lat).toBeCloseTo(28.5000777);
});
