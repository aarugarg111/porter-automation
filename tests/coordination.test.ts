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

function build(budgetOpts = {}) {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const client = new FakeWhatsAppClient();
  const deps = {
    messenger: new WhatsAppMessenger(db, client),
    voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone:'9599157340' }),
    telephony: new FakeTelephonyProvider(),
    budget: new BudgetTracker(db, { paisePerMin:450, budgetPaise:200000, now:()=>new Date('2026-06-15T00:00:00Z'), ...budgetOpts }),
    ownerPhone: '9599157340',
  };
  return { db, client, deps, svc: new CoordinationService(db, deps) };
}

test('confident inbound → speaks directions AND WhatsApps the pin to the driver', async () => {
  const { client, svc } = build();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25 ke paas', estSeconds:90 });
  expect(turn.action).toBe('speak');
  expect(client.sent.find(s => s.kind==='location')).toBeDefined();
});

test('no match → transfer instruction, no WhatsApp pin', async () => {
  const { client, svc } = build();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'connaught place', estSeconds:90 });
  expect(turn.action).toBe('transfer');
  expect(turn.transferTo).toBe('9599157340');
  expect(client.sent.find(s => s.kind==='location')).toBeUndefined();
});

test('budget near cap → transfer even with a good landmark', async () => {
  const { db, svc } = build();
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'IN',1200,180000,0,'2026-06-10T00:00:00Z')").run();
  const turn = await svc.handleDriverInbound({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25', estSeconds:90 });
  expect(turn.action).toBe('transfer');
});

test('recordCall persists spend and returns paise charged', async () => {
  const { svc } = build();
  const paise = svc.recordCall({ deliveryId:1, direction:'IN', seconds:90, escalated:false });
  expect(paise).toBe(900);
});

test('confirmReceiverByCall places an outbound AI call when budget allows', async () => {
  const { deps, svc } = build();
  const r = await svc.confirmReceiverByCall({ deliveryId:1, receiverPhone:'9222', orderId:'ORD-1', estSeconds:60 });
  expect(r.placed).toBe(true);
  expect(r.escalated).toBe(false);
  expect(r.callId).toBeTruthy();
  const fake = deps.telephony as any;
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0].toPhone).toBe('9222');
  expect(fake.calls[0].agentScript).toMatch(/ORD-1/);
});

test('confirmReceiverByCall does NOT place a paid call when budget says escalate', async () => {
  const { db, deps, svc } = build();
  db.prepare("insert into ai_call_spend (delivery_id,direction,seconds,paise,escalated,created_at) values (1,'OUT',1200,180000,0,'2026-06-10T00:00:00Z')").run();
  const r = await svc.confirmReceiverByCall({ deliveryId:1, receiverPhone:'9222', orderId:'ORD-1', estSeconds:60 });
  expect(r.placed).toBe(false);
  expect(r.escalated).toBe(true);
  expect((deps.telephony as any).calls).toHaveLength(0);
});
