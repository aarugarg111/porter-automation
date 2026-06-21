// src/api/twilio.ts
// Conversational inbound driver call via Twilio. Steps per call:
//   1. greet + capture the driver's REAL WhatsApp number on the keypad (Porter masks caller ID) →
//      send the shop location pin + shopfront photo to it.
//   2. voice-guide him in turn by turn (speech → landmark KB → next leg) until he arrives.
// Every turn is logged + linked to the right delivery (several can be active). "9" → owner.
import { Router, urlencoded } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import { LandmarkKB } from '../landmarks/kb.js';
import { guideTurn, GREETING } from '../telephony/guide.js';
import { askTwiml, askNumberTwiml, dialOwnerTwiml, hangupTwiml } from '../telephony/twiml.js';
import { logCallTurn, saveDriverWhatsapp } from '../telephony/call_log.js';

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

function driverNameFor(db: DatabaseSync, fromPhone?: string): string | undefined {
  const f = norm(fromPhone);
  if (!f) return undefined;
  const rows = db.prepare(
    "select driver_name, driver_phone from deliveries where status not in ('DELIVERED','CANCELLED') and driver_phone is not null order by created_at desc",
  ).all() as any[];
  return rows.find((r) => norm(r.driver_phone) === f)?.driver_name || undefined;
}

export function twilioRouter(db: DatabaseSync, ownerPhone: string, messenger: Messenger): Router {
  const r = Router();
  r.post('/voice/twilio-inbound', urlencoded({ extended: false }), async (req, res) => {
    const step = String(req.query?.step ?? '');
    const digits = String(req.body?.Digits ?? '');
    const spoken = String(req.body?.SpeechResult ?? '');
    const from = String(req.body?.From ?? '');
    const callSid = String(req.body?.CallSid ?? '');
    const attempt = Number(req.query?.n ?? 0) || 0;
    const send = (xml: string) => res.type('text/xml').send(xml);

    const deliveryId = logCallTurn(db, { callSid, fromPhone: from, spoken: spoken || undefined });

    // Step 1 — opening: greet + ask for the WhatsApp number on the keypad.
    if (step === '' && !spoken && !digits) {
      const name = driverNameFor(db, from);
      const hello = name ? `Namaste ${name}!` : 'Namaste!';
      send(askNumberTwiml(
        `${hello} Aryan Enterprises se. Main aapko dukaan ka location aur photo WhatsApp pe bhej deta hoon. ` +
        `Apna das ankon ka WhatsApp number keypad se daaliye, phir hash dabaiye. Skip karne ke liye intezaar kijiye.`,
      ));
      return;
    }

    // The "9 = owner" shortcut only applies during voice guidance (digits during step 1 are the number).
    if (step === 'guide' && digits === '9') {
      send(dialOwnerTwiml('Maalik se jod raha hoon, ek minute.', ownerPhone));
      return;
    }

    // Step 1 result — a (hopefully 10-digit) WhatsApp number.
    if (step === 'number') {
      if (/^\d{10}$/.test(digits)) {
        saveDriverWhatsapp(db, deliveryId, digits, callSid);
        const home: any = db.prepare('select landmark_notes from locations where is_home=1').get();
        try { await messenger.sendDriverDirections(digits, home?.landmark_notes || ''); } catch (e) { console.error('[twilio] wa send', e); }
        send(askTwiml('Maine aapke WhatsApp pe dukaan ka location aur photo bhej diya hai. Ab batao, aap abhi kis landmark ke paas ho?', 0));
        return;
      }
      // no/garbled number → just guide by voice
      send(askTwiml(GREETING, 0));
      return;
    }

    // Step 2 — voice guidance.
    const turn = guideTurn(spoken, { kb: new LandmarkKB(db), attempt });
    const nextN = turn.progressed ? 0 : attempt + 1;
    if (turn.next === 'dial') { send(dialOwnerTwiml(turn.say, ownerPhone)); return; }
    if (turn.next === 'hangup') { send(hangupTwiml(turn.say)); return; }
    send(askTwiml(turn.say, nextN));
  });
  return r;
}
