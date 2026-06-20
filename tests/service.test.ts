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

test('RECEIPT notification inserts an audit event row with status RECEIPT and event_type=receipt', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Bose', relationship:'customer', phone:'777', default_payer:'RECEIVER' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'RECEIVER' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR2', driverName:'D', driverPhone:'666' });
  await applyParsed(db, m, { deliveryId:id, type:'RECEIPT', orderId:'PRTR2', amountPaise:5000 });
  const events:any[] = db.prepare('select * from events where delivery_id=? and status=?').all(id, 'RECEIPT') as any[];
  expect(events.length).toBe(1);
  expect(events[0].source).toBe('notif');
  expect(events[0].event_type).toBe('receipt');
});

test('payer=ME: delivered confirms receiver but does NOT notify payment or settle', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Gupta', relationship:'customer', phone:'555', default_payer:'ME' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'ME' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR3', driverName:'K', driverPhone:'444' });
  await applyParsed(db, m, { deliveryId:id, type:'RECEIPT', orderId:'PRTR3', amountPaise:9900 });
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTR3' });
  const d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.amount).toBe(9900);
  expect(d.payment_status).toBe('pending');
  const kinds = m.sent.map((s: {kind:string}) => s.kind);
  expect(kinds).toContain('directions');
  expect(kinds).toContain('confirm');
  expect(kinds).not.toContain('payment');
});

test('PICKED_UP stamps started_at; REACHED_AREA stamps reached_at', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Trip', relationship:'customer' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR4', driverName:'T', driverPhone:'333' });
  const beforePickup:any = db.prepare('select started_at from deliveries where id=?').get(id);
  expect(beforePickup.started_at).toBeNull();
  await applyParsed(db, m, { deliveryId:id, type:'PICKED_UP', orderId:'PRTR4' });
  const afterPickup:any = db.prepare('select started_at from deliveries where id=?').get(id);
  expect(afterPickup.started_at).not.toBeNull();
  await applyParsed(db, m, { deliveryId:id, type:'REACHED_AREA', orderId:'PRTR4' });
  const afterReached:any = db.prepare('select reached_at from deliveries where id=?').get(id);
  expect(afterReached.reached_at).not.toBeNull();
});
