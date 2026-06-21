// src/tracking/monitor.ts
// Job 2 (catch diversion/delay) live wiring: periodically scan open deliveries and alert the
// owner ONCE when one first crosses the late threshold (isLate). Idempotent via late_alerted_at.
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import { isLate } from './diversion.js';

export type OpenDelivery = {
  id: number; status: string; porter_order_id: string | null;
  driver_name: string | null; driver_phone: string | null;
  started_at: string | null; expected_minutes: number | null; late_alerted_at: string | null;
};

const OPEN = "status not in ('DELIVERED','CANCELLED')";

export function findLate(db: DatabaseSync, nowMs: number): OpenDelivery[] {
  const rows = db.prepare(`select * from deliveries where ${OPEN}`).all() as any[];
  return rows.filter((d) => isLate(d, nowMs));
}

function lateMessage(d: OpenDelivery, nowMs: number): string {
  const elapsed = d.started_at ? Math.round((nowMs - Date.parse(d.started_at)) / 60000) : null;
  const who = [d.driver_name, d.driver_phone].filter(Boolean).join(' ');
  const order = d.porter_order_id ? ` (order ${d.porter_order_id})` : '';
  return `⚠️ Delivery #${d.id}${order} chal raha hai late — driver ${who || 'unknown'}. ` +
    `${elapsed ?? '?'} min ho gaye, expected ~${d.expected_minutes} min. Status: ${d.status}.`;
}

// Alert the owner about deliveries that just went late. Returns the ones alerted this sweep.
export async function sweepLateDeliveries(
  db: DatabaseSync, msgr: Messenger, ownerPhone: string, nowMs = Date.now(),
): Promise<OpenDelivery[]> {
  const fresh = findLate(db, nowMs).filter((d) => d.late_alerted_at == null);
  for (const d of fresh) {
    await msgr.notifyOwner(ownerPhone, lateMessage(d, nowMs));
    db.prepare('update deliveries set late_alerted_at=? where id=?').run(new Date(nowMs).toISOString(), d.id);
  }
  return fresh;
}
