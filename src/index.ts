// src/index.ts
import express from 'express';
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
import { inboundRouter } from './api/inbound.js';
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
app.use('/inbound-media', express.static(inboundMediaDir)); // forwarded payment QRs for the dashboard
app.use(readRouter(db));
app.use(captureRouter(db, messenger));
app.use(voiceRouter(svc));
app.use(inboundRouter(db, messenger, alertPhone));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`cockpit on :${port} (live=${live})`));

// Job 2: periodically alert the owner about deliveries running late (once each). In dev/fake
// mode this prints via the logging WhatsApp adapter. OWNER_ALERT_PHONE = the human's number.
const sweepMs = Number(process.env.LATE_SWEEP_MS ?? 60000);
setInterval(() => {
  sweepLateDeliveries(db, messenger, alertPhone).catch((e) => console.error('[late-sweep]', e));
}, sweepMs).unref();
