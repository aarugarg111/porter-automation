// src/telephony/call_log.ts
// Links an inbound driver call to the right delivery (several can be active at once) and records it
// for dashboard visibility. Porter often masks the caller ID, so the call's `From` may not match any
// driver_phone — we still log it, and capture the driver's REAL WhatsApp number on the call (keypad).
import type { DatabaseSync } from 'node:sqlite';

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);
const now = () => new Date().toISOString();

// Pick the delivery a call belongs to. Priority: caller matches a driver_phone → that one; else if
// exactly one active delivery has no driver_phone yet → it (and back-fill the number); else the most
// recent active delivery as a best guess (directions are the same shop regardless).
export function linkCallToDelivery(db: DatabaseSync, fromPhone?: string): number | null {
  const active = db.prepare(
    "select id, driver_phone from deliveries where status not in ('DELIVERED','CANCELLED') order by created_at desc, id desc",
  ).all() as any[];
  if (active.length === 0) return null;
  const f = norm(fromPhone);
  if (f) {
    const byPhone = active.find((d) => norm(d.driver_phone) === f);
    if (byPhone) return byPhone.id;
  }
  const phoneless = active.filter((d) => !d.driver_phone);
  if (f && phoneless.length === 1) {
    db.prepare('update deliveries set driver_phone=? where id=?').run(f, phoneless[0].id); // back-fill
    return phoneless[0].id;
  }
  return active[0].id; // best guess (most recent)
}

// Upsert one call row per CallSid; appends the latest spoken text and bumps the turn count.
export function logCallTurn(db: DatabaseSync, p: { callSid?: string; fromPhone?: string; spoken?: string }): number | null {
  const existing = p.callSid
    ? (db.prepare('select id, delivery_id from driver_calls where call_sid=?').get(p.callSid) as any)
    : null;
  if (existing) {
    db.prepare('update driver_calls set last_spoken=coalesce(?,last_spoken), turns=turns+1, updated_at=? where id=?')
      .run(p.spoken || null, now(), existing.id);
    return existing.delivery_id ?? null;
  }
  const deliveryId = linkCallToDelivery(db, p.fromPhone);
  db.prepare('insert into driver_calls (call_sid, delivery_id, from_phone, last_spoken, turns, created_at, updated_at) values (?,?,?,?,?,?,?)')
    .run(p.callSid || null, deliveryId, p.fromPhone || null, p.spoken || null, 1, now(), now());
  return deliveryId;
}

// Save the driver's confirmed WhatsApp number (entered on the call) on the delivery + the call row.
export function saveDriverWhatsapp(db: DatabaseSync, deliveryId: number | null, whatsapp: string, callSid?: string): void {
  const w = norm(whatsapp);
  if (!w) return;
  if (deliveryId != null) db.prepare('update deliveries set driver_whatsapp=? where id=?').run(w, deliveryId);
  if (callSid) db.prepare('update driver_calls set from_phone=coalesce(from_phone,?) where call_sid=?').run(w, callSid);
}
