// src/index.ts
import express from 'express';
import { getDb } from './db/index.js';
import { seedHome } from './db/seed.js';
import { seedLandmarks } from './landmarks/seed.js';
import { captureRouter } from './api/capture.js';
import { readRouter } from './api/read.js';
import { voiceRouter } from './api/voice.js';
import { WhatsAppMessenger } from './messenger/whatsapp.js';
import { WhatsAppWebClient } from './messenger/whatsapp_client.js';
import { BolnaAdapter } from './telephony/provider.js';
import { LoggingWhatsAppClient, LoggingTelephonyProvider } from './dev/logging.js';
import { VoiceAgent } from './telephony/voice_agent.js';
import { BudgetTracker } from './budget/tracker.js';
import { LandmarkKB } from './landmarks/kb.js';
import { CoordinationService } from './coordination/service.js';

const db = getDb(); seedHome(db); seedLandmarks(db);
const live = process.env.PORTER_LIVE === '1';
// Live: real adapters (need phone + Bolna). Local/dev: logging adapters that print what would be sent.
const waClient = live ? new WhatsAppWebClient() : new LoggingWhatsAppClient();
const telephony = live ? new BolnaAdapter() : new LoggingTelephonyProvider();
const messenger = new WhatsAppMessenger(db, waClient);
const ownerPhone = process.env.WHATSAPP_SELF || '9599157340';
const svc = new CoordinationService(db, {
  messenger, telephony, budget: new BudgetTracker(db),
  voice: new VoiceAgent(new LandmarkKB(db), { ownerPhone }), ownerPhone });

const app = express(); app.use(express.json());
app.use(readRouter(db));
app.use(captureRouter(db, messenger));
app.use(voiceRouter(svc));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`cockpit on :${port} (live=${live})`));
