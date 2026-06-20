import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent } from '../src/deliveries/service.js';
import { matchDelivery } from '../src/capture/matcher.js';
test('matches order to newest open intent then by orderId', () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'S',relationship:'customer'}) as number;
  const id = createIntent(db,{direction:'SEND',otherLocationId:r});
  expect(matchDelivery(db,{type:'ASSIGNED',orderId:'PRTR9'})).toBe(id);
  db.prepare("update deliveries set porter_order_id='PRTR9' where id=?").run(id);
  expect(matchDelivery(db,{type:'DELIVERED',orderId:'PRTR9'})).toBe(id);
});

test('matchDelivery returns the NEWEST open intent when multiple exist', () => {
  const db = getDb(':memory:'); seedHome(db);
  const r = createLocation(db,{nickname:'T',relationship:'customer'}) as number;
  const older = createIntent(db,{direction:'SEND',otherLocationId:r});
  const newer = createIntent(db,{direction:'SEND',otherLocationId:r});
  expect(newer).toBeGreaterThan(older);
  // No orderId so falls to open-intent fallback — should return the newest
  const matched = matchDelivery(db,{type:'ASSIGNED',orderId:'PRTR10'});
  expect(matched).toBe(newer);
});
