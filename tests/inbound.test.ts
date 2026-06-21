import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { handleInboundWhatsApp } from '../src/capture/inbound.js';
import { readRouter } from '../src/api/read.js';
import { inboundRouter } from '../src/api/inbound.js';

const OWNER = '9599157340';

// SEND delivery to `receiverPhone`, driver `driverPhone`, driven to DELIVERED.
async function delivered(db: any, receiverPhone: string, driverPhone = '9876500000') {
  const recv = createLocation(db, { nickname:'Recv', relationship:'customer', phone: receiverPhone }) as number;
  const id = createIntent(db, { direction:'SEND', otherLocationId: recv, payer:'ME' });
  const m = new MockMessenger();
  await applyParsed(db, m, { deliveryId:id, type:'ASSIGNED', orderId:'PRTRI', driverName:'D', driverPhone });
  await applyParsed(db, m, { deliveryId:id, type:'DELIVERED', orderId:'PRTRI' });
  return id;
}

test('receiver "haan aa gaya" reply records receiver_confirmed_at', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await delivered(db, '9810011111');
  const m = new MockMessenger();
  const out = await handleInboundWhatsApp(db, m, OWNER, { from: '91 98100 11111', body: 'haan bhai, aa gaya' });
  expect(out).toMatchObject({ kind:'receiver_confirm', deliveryId:id });
  const d:any = db.prepare('select receiver_confirmed_at from deliveries where id=?').get(id);
  expect(d.receiver_confirmed_at).not.toBeNull();
});

test('driver forwards a UPI id → stored on the delivery + owner is pinged (never auto-settled)', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await delivered(db, '9810022222', '9876512345');
  const m = new MockMessenger();
  const out = await handleInboundWhatsApp(db, m, OWNER, { from: '9876512345', body: 'sir mera number ramesh@okaxis hai' });
  expect(out).toMatchObject({ kind:'payment_upi', deliveryId:id });
  const d:any = db.prepare('select payment_upi_id, payment_status from deliveries where id=?').get(id);
  expect(d.payment_upi_id).toBe('ramesh@okaxis');
  expect(d.payment_status).toBe('pending');                 // money stays manual
  expect(m.sent.filter(s=>s.kind==='owner').length).toBe(1); // owner pinged to pay
});

test('driver forwards a QR image → stored as payment_qr_url', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await delivered(db, '9810033333', '9876599999');
  const m = new MockMessenger();
  const out = await handleInboundWhatsApp(db, m, OWNER, { from: '9876599999', mediaKind: 'image', mediaRef: '/inbound-media/qr.jpg' });
  expect(out).toMatchObject({ kind:'payment_qr', deliveryId:id });
  const d:any = db.prepare('select payment_qr_url from deliveries where id=?').get(id);
  expect(d.payment_qr_url).toBe('/inbound-media/qr.jpg');
});

test('an unknown number is stored but matches no delivery and changes nothing', async () => {
  const db = getDb(':memory:'); seedHome(db);
  await delivered(db, '9810044444');
  const m = new MockMessenger();
  const out = await handleInboundWhatsApp(db, m, OWNER, { from: '9999999999', body: 'random' });
  expect(out).toEqual({ kind:'other', deliveryId:null });
  const row:any = db.prepare('select * from inbound_messages order by id desc limit 1').get();
  expect(row.delivery_id).toBeNull();
  expect(m.sent.length).toBe(0);
});

test('a driver "done" must NOT be misread as the receiver confirming', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await delivered(db, '9810055555', '9876544444');
  const m = new MockMessenger();
  await handleInboundWhatsApp(db, m, OWNER, { from: '9876544444', body: 'done sir' }); // from the DRIVER
  const d:any = db.prepare('select receiver_confirmed_at from deliveries where id=?').get(id);
  expect(d.receiver_confirmed_at).toBeNull();
});

test('POST /whatsapp/inbound endpoint wires the handler + appears in /deliveries/:id', async () => {
  const db = getDb(':memory:'); seedHome(db);
  const id = await delivered(db, '9810066666');
  const app = express(); app.use(express.json());
  app.use(readRouter(db)); app.use(inboundRouter(db, new MockMessenger(), OWNER));
  const server = app.listen(0); const port = (server.address() as any).port; const base = `http://localhost:${port}`;
  const res = await (await fetch(`${base}/whatsapp/inbound`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ from:'9810066666', body:'aa gaya ji' }) })).json();
  expect(res).toMatchObject({ ok:true, kind:'receiver_confirm', deliveryId:id });
  const detail:any = await (await fetch(`${base}/deliveries/${id}`)).json();
  expect(detail.inbound.length).toBe(1);
  expect(detail.inbound[0].kind).toBe('receiver_confirm');
  server.close();
});
