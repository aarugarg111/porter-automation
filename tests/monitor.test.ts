import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { sweepLateDeliveries, findLate } from '../src/tracking/monitor.js';
import { readRouter } from '../src/api/read.js';

// Drive a delivery to PICKED_UP with a short ETA, then pretend `now` is well past it.
async function pickedUp(db: any, expectedMinutes = 10) {
  const recv = createLocation(db, { nickname:'Far', relationship:'customer', phone:'900' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, expectedMinutes });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTRL', driverName:'Late', driverPhone:'901' });
  await applyParsed(db, m, { deliveryId:id, type:'PICKED_UP', orderId:'PRTRL' });
  return id;
}

test('createIntent sets expected_minutes so isLate can fire', () => {
  const db = getDb(':memory:'); seedHome(db);
  const recv = createLocation(db, { nickname:'X', relationship:'customer' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, expectedMinutes: 30 });
  const d:any = db.prepare('select expected_minutes from deliveries where id=?').get(id);
  expect(d.expected_minutes).toBe(30);
});

test('sweep alerts the owner once for a late delivery, then is idempotent', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await pickedUp(db, 10);
  const m = new MockMessenger();
  const future = Date.now() + 60 * 60000; // an hour later — well past 10m * 1.5

  expect(findLate(db, future).map(d=>d.id)).toContain(id);
  const first = await sweepLateDeliveries(db, m, '9599157340', future);
  expect(first.map(d=>d.id)).toEqual([id]);
  expect(m.sent.filter(s=>s.kind==='owner').length).toBe(1);

  // second sweep must NOT re-alert (late_alerted_at stamped)
  const second = await sweepLateDeliveries(db, m, '9599157340', future + 60000);
  expect(second.length).toBe(0);
  expect(m.sent.filter(s=>s.kind==='owner').length).toBe(1);
});

test('sweep does NOT alert a delivery still within its ETA', async () => {
  const db = getDb(':memory:'); seedHome(db);
  await pickedUp(db, 60);
  const m = new MockMessenger();
  const soon = Date.now() + 5 * 60000; // 5m elapsed, ETA 60m → not late
  const alerted = await sweepLateDeliveries(db, m, '9599157340', soon);
  expect(alerted.length).toBe(0);
  expect(m.sent.length).toBe(0);
});

test('GET /alerts returns currently-late open deliveries', async () => {
  const db = getDb(':memory:'); seedHome(db);
  // force a delivery that started an hour ago with a 10m ETA
  const recv = createLocation(db, { nickname:'Old', relationship:'customer', phone:'902' }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, expectedMinutes: 10 });
  const startedHourAgo = new Date(Date.now() - 60*60000).toISOString();
  db.prepare("update deliveries set status='PICKED_UP', started_at=? where id=?").run(startedHourAgo, id);
  const app = express(); app.use(express.json()); app.use(readRouter(db));
  const server = app.listen(0); const port = (server.address() as any).port;
  const out:any = await (await fetch(`http://localhost:${port}/alerts`)).json();
  expect(out.count).toBe(1);
  expect(out.late[0].id).toBe(id);
  server.close();
});
