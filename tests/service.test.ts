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

test('RECEIVER payment is correct even when the fare notification arrives AFTER delivered (no "₹0")', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Late', relationship:'customer', phone:'222', default_payer:'RECEIVER' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'RECEIVER' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTR9', driverName:'L', driverPhone:'111' });
  // DELIVERED arrives BEFORE the fare → must NOT pre-notify yet (would be ₹0) and must NOT settle.
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTR9' });
  let d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.payment_status).toBe('pending');
  expect(m.sent.map((s:{kind:string})=>s.kind)).not.toContain('payment');
  // fare lands late → now the receiver is told the correct amount, exactly once, and it settles.
  await applyParsed(db, m, { deliveryId:id, type:'RECEIPT', orderId:'PRTR9', amountPaise:15000 });
  d = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.amount).toBe(15000);
  expect(d.payment_status).toBe('settled');
  const payments = m.sent.filter((s:{kind:string;extra?:any})=>s.kind==='payment');
  expect(payments.length).toBe(1);
  expect(payments[0].extra).toBe(15000);
});

test('ME pays + driver WhatsApp known → on DELIVERED the driver is asked for his UPI QR (once)', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Q', relationship:'customer', phone:'321', default_payer:'ME' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'ME' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTRQ', driverName:'D', driverPhone:'9000000000' });
  db.prepare("update deliveries set driver_whatsapp='9123456780' where id=?").run(id); // captured on the call
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTRQ' });
  const qr = m.sent.filter((s:{kind:string;phone:string})=>s.kind==='driver_qr');
  expect(qr.length).toBe(1);
  expect(qr[0].phone).toBe('9123456780');
  // idempotent: re-applying DELIVERED doesn't re-ask
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTRQ' });
  expect(m.sent.filter((s:{kind:string})=>s.kind==='driver_qr').length).toBe(1);
});

test('real name-only ASSIGNED stores the driver name + CRN and sends no directions (no phone yet)', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Nm', relationship:'customer' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv });
  const m = new MockMessenger();
  // The real Porter "assigned" notification carries the name but no phone (Porter masks it).
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'CRN1657868951', driverName:'Shrimanta Mandal' });
  const d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.status).toBe('ASSIGNED');
  expect(d.driver_name).toBe('Shrimanta Mandal');
  expect(d.porter_order_id).toBe('CRN1657868951');
  expect(m.sent.length).toBe(0); // no phone → can't WhatsApp the driver yet (the inbound call captures it)
});

test('CANCELLED notification cancels the delivery, logs an event, and sends nothing', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'Cx', relationship:'customer', phone:'909' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'CRN1657868951', driverName:'Shrimanta Mandal' });
  await applyParsed(db, m, { deliveryId:id, type:'CANCELLED', orderId:'CRN1657868951' });
  const d:any = db.prepare('select * from deliveries where id=?').get(id);
  expect(d.status).toBe('CANCELLED');
  const ev:any[] = db.prepare("select * from events where delivery_id=? and status='CANCELLED'").all(id) as any[];
  expect(ev.length).toBe(1);
  expect(m.sent.length).toBe(0);
  // terminal: a later "delivered" must not resurrect a cancelled order
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'CRN1657868951' });
  expect((db.prepare('select status from deliveries where id=?').get(id) as any).status).toBe('CANCELLED');
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
