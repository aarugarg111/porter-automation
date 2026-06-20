import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { createLocation, listLocations } from '../src/locations/repo.js';
test('create + list location', () => {
  const db = getDb(':memory:');
  createLocation(db, { nickname:'Sharma', relationship:'customer', phone:'9990001111', default_payer:'RECEIVER' });
  const all = listLocations(db);
  expect(all.find(l=>l.nickname==='Sharma')?.default_payer).toBe('RECEIVER');
});
