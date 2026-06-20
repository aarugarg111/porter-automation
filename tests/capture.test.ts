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
