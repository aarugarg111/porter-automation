import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { VoiceAgent } from '../src/telephony/voice_agent.js';
import { FakeTelephonyProvider } from '../src/telephony/provider.js';

function agent() {
  const db = getDb(':memory:'); seedLandmarks(db);
  return new VoiceAgent(new LandmarkKB(db), { ownerPhone: '9599157340' });
}

test('confident landmark match → speak directions and send pin', () => {
  const turn = agent().inboundTurn('pillar 25 ke paas', { shouldEscalate: false });
  expect(turn.action).toBe('speak');
  expect(turn.say).toMatch(/Pillar/i);
  expect(turn.sendPin).toBe(true);
});

test('no landmark match → warm-transfer to owner', () => {
  const turn = agent().inboundTurn('pata nahi kahan hoon', { shouldEscalate: false });
  expect(turn.action).toBe('transfer');
  expect(turn.transferTo).toBe('9599157340');
});

test('budget says escalate → warm-transfer even if landmark matched', () => {
  const turn = agent().inboundTurn('canara bank ke paas', { shouldEscalate: true });
  expect(turn.action).toBe('transfer');
});

test('FakeTelephonyProvider records outbound calls and transfers', async () => {
  const p = new FakeTelephonyProvider();
  const { callId } = await p.placeOutboundCall({ toPhone:'9222', agentScript:'parcel aaya?' });
  await p.warmTransfer(callId, '9599157340');
  expect(p.calls).toHaveLength(1);
  expect(p.transfers[0]).toMatchObject({ callId, toPhone:'9599157340' });
});
