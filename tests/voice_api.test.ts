import { test, expect } from 'vitest';
import express from 'express';
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
import { voiceRouter } from '../src/api/voice.js';

function appWith() {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const svc = new CoordinationService(db, {
    messenger: new WhatsAppMessenger(db, new FakeWhatsAppClient()),
    voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone:'9599157340' }),
    telephony: new FakeTelephonyProvider(),
    budget: new BudgetTracker(db, { paisePerMin:450, budgetPaise:200000 }),
    ownerPhone: '9599157340',
  });
  const app = express(); app.use(express.json()); app.use(voiceRouter(svc));
  const server = app.listen(0); const port = (server.address() as any).port;
  return { db, server, port };
}

test('POST /voice/inbound returns a speak turn for a known landmark', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/inbound`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ deliveryId:1, driverPhone:'9111', spoken:'pillar 25 ke paas' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.action).toBe('speak');
  server.close();
});

test('POST /voice/inbound rejects a missing driverPhone', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/inbound`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ spoken:'x' }) });
  expect(res.status).toBe(400);
  server.close();
});

test('POST /voice/confirm-receiver places an outbound call and returns placed', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/confirm-receiver`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ deliveryId:1, receiverPhone:'9222', orderId:'ORD-1' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.placed).toBe(true);
  expect(body.callId).toBeTruthy();
  server.close();
});

test('POST /voice/confirm-receiver rejects a missing orderId', async () => {
  const { server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/confirm-receiver`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ receiverPhone:'9222' }) });
  expect(res.status).toBe(400);
  server.close();
});

test('POST /voice/status records spend and returns ok', async () => {
  const { db, server, port } = appWith();
  const res = await fetch(`http://localhost:${port}/voice/status`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ deliveryId:1, direction:'IN', seconds:120, escalated:false }) });
  expect(res.status).toBe(200);
  const n = (db.prepare('select count(*) c from ai_call_spend').get() as any).c;
  expect(n).toBe(1);
  server.close();
});
