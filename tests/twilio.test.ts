import { test, expect } from 'vitest';
import express from 'express';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { MockMessenger } from '../src/messenger/mock.js';
import { greetingTwiml, dialOwnerTwiml, forSpeech, e164 } from '../src/telephony/twiml.js';
import { twilioRouter } from '../src/api/twilio.js';

test('forSpeech cleans the curated landmark string for TTS', () => {
  expect(forSpeech('A+B; C')).toBe('A aur B. C');
});

test('e164 assumes India for a bare 10-digit number', () => {
  expect(e164('9910774205')).toBe('+919910774205');
  expect(e164('+14155550123')).toBe('+14155550123');
});

test('greetingTwiml speaks the directions in Hindi + offers the menu', () => {
  const xml = greetingTwiml('Pillar 25 ke saamne; Bosch+Havells board', 'Ramesh');
  expect(xml).toContain('<Response>');
  expect(xml).toContain('language="hi-IN"');
  expect(xml).toContain('Polly.Aditi');
  expect(xml).toContain('Namaste Ramesh');
  expect(xml).toContain('Pillar 25 ke saamne. Bosch aur Havells board'); // speechified
  expect(xml).toContain('ek dabaaiye');  // press 1 to repeat
  expect(xml).toContain('nau dabaaiye'); // press 9 for owner
  expect(xml).toContain('<Gather');
});

test('dialOwnerTwiml dials the owner in E.164', () => {
  expect(dialOwnerTwiml('9910774205')).toContain('<Dial>+919910774205</Dial>');
});

async function app() {
  const db = getDb(':memory:'); seedHome(db);
  const a = express();
  a.use(twilioRouter(db, '9910774205'));
  const server = a.listen(0);
  const port = (server.address() as any).port;
  return { db, base: `http://localhost:${port}`, server };
}
const form = (o: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(o).toString(),
});

test('POST /voice/twilio-inbound answers with the seeded shop directions', async () => {
  const { base, server } = await app();
  const res = await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876500000', CallSid: 'CA1' }));
  expect(res.headers.get('content-type')).toMatch(/xml/);
  const xml = await res.text();
  expect(xml).toContain('Metro Pillar 25 ke saamne'); // from the HOME seed
  expect(xml).toContain('<Gather');
  server.close();
});

test('pressing 9 dials the owner', async () => {
  const { base, server } = await app();
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876500000', Digits: '9' }))).text();
  expect(xml).toContain('<Dial>+919910774205</Dial>');
  server.close();
});

test('greets the driver by name when the caller matches an assigned delivery', async () => {
  const { db, base, server } = await app();
  const recv = createLocation(db, { nickname: 'Cust', relationship: 'customer', phone: '9810000000' }) as number;
  const id = createIntent(db, { direction: 'SEND', otherLocationId: recv });
  await applyParsed(db, new MockMessenger(), { deliveryId: id, type: 'ASSIGNED', orderId: 'PRTRZ', driverName: 'Suresh', driverPhone: '9876512345' });
  const xml = await (await fetch(`${base}/voice/twilio-inbound`, form({ From: '+919876512345' }))).text();
  expect(xml).toContain('Namaste Suresh');
  server.close();
});
