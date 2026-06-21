// src/coordination/confirm_sweep.ts
// Job 4 closing the loop: WhatsApp confirms the receiver first (free); if no inbound
// confirmation lands within a grace window, place ONE budget-gated AI call to ask
// "parcel aa gaya?". Idempotent via receiver_call_at. Opt-in (AUTO_CONFIRM_CALL) so it
// never surprise-spends — the manual POST /voice/confirm-receiver path always exists.
import type { DatabaseSync } from 'node:sqlite';
import type { CoordinationService } from './service.js';
import type { Messenger } from '../messenger/types.js';

export type ConfirmCallResult = { id: number; placed: boolean; escalated: boolean };

// Deliveries that are delivered, unconfirmed, not yet called, have a drop phone, and have sat
// past the grace window with no WhatsApp "haan aa gaya".
function pending(db: DatabaseSync, cutoffIso: string): any[] {
  return db.prepare(`
    select d.id, d.porter_order_id, l.phone as drop_phone
    from deliveries d join locations l on l.id = d.drop_location_id
    where d.status = 'DELIVERED'
      and d.receiver_confirmed_at is null
      and d.receiver_call_at is null
      and l.phone is not null
      and d.delivered_at is not null
      and d.delivered_at <= ?
    order by d.delivered_at asc`).all(cutoffIso) as any[];
}

export async function sweepReceiverConfirmations(
  db: DatabaseSync, svc: CoordinationService, msgr: Messenger, ownerPhone: string,
  nowMs = Date.now(), graceMinutes = Number(process.env.CONFIRM_GRACE_MINUTES ?? 15),
): Promise<ConfirmCallResult[]> {
  const cutoff = new Date(nowMs - graceMinutes * 60000).toISOString();
  const rows = pending(db, cutoff);
  const out: ConfirmCallResult[] = [];
  for (const d of rows) {
    // Mark attempted up-front so a slow/failed call never double-dials on the next sweep.
    db.prepare('update deliveries set receiver_call_at=? where id=?').run(new Date(nowMs).toISOString(), d.id);
    const res = await svc.confirmReceiverByCall({
      deliveryId: d.id, receiverPhone: d.drop_phone, orderId: d.porter_order_id || '',
    });
    if (res.escalated) {
      await msgr.notifyOwner(ownerPhone, `📞 Couldn't auto-call ${d.drop_phone} (budget cap) — confirm delivery #${d.id} manually.`);
    }
    out.push({ id: d.id, placed: res.placed, escalated: res.escalated });
  }
  return out;
}
