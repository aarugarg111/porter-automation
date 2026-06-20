import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { FakeWhatsAppClient } from '../src/messenger/whatsapp_client.js';
import { WhatsAppMessenger } from '../src/messenger/whatsapp.js';

function setup() {
  const db = getDb(':memory:'); seedHome(db);
  const client = new FakeWhatsAppClient();
  return { db, client, m: new WhatsAppMessenger(db, client) };
}

test('sendDriverDirections sends a location pin and the landmark text', async () => {
  const { client, m } = setup();
  await m.sendDriverDirections('9111', 'Pillar 25 ke saamne');
  const kinds = client.sent.map(s => s.kind);
  expect(kinds).toContain('location');
  expect(kinds).toContain('text');
  const loc = client.sent.find(s => s.kind === 'location')!;
  expect(loc.extra.lat).toBeCloseTo(28.5000777, 4);
  const text = client.sent.find(s => s.kind === 'text')!;
  expect(text.extra).toMatch(/Pillar 25/);
});

test('confirmReceiver sends a Hindi confirmation text', async () => {
  const { client, m } = setup();
  await m.confirmReceiver('9222', 'ORD-1');
  const text = client.sent.find(s => s.kind === 'text');
  expect(text!.phone).toBe('9222');
  expect(text!.extra).toMatch(/ORD-1/);
});

test('notifyReceiverPayment formats rupees from paise', async () => {
  const { client, m } = setup();
  await m.notifyReceiverPayment('9333', 14800);
  const text = client.sent.find(s => s.kind === 'text');
  expect(text!.extra).toMatch(/148/);
});

test('missing photo/voice assets degrade to text without throwing', async () => {
  const { client, m } = setup();
  await expect(m.sendDriverDirections('9444', 'x')).resolves.not.toThrow();
  // image/voice only attempted if asset exists; with no assets none are sent
  expect(client.sent.find(s => s.kind === 'image')).toBeUndefined();
});
