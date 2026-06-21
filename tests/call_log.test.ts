import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { linkCallToDelivery, logCallTurn, saveDriverWhatsapp } from '../src/telephony/call_log.js';

function db2() { const db = getDb(':memory:'); seedHome(db); return db; }
function booking(db: any, phone?: string) {
  const recv = createLocation(db, { nickname: 'C' + Math.random(), relationship: 'customer', phone: '981' }) as number;
  return createIntent(db, { direction: 'SEND', otherLocationId: recv });
}

test('links a call to the delivery whose driver_phone matches — even with several active', async () => {
  const db = db2();
  const a = booking(db), b = booking(db);
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId: a, type: 'ASSIGNED', orderId: 'O1', driverName: 'A', driverPhone: '9111111111' });
  await applyParsed(db, m, { deliveryId: b, type: 'ASSIGNED', orderId: 'O2', driverName: 'B', driverPhone: '9222222222' });
  expect(linkCallToDelivery(db, '+919222222222')).toBe(b);
});

test('back-fills the driver number when exactly one active delivery has none', () => {
  const db = db2();
  const a = booking(db); // no driver phone yet
  expect(linkCallToDelivery(db, '+919876512345')).toBe(a);
  const d: any = db.prepare('select driver_phone from deliveries where id=?').get(a);
  expect(d.driver_phone).toBe('9876512345'); // back-filled
});

test('does NOT back-fill when ambiguous (several phoneless) — falls back to most recent', () => {
  const db = db2();
  booking(db); const b = booking(db); // two phoneless
  expect(linkCallToDelivery(db, '+919876512345')).toBe(b); // most recent, best guess
  const d: any = db.prepare('select driver_phone from deliveries where id=?').get(b);
  expect(d.driver_phone).toBeNull(); // not back-filled (ambiguous)
});

test('logCallTurn upserts by CallSid and accumulates turns; saveDriverWhatsapp stores the number', () => {
  const db = db2();
  const a = booking(db);
  logCallTurn(db, { callSid: 'C1', fromPhone: '+910000000000' });
  logCallTurn(db, { callSid: 'C1', fromPhone: '+910000000000', spoken: 'canara bank' });
  const row: any = db.prepare('select * from driver_calls where call_sid=?').get('C1');
  expect(row.turns).toBe(2);
  expect(row.last_spoken).toBe('canara bank');
  saveDriverWhatsapp(db, a, '9123456780', 'C1');
  expect((db.prepare('select driver_whatsapp from deliveries where id=?').get(a) as any).driver_whatsapp).toBe('9123456780');
});
