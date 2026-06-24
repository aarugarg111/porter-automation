import { test, expect } from 'vitest';
import { getDb } from '../src/db/index.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { LlmBrain } from '../src/telephony/voice/llm_brain.js';
import { MockChat, type ChatMessage } from '../src/telephony/voice/llm.js';

function kb() { const db = getDb(':memory:'); seedLandmarks(db); return new LandmarkKB(db); }

test('speaks the model reply and grounds the system prompt in shop + routes', async () => {
  let seen: ChatMessage[] = [];
  const brain = new LlmBrain(new MockChat((_u, m) => { seen = m; return 'Achha, Canara Bank ki taraf aa jao.'; }), kb());
  expect(await brain.greeting()).toMatch(/नमस्ते/);
  const r = await brain.onTranscript('main pillar 25 pe hoon');
  expect(r).toEqual({ say: 'Achha, Canara Bank ki taraf aa jao.', action: 'speak' });
  expect(seen[0].role).toBe('system');
  expect(seen[0].content).toMatch(/Aryan Enterprises/);
  expect(seen[0].content).toMatch(/Canara Bank/);            // route knowledge injected
  expect(seen.some((m) => m.role === 'user' && m.content === 'main pillar 25 pe hoon')).toBe(true);
});

test('[ARRIVED] → hangup (tag stripped); [CONNECT] → transfer', async () => {
  const arrived = new LlmBrain(new MockChat(() => 'Bahut badhiya, aa jaiye! [ARRIVED]'), kb());
  expect(await arrived.onTranscript('dukaan dikh gayi')).toEqual({ say: 'Bahut badhiya, aa jaiye!', action: 'hangup' });
  const connect = new LlmBrain(new MockChat(() => 'Ek minute, maalik se jod raha hoon. [CONNECT]'), kb());
  expect(await connect.onTranscript('samajh nahi aa raha')).toEqual({ say: 'Ek minute, maalik se jod raha hoon.', action: 'transfer' });
});

test('uncorroborated [ARRIVED] on a garbled turn does NOT end the call (real call 2026-06-23 regression)', async () => {
  // STT mis-heard "hello" as garbage; model wrongly tagged [ARRIVED]. Driver said nothing about arriving.
  const brain = new LlmBrain(new MockChat(() => 'Aap aa gaye, badhiya! [ARRIVED]'), kb());
  const r = await brain.onTranscript('तो मैं तो जाऊंगा बस से आके आऊंगा।');
  expect(r.action).toBe('speak'); // downgraded — driver never signalled arrival
});

test('uncorroborated [CONNECT] early does NOT transfer/cut the call', async () => {
  const brain = new LlmBrain(new MockChat(() => 'Maalik se jod raha hoon. [CONNECT]'), kb());
  const r = await brain.onTranscript('main pillar 25 ke paas hoon'); // a location, not "I am lost"
  expect(r.action).toBe('speak');
});

test('map grounding: an UNKNOWN landmark gets a live map hint passed to the model', async () => {
  let seen: ChatMessage[] = [];
  const maps = { locate: async () => ({ name: 'Prahladpur Metro', address: 'Prahladpur, Delhi', distM: 1500, dirToShop: 'south' }) };
  const brain = new LlmBrain(new MockChat((_u, m) => { seen = m; return 'theek hai.'; }), kb(), maps);
  await brain.onTranscript('main prahladpur metro ke paas hoon');
  expect(seen.some((m) => m.role === 'system' && /MAP DATA/.test(m.content) && /Prahladpur/.test(m.content))).toBe(true);
});

test('map grounding: a CURATED landmark (Muthoot) skips the maps call', async () => {
  let called = false;
  const maps = { locate: async () => { called = true; return null; } };
  const brain = new LlmBrain(new MockChat(() => 'theek hai.'), kb(), maps);
  await brain.onTranscript('main muthoot finance ke paas hoon'); // curated → maps NOT called
  expect(called).toBe(false);
});

test('LLM error → graceful re-prompt, never crashes the call', async () => {
  const brain = new LlmBrain(new MockChat(() => { throw new Error('boom'); }), kb());
  const r = await brain.onTranscript('hello');
  expect(r.action).toBe('speak');
  expect(r.say.length).toBeGreaterThan(0);
});

test('multi-turn keeps conversation history (model sees prior turns)', async () => {
  let lastLen = 0;
  const brain = new LlmBrain(new MockChat((_u, m) => { lastLen = m.length; return 'theek hai.'; }), kb());
  await brain.onTranscript('ek');
  await brain.onTranscript('do');
  expect(lastLen).toBeGreaterThan(3); // system + user/assistant/user…
});
