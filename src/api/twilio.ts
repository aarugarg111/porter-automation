// src/api/twilio.ts
// Conversational inbound driver call via Twilio. Twilio POSTs form-encoded params (SpeechResult,
// Digits, From, …) each turn; we reply with TwiML and keep the conversation going until the driver
// arrives or we connect him to the owner. Decision logic = ../telephony/guide.ts.
import { Router, urlencoded } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { LandmarkKB } from '../landmarks/kb.js';
import { guideTurn, GREETING } from '../telephony/guide.js';
import { askTwiml, dialOwnerTwiml, hangupTwiml } from '../telephony/twiml.js';

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

function driverNameFor(db: DatabaseSync, fromPhone?: string): string | undefined {
  const f = norm(fromPhone);
  if (!f) return undefined;
  const rows = db.prepare(
    "select driver_name, driver_phone from deliveries where status not in ('DELIVERED','CANCELLED') and driver_phone is not null order by created_at desc",
  ).all() as any[];
  return rows.find((r) => norm(r.driver_phone) === f)?.driver_name || undefined;
}

export function twilioRouter(db: DatabaseSync, ownerPhone: string): Router {
  const r = Router();
  r.post('/voice/twilio-inbound', urlencoded({ extended: false }), (req, res) => {
    const digit = String(req.body?.Digits ?? '');
    const spoken = String(req.body?.SpeechResult ?? '');
    const attempt = Number(req.query?.n ?? req.body?.n ?? 0) || 0;
    const isOpening = !spoken && !digit && !req.query?.silent && attempt === 0;

    const send = (xml: string) => res.type('text/xml').send(xml);

    // Keypad "9" → owner, any time.
    if (digit === '9') { send(dialOwnerTwiml('Maalik se jod raha hoon, ek minute.', ownerPhone)); return; }

    // First turn: greet the driver (by name if we know him) and ask where he is.
    if (isOpening) {
      const name = driverNameFor(db, req.body?.From);
      const hello = name ? `Namaste ${name}! ${GREETING}` : GREETING;
      send(askTwiml(hello, 0));
      return;
    }

    // Subsequent turns: decide the next leg from what the driver said.
    const turn = guideTurn(spoken, { kb: new LandmarkKB(db), attempt });
    const nextN = turn.progressed ? 0 : attempt + 1; // reset the miss counter when we made progress
    if (turn.next === 'dial') { send(dialOwnerTwiml(turn.say, ownerPhone)); return; }
    if (turn.next === 'hangup') { send(hangupTwiml(turn.say)); return; }
    send(askTwiml(turn.say, nextN));
  });
  return r;
}
