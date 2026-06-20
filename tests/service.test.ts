import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
test('SEND intent → assigned messages driver → delivered confirms receiver + payment', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Sharma', relationship:'customer', phone:'999', default_payer:'RECEIVER' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'RECEIVER' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR1', driverName:'R', driverPhone:'888' });
  await applyParsed(db, m, { deliveryId:id, type:'RECEIPT', orderId:'PRTR1', amountPaise:14800 });
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTR1' });
  const d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.status).toBe('DELIVERED'); expect(d.amount).toBe(14800); expect(d.payment_status).toBe('settled');
  expect(m.sent.map(s=>s.kind)).toEqual(['directions','confirm','payment']);
});
