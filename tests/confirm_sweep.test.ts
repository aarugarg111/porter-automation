import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { BudgetTracker } from '../src/budget/tracker.js';
import { VoiceAgent } from '../src/telephony/voice_agent.js';
import { FakeTelephonyProvider } from '../src/telephony/provider.js';
import { FakeWhatsAppClient } from '../src/messenger/whatsapp_client.js';
import { WhatsAppMessenger } from '../src/messenger/whatsapp.js';
import { CoordinationService } from '../src/coordination/service.js';
import { createLocation } from '../src/locations/repo.js';
import { createIntent, applyParsed } from '../src/deliveries/service.js';
import { handleInboundWhatsApp } from '../src/capture/inbound.js';
import { sweepReceiverConfirmations } from '../src/coordination/confirm_sweep.js';

function build(budgetOpts = {}) {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const client = new FakeWhatsAppClient();
  const messenger = new WhatsAppMessenger(db, client);
  const deps = {
    messenger,
    voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone: '9599157340' }),
    telephony: new FakeTelephonyProvider(),
    budget: new BudgetTracker(db, { paisePerMin: 450, budgetPaise: 200000, now: () => new Date('2026-06-15T00:00:00Z'), ...budgetOpts }),
    ownerPhone: '9599157340',
  };
  return { db, client, messenger, deps, svc: new CoordinationService(db, deps) };
}

// SEND delivery to a receiver with `phone`, driven to DELIVERED.
async function delivered(db: any, messenger: any, phone = '9222') {
  const recv = createLocation(db, { nickname: 'Recv', relationship: 'customer', phone }) as number;
  const id = createIntent(db, { direction: 'SEND', otherLocationId: recv });
  await applyParsed(db, messenger, { deliveryId: id, type: 'ASSIGNED', orderId: 'ORD1', driverName: 'D', driverPhone: '9111' });
  await applyParsed(db, messenger, { deliveryId: id, type: 'DELIVERED', orderId: 'ORD1' });
  return id;
}

const future = (mins: number) => Date.now() + mins * 60000;

test('DELIVERED stamps delivered_at', async () => {
  const { db, messenger } = build();
  const id = await delivered(db, messenger);
  const d: any = db.prepare('select delivered_at from deliveries where id=?').get(id);
  expect(d.delivered_at).not.toBeNull();
});

test('no WhatsApp confirmation past the grace window → one budget-gated call, then idempotent', async () => {
  const { db, deps, messenger, svc } = build();
  const id = await delivered(db, messenger, '9222');

  const res = await sweepReceiverConfirmations(db, svc, messenger, '9599157340', future(60), 15);
  expect(res).toEqual([{ id, placed: true, escalated: false }]);
  const fake = deps.telephony as any;
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].toPhone).toBe('9222');
  const d: any = db.prepare('select receiver_call_at from deliveries where id=?').get(id);
  expect(d.receiver_call_at).not.toBeNull();

  // second sweep must not re-dial
  const again = await sweepReceiverConfirmations(db, svc, messenger, '9599157340', future(70), 15);
  expect(again).toHaveLength(0);
  expect(fake.calls).toHaveLength(1);
});

test('receiver already confirmed on WhatsApp → no AI call', async () => {
  const { db, deps, messenger, svc } = build();
  const id = await delivered(db, messenger, '9222');
  await handleInboundWhatsApp(db, messenger, '9599157340', { from: '9222', body: 'haan aa gaya' });
  expect(db.prepare('select receiver_confirmed_at from deliveries where id=?').get(id)).not.toMatchObject({ receiver_confirmed_at: null });

  const res = await sweepReceiverConfirmations(db, svc, messenger, '9599157340', future(60), 15);
  expect(res).toHaveLength(0);
  expect((deps.telephony as any).calls).toHaveLength(0);
});

test('still within the grace window → no call yet', async () => {
  const { db, deps, messenger, svc } = build();
  await delivered(db, messenger, '9222');
  const res = await sweepReceiverConfirmations(db, svc, messenger, '9599157340', Date.now(), 15);
  expect(res).toHaveLength(0);
  expect((deps.telephony as any).calls).toHaveLength(0);
});

test('over budget → no paid call, owner is asked to confirm manually, not retried', async () => {
  const { db, client, deps, messenger, svc } = build();
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'OUT',1200,180000,0,'2026-06-10T00:00:00Z')").run();
  const id = await delivered(db, messenger, '9222');

  const res = await sweepReceiverConfirmations(db, svc, messenger, '9599157340', future(60), 15);
  expect(res).toEqual([{ id, placed: false, escalated: true }]);
  expect((deps.telephony as any).calls).toHaveLength(0);
  // owner got a manual-confirm nudge
  expect(client.sent.some((s) => s.kind === 'text' && /Couldn't auto-call/.test(s.extra))).toBe(true);
  // marked so it won't retry forever
  const d: any = db.prepare('select receiver_call_at from deliveries where id=?').get(id);
  expect(d.receiver_call_at).not.toBeNull();
});
