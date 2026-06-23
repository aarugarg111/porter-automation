import { test, expect } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { getDb } from '../src/db/index.js';
import { seedHome } from '../src/db/seed.js';
import { seedLandmarks } from '../src/landmarks/seed.js';
import { LandmarkKB } from '../src/landmarks/kb.js';
import { MockSttEngine, MockTtsEngine } from '../src/telephony/voice/mock.js';
import { attachMediaStream } from '../src/telephony/media_stream.js';

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

function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    (function tick() {
      if (pred()) return resolve();
      if (Date.now() > deadline) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 5);
    })();
  });
}

test('Media Streams agent: greets, guides on a landmark, and barges in', async () => {
  const { stt, tts, server, port } = await startAgent();
  const ws = new WebSocket(`ws://localhost:${port}/media-stream`);
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await new Promise((r) => ws.on('open', r));

  // Twilio "start" → the agent should greet (audio frames + a mark), no keypad IVR.
  ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ1', start: { callSid: 'CA1', customParameters: { from: '+919876500000', callSid: 'CA1' } } }));
  await waitFor(() => msgs.some((m) => m.event === 'mark'));
  expect(msgs.some((m) => m.event === 'media' && m.streamSid === 'MZ1')).toBe(true); // greeting was spoken
  expect(tts.spoken[0]).toMatch(/namaste/i);

  // Caller says a known landmark → that leg is spoken (no escalation).
  tts.spoken.length = 0;
  stt.last!.say('canara bank');
  await waitFor(() => tts.spoken.length > 0);
  expect(tts.spoken.join(' ')).toMatch(/Canara Bank se Faridabad/);

  // Barge-in: caller starts talking while the bot is mid-line → we flush Twilio's buffer (clear).
  const before = msgs.filter((m) => m.event === 'clear').length;
  stt.last!.speechStarted();
  await waitFor(() => msgs.filter((m) => m.event === 'clear').length > before);

  ws.close(); server.close();
});

test('Media Streams agent: an unknown location gets universal directions, NOT an escalation', async () => {
  const { stt, tts, server, port } = await startAgent();
  const ws = new WebSocket(`ws://localhost:${port}/media-stream`);
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ2', start: { callSid: 'CA2', customParameters: {} } }));
  await waitFor(() => msgs.some((m) => m.event === 'mark'));

  // This is the exact failure the user hit: an unrecognised first answer must guide, not dump to owner.
  tts.spoken.length = 0;
  stt.last!.say('main kisi anjaan jagah pe khada hoon');
  await waitFor(() => tts.spoken.length > 0);
  expect(tts.spoken.join(' ')).toMatch(/Mathura Road|Canara Bank|Pillar/); // universal waypoint
  expect(tts.spoken.join(' ')).not.toMatch(/maalik se baat/);              // NOT transferred

  ws.close(); server.close();
});

test('Media Streams agent: "dukaan dikh gaya" → arrival line then ends the call', async () => {
  const { stt, tts, server, port } = await startAgent();
  const ws = new WebSocket(`ws://localhost:${port}/media-stream`);
  const msgs: any[] = [];
  let closed = false;
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    msgs.push(m);
    if (m.event === 'mark') ws.send(JSON.stringify({ event: 'mark', streamSid: m.streamSid, mark: m.mark })); // echo like Twilio
  });
  ws.on('close', () => { closed = true; });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ event: 'start', streamSid: 'MZ3', start: { callSid: 'CA3', customParameters: {} } }));
  await waitFor(() => tts.spoken.length > 0); // greeting

  tts.spoken.length = 0;
  stt.last!.say('dukaan dikh gaya');
  await waitFor(() => tts.spoken.some((t) => /bahut badhiya/i.test(t)));
  await waitFor(() => closed); // arrival → hangup closes the stream

  server.close();
});
