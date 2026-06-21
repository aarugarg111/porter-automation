import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { guideTurn } from '../src/telephony/guide.js';
import { askTwiml, askNumberTwiml, dialOwnerTwiml, hangupTwiml, forSpeech, e164 } from '../src/telephony/twiml.js';
import { twilioRouter } from '../src/api/twilio.js';

function kb() { const db = getDb(':memory:'); seedHome(db); seedLandmarks(db); return new LandmarkKB(db); }

// ---- decision logic ----
test('guideTurn: recognised landmark → next leg; "BK" → waypoint; arrived → hangup', () => {
  expect(guideTurn('canara bank ke paas', { kb: kb(), attempt: 0 })).toMatchObject({ next: 'gather', progressed: true });
  expect(guideTurn('abhi BK pe hoon', { kb: kb(), attempt: 0 }).say).toMatch(/Mathura Road|Canara Bank/);
  expect(guideTurn('haan pohonch gaya', { kb: kb(), attempt: 1 }).next).toBe('hangup');
});
test('guideTurn: unrecognised/silence escalates to owner', () => {
  expect(guideTurn('blah blah', { kb: kb(), attempt: 1 }).next).toBe('dial');
  expect(guideTurn('', { kb: kb(), attempt: 2 }).next).toBe('dial');
});

// ---- TwiML builders ----
test('askTwiml gathers Hindi speech (guide step) + loops on silence', () => {
  const xml = askTwiml('Aap kahaan ho?', 0);
  expect(xml).toContain('input="speech dtmf"');
  expect(xml).toContain('action="/voice/twilio-inbound?step=guide&amp;n=0"');
  expect(xml).toContain('<Redirect');
});
test('askNumberTwiml gathers 10 keypad digits for the WhatsApp number', () => {
  const xml = askNumberTwiml('Number daaliye');
  expect(xml).toContain('input="dtmf"');
  expect(xml).toContain('numDigits="10"');
  expect(xml).toContain('step=number');
});
test('dial/hangup/helpers', () => {
  expect(dialOwnerTwiml('x', '9910774205')).toContain('<Dial>+919910774205</Dial>');
  expect(hangupTwiml('y')).toContain('<Hangup/>');
  expect(e164('9910774205')).toBe('+919910774205');
  expect(forSpeech('A+B; C')).toBe('A aur B. C');
});

// ---- endpoint ----
function build() {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const m = new MockMessenger();
  const a = express(); a.use(twilioRouter(db, '9910774205', m));
  const server = a.listen(0); const port = (server.address() as any).port;
  return { db, m, base: `http://localhost:${port}`, server };
}
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

test('opening turn greets + asks for the WhatsApp number on the keypad', async () => {
  const { base, server } = build();
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876500000', CallSid: 'CA1' }))).text();
  expect(xml).toMatch(/WhatsApp number/);
  expect(xml).toContain('numDigits="10"');
  server.close();
});

test('driver enters his WhatsApp number → we send the shop location/photo + move to guidance', async () => {
  const { db, m, base, server } = build();
  const recv = createLocation(db, { nickname: 'C', relationship: 'customer', phone: '9810000000' }) as number;
  const id = createIntent(db, { direction: 'SEND', otherLocationId: recv });
  await applyParsed(db, m, { deliveryId: id, type: 'ASSIGNED', orderId: 'PRTRA', driverName: 'D', driverPhone: '9876512345' });
  m.sent.length = 0;
  const xml = await (await fetch(`${base}/voice/twilio-inbound?step=number`, form({ From: '+910000000000', Digits: '9123456780', CallSid: 'CA2' }))).text();
  expect(m.sent.some((s) => s.kind === 'directions' && s.phone === '9123456780')).toBe(true); // WhatsApp location/photo sent
  expect(xml).toMatch(/landmark ke paas/); // continues to voice guidance
  const d: any = db.prepare('select driver_whatsapp from deliveries where id=?').get(id);
  expect(d.driver_whatsapp).toBe('9123456780');
  server.close();
});

test('driver says a landmark → AI speaks that leg; arrived → hangup', async () => {
  const { base, server } = build();
  const leg = await (await fetch(`${base}/voice/twilio-inbound?step=guide&n=0`, form({ SpeechResult: 'canara bank' }))).text();
  expect(leg).toMatch(/Canara Bank se Faridabad/);
  const done = await (await fetch(`${base}/voice/twilio-inbound?step=guide&n=0`, form({ SpeechResult: 'dukaan dikh gaya' }))).text();
  expect(done).toContain('<Hangup/>');
  server.close();
});

test('press 9 during guidance → owner; repeated silence → owner', async () => {
  const { base, server } = build();
  expect(await (await fetch(`${base}/voice/twilio-inbound?step=guide`, form({ Digits: '9' }))).text()).toContain('<Dial>');
  expect(await (await fetch(`${base}/voice/twilio-inbound?step=guide&n=2&silent=1`, form({}))).text()).toContain('<Dial>');
  server.close();
});

test('the call is logged + linked to the active delivery (turns accumulate by CallSid)', async () => {
  const { db, base, server } = build();
  const recv = createLocation(db, { nickname: 'C', relationship: 'customer', phone: '9810000000' }) as number;
  const id = createIntent(db, { direction: 'SEND', otherLocationId: recv });
  await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876512345', CallSid: 'CAX' }));
  await fetch(`${base}/voice/twilio-inbound?step=guide&n=0`, form({ SpeechResult: 'canara bank', CallSid: 'CAX' }));
  const call: any = db.prepare('select * from driver_calls where call_sid=?').get('CAX');
  expect(call.delivery_id).toBe(id);
  expect(call.turns).toBe(2);
  server.close();
});
