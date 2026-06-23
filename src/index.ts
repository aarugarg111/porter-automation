// src/index.ts
import './config/load-env.js'; // load .env into process.env before anything reads it (must be first)
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb } from './db/index.js';
import { seedHome } from './db/seed.js';
import { seedLandmarks } from './landmarks/seed.js';
import { captureRouter } from './api/capture.js';
import { readRouter } from './api/read.js';
import { voiceRouter } from './api/voice.js';
import { WhatsAppMessenger } from './messenger/whatsapp.js';
import { WhatsAppWebClient, type WhatsAppClient } from './messenger/whatsapp_client.js';
import { BolnaAdapter } from './telephony/provider.js';
import { LoggingWhatsAppClient, LoggingTelephonyProvider } from './dev/logging.js';
import { VoiceAgent } from './telephony/voice_agent.js';
import { BudgetTracker } from './budget/tracker.js';
import { LandmarkKB } from './landmarks/kb.js';
import { CoordinationService } from './coordination/service.js';
import { sweepLateDeliveries } from './tracking/monitor.js';
import { sweepReceiverConfirmations } from './coordination/confirm_sweep.js';
import { inboundRouter } from './api/inbound.js';
import { twilioRouter } from './api/twilio.js';
import { voiceStreamRouter } from './api/voice_stream.js';
import { attachMediaStream } from './telephony/media_stream.js';
import { makeVoiceEngines, createBrain } from './telephony/voice/factory.js';
import { inboundMediaDir } from './messenger/whatsapp_client.js';
import { handleInboundWhatsApp } from './capture/inbound.js';

const db = getDb(); seedHome(db); seedLandmarks(db);
const live = process.env.PORTER_LIVE === '1';
// Live: real adapters (need phone + Bolna). Local/dev: logging adapters that print what would be sent.
const waClient: WhatsAppClient = live ? new WhatsAppWebClient() : new LoggingWhatsAppClient();
const telephony = live ? new BolnaAdapter() : new LoggingTelephonyProvider();
const messenger = new WhatsAppMessenger(db, waClient);
const ownerPhone = process.env.WHATSAPP_SELF || '9599157340';
const alertPhone = process.env.OWNER_ALERT_PHONE || ownerPhone; // human's number for late/payment alerts
const svc = new CoordinationService(db, {
  messenger, telephony, budget: new BudgetTracker(db),
  voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone }), ownerPhone });

// Live: route inbound WhatsApp (receiver confirmations + driver UPI/QR forwards) through the same handler.
waClient.onMessage?.((m) => {
  handleInboundWhatsApp(db, messenger, alertPhone, m).catch((e) => console.error('[inbound]', e));
});

const app = express(); app.use(express.json());

// Health check for hosting platforms (Render/Railway/Fly/headless box).
app.get('/health', (_req, res) => { res.json({ ok: true, live }); });

// Optional shared secret on the ingest endpoints. Once the backend is public, only the Porter
// phone (which sends `x-capture-token`) should be able to inject notifications / inbound messages.
// Unset CAPTURE_TOKEN → open (local dev + tests).
const captureToken = process.env.CAPTURE_TOKEN;
if (captureToken) {
  app.use(['/capture', '/whatsapp/inbound', '/api/capture', '/api/whatsapp/inbound'], (req, res, next) => {
    if (req.get('x-capture-token') === captureToken) { next(); return; }
    res.status(401).json({ error: 'unauthorized' });
  });
}

app.use('/inbound-media', express.static(inboundMediaDir)); // forwarded payment QRs for the dashboard

// Inbound driver call: VOICE_AGENT=1 → real-time streaming agent (<Connect><Stream>); else the IVR.
const voiceAgent = process.env.VOICE_AGENT === '1';

// API routers mounted at root (Android `/capture`, curl) AND under `/api` (the same-origin dashboard build).
for (const prefix of ['/', '/api']) {
  app.use(prefix, readRouter(db));
  app.use(prefix, captureRouter(db, messenger));
  app.use(prefix, voiceRouter(svc));
  app.use(prefix, inboundRouter(db, messenger, alertPhone));
  app.use(prefix, voiceAgent ? voiceStreamRouter() : twilioRouter(db, alertPhone, messenger));
}

// Single-box deploy: serve the built dashboard if present (hash routing → no SPA fallback needed).
const webDist = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (existsSync(webDist)) app.use(express.static(webDist));

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`cockpit on :${port} (live=${live}${voiceAgent ? ', voice-agent' : ''}${existsSync(webDist) ? ', serving dashboard' : ''})`));

// Real-time voice agent: attach the Twilio Media Streams WebSocket on the same port.
if (voiceAgent) {
  const { stt, tts, mode } = makeVoiceEngines();
  const kb = new LandmarkKB(db);
  const brainMode = process.env.LLM_API_KEY ? `llm:${process.env.LLM_MODEL || 'gemini-flash-latest'}` : 'rule-based';
  attachMediaStream(server, { db, stt, tts, kb, ownerPhone: alertPhone, makeBrain: () => createBrain(kb) });
  console.log(`[voice] media-stream agent attached at /media-stream (voice=${mode}, brain=${brainMode})`);
}

// Job 2: periodically alert the owner about deliveries running late (once each). In dev/fake
// mode this prints via the logging WhatsApp adapter. OWNER_ALERT_PHONE = the human's number.
const sweepMs = Number(process.env.LATE_SWEEP_MS ?? 60000);
setInterval(() => {
  sweepLateDeliveries(db, messenger, alertPhone).catch((e) => console.error('[late-sweep]', e));
}, sweepMs).unref();

// Job 4: opt-in AI confirmation call when the receiver hasn't replied on WhatsApp within the
// grace window. OFF by default (costs money) — set AUTO_CONFIRM_CALL=1 to enable.
if (process.env.AUTO_CONFIRM_CALL === '1') {
  setInterval(() => {
    sweepReceiverConfirmations(db, svc, messenger, alertPhone).catch((e) => console.error('[confirm-sweep]', e));
  }, sweepMs).unref();
}
