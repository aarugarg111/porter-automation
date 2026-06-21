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
import { askTwiml, dialOwnerTwiml, hangupTwiml, forSpeech, e164 } from '../src/telephony/twiml.js';
import { twilioRouter } from '../src/api/twilio.js';

// ---- pure decision logic ----
function kb() { const db = getDb(':memory:'); seedHome(db); seedLandmarks(db); return new LandmarkKB(db); }

test('guideTurn: recognised landmark → speaks that leg and keeps listening', () => {
  const t = guideTurn('main canara bank ke paas hoon', { kb: kb(), attempt: 0 });
  expect(t.next).toBe('gather');
  expect(t.progressed).toBe(true);
  expect(t.say).toMatch(/Canara Bank se Faridabad/);
});

test('guideTurn: "BK" / Badarpur Border → routed toward the waypoint', () => {
  const t = guideTurn('abhi BK pe hoon', { kb: kb(), attempt: 0 });
  expect(t.next).toBe('gather');
  expect(t.say).toMatch(/Mathura Road|Canara Bank/);
});

test('guideTurn: arrived → confirm + hang up', () => {
  const t = guideTurn('haan pohonch gaya', { kb: kb(), attempt: 1 });
  expect(t.next).toBe('hangup');
  expect(t.say).toMatch(/saamne|Bosch/);
});

test('guideTurn: unrecognised first → waypoint; second → connect owner', () => {
  expect(guideTurn('pata nahi kahan', { kb: kb(), attempt: 0 }).next).toBe('gather');
  expect(guideTurn('still no idea', { kb: kb(), attempt: 1 }).next).toBe('dial');
});

test('guideTurn: silence escalates to the owner after retries', () => {
  expect(guideTurn('', { kb: kb(), attempt: 0 }).next).toBe('gather');
  expect(guideTurn('', { kb: kb(), attempt: 2 }).next).toBe('dial');
});

// ---- TwiML builders ----
test('askTwiml gathers Hindi speech + keypad and loops on silence', () => {
  const xml = askTwiml('Aap kahaan ho?', 0);
  expect(xml).toContain('input="speech dtmf"');
  expect(xml).toContain('language="hi-IN"');
  expect(xml).toContain('Polly.Aditi');
  expect(xml).toContain('action="/voice/twilio-inbound?n=0"');
  expect(xml).toContain('<Redirect');           // silence → loops back with n+1
  expect(xml).toContain('Aap kahaan ho');
});
test('dialOwnerTwiml dials E.164; hangupTwiml hangs up; helpers', () => {
  expect(dialOwnerTwiml('jod raha hoon', '9910774205')).toContain('<Dial>+919910774205</Dial>');
  expect(hangupTwiml('dhanyavaad')).toContain('<Hangup/>');
  expect(e164('9910774205')).toBe('+919910774205');
  expect(forSpeech('A+B; C')).toBe('A aur B. C');
});

// ---- endpoint (a real call's turns) ----
async function app() {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const a = express(); a.use(twilioRouter(db, '9910774205'));
  const server = a.listen(0); const port = (server.address() as any).port;
  return { db, base: `http://localhost:${port}`, server };
}
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

test('opening turn greets and asks where the driver is', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876500000', CallSid: 'CA1' }))).text();
  expect(xml).toMatch(/landmark ke paas/);
  expect(xml).toContain('input="speech dtmf"');
  server.close();
});

test('driver says a landmark → AI speaks that leg', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound?n=0`, form({ SpeechResult: 'canara bank ke paas' }))).text();
  expect(xml).toMatch(/Canara Bank se Faridabad/);
  expect(xml).toContain('<Gather'); // conversation continues
  server.close();
});

test('driver says he arrived → AI confirms and hangs up', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound?n=0`, form({ SpeechResult: 'bhai main pohonch gaya' }))).text();
  expect(xml).toContain('<Hangup/>');
  server.close();
});

test('pressing 9 connects to the owner', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ Digits: '9' }))).text();
  expect(xml).toContain('<Dial>+919910774205</Dial>');
  server.close();
});

test('repeated silence connects to the owner', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound?n=2&silent=1`, form({}))).text();
  expect(xml).toContain('<Dial>');
  server.close();
});

test('greets the driver by name when the caller matches an active delivery', async () => {
  const { db, base, server } = await app();
  const recv = createLocation(db, { nickname: 'Cust', relationship: 'customer', phone: '9810000000' }) as number;
  const id = createIntent(db, { direction: 'SEND', otherLocationId: recv });
  await applyParsed(db, new MockMessenger(), { deliveryId: id, type: 'ASSIGNED', orderId: 'PRTRZ', driverName: 'Suresh', driverPhone: '9876512345' });
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876512345' }))).text();
  expect(xml).toContain('Namaste Suresh');
  server.close();
});
