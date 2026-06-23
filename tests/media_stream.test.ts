import { test, expect, beforeAll } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { MockSttEngine, MockTtsEngine } from '../src/telephony/voice/mock.js';
import { attachMediaStream } from '../src/telephony/media_stream.js';

beforeAll(() => { process.env.VOICE_ECHO_GRACE_MS = '0'; }); // no echo-grace delay in tests

function startAgent() {
  const db = getDb(':memory:'); seedHome(db); seedLandmarks(db);
  const stt = new MockSttEngine();
  const tts = new MockTtsEngine();
  const server = http.createServer();
  attachMediaStream(server, { db, stt, tts, kb: new LandmarkKB(db), ownerPhone: '9910774205' });
  return new Promise<{ db: any; stt: MockSttEngine; tts: MockTtsEngine; server: http.Server; port: number }>(
    (resolve) => server.listen(0, () => resolve({ db, stt, tts, server, port: (server.address() as any).port })),
  );
}

function waitFor(pred: () => boolean, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    (function tick() {
      if (pred()) return resolve();
      if (Date.now() > deadline) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 5);
    })();
  });
}

// A client that echoes Twilio's `mark` back (so the agent leaves "speaking" and starts listening — the
// real Twilio behaviour). `doneSpeaking()` resolves after the next mark is echoed.
function connect(port: number) {
  const ws = new WebSocket(`ws://localhost:${port}/media-stream`);
  const msgs: any[] = [];
  let markCount = 0;
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    if (m.event === 'mark') { markCount++; ws.send(JSON.stringify({ event: 'mark', streamSid: m.streamSid, mark: m.mark })); }
  });
  return {
    ws, msgs,
    open: () => new Promise((r) => ws.on('open', r)),
    doneSpeaking: async () => { const at = markCount; await waitFor(() => markCount > at); await new Promise((r) => setTimeout(r, 10)); },
  };
}

test('greets, then guides on a known landmark (half-duplex: listens only after it finishes)', async () => {
  const { stt, tts, server, port } = await startAgent();
  const c = connect(port);
  await c.open();
  c.ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ1', start: { callSid: 'CA1', customParameters: { from: '+919876500000' } } }));
  await c.doneSpeaking();                                    // greeting played out
  expect(c.msgs.some((m) => m.event === 'media')).toBe(true);
  expect(tts.spoken[0]).toMatch(/namaste/i);

  tts.spoken.length = 0;
  stt.last!.say('canara bank');
  await waitFor(() => tts.spoken.length > 0);
  expect(tts.spoken.join(' ')).toMatch(/Canara Bank se Faridabad/);
  c.ws.close(); server.close();
});

test('a transcript heard WHILE the bot is speaking is ignored (echo guard)', async () => {
  const { stt, tts, server, port } = await startAgent();
  const c = connect(port);
  await c.open();
  c.ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ4', start: { callSid: 'CA4', customParameters: {} } }));
  // Do NOT wait for the greeting to finish — speak over it. This is the echo-loop scenario.
  await waitFor(() => tts.spoken.length > 0);   // greeting in progress (speaking = true)
  tts.spoken.length = 0;
  stt.last!.say('canara bank');                 // arrives mid-greeting → must be ignored
  await new Promise((r) => setTimeout(r, 150));
  expect(tts.spoken.length).toBe(0);            // bot did NOT respond to its own echo
  c.ws.close(); server.close();
});

test('an unknown location gets universal directions, NOT an escalation', async () => {
  const { stt, tts, server, port } = await startAgent();
  const c = connect(port);
  await c.open();
  c.ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ2', start: { callSid: 'CA2', customParameters: {} } }));
  await c.doneSpeaking();
  tts.spoken.length = 0;
  stt.last!.say('main kisi anjaan jagah pe khada hoon');
  await waitFor(() => tts.spoken.length > 0);
  expect(tts.spoken.join(' ')).toMatch(/Mathura Road|Canara Bank|Pillar/); // universal waypoint
  expect(tts.spoken.join(' ')).not.toMatch(/maalik se baat/);              // NOT transferred
  c.ws.close(); server.close();
});

test('"dukaan dikh gaya" → arrival line then ends the call', async () => {
  const { stt, tts, server, port } = await startAgent();
  const c = connect(port);
  let closed = false;
  c.ws.on('close', () => { closed = true; });
  await c.open();
  c.ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ3', start: { callSid: 'CA3', customParameters: {} } }));
  await c.doneSpeaking();
  stt.last!.say('dukaan dikh gaya');
  await waitFor(() => tts.spoken.some((t) => /bahut badhiya/i.test(t)));
  await waitFor(() => closed); // arrival → hangup closes the stream
  server.close();
});
