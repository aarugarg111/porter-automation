// src/api/twilio.ts
// Inbound driver call via Twilio. Twilio POSTs form-encoded params (From, Digits, …) to this
// webhook and plays back whatever TwiML we return. We answer and speak the fixed Hindi directions.
import { Router, urlencoded } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { greetingTwiml, dialOwnerTwiml } from '../telephony/twiml.js';

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

// Greet the driver by name if their number matches an active (assigned, not delivered) delivery.
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
  // Twilio sends application/x-www-form-urlencoded — parse it just for this route.
  r.post('/voice/twilio-inbound', urlencoded({ extended: false }), (req, res) => {
    const digit = String(req.body?.Digits ?? '');
    const home: any = db.prepare('select landmark_notes from locations where is_home=1').get();
    const directions = home?.landmark_notes || '';

    let xml: string;
    if (digit === '9') {
      xml = dialOwnerTwiml(ownerPhone);
    } else {
      // initial call OR "press 1 to repeat"
      const name = driverNameFor(db, req.body?.From);
      xml = greetingTwiml(directions, name);
    }
    res.type('text/xml').send(xml);
  });
  return r;
}
