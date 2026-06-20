// src/capture/matcher.ts
import type { DatabaseSync } from 'node:sqlite';
import type { ParsedNotif } from './parsers.js';
export function matchDelivery(db: DatabaseSync, p: ParsedNotif): number | null {
  if (p.orderId) {
    const byOrder:any = db.prepare('select id from deliveries where porter_order_id=?').get(p.orderId);
    if (byOrder) return byOrder.id;
  }
  const open:any = db.prepare("select id from deliveries where porter_order_id is null and status in ('INTENT','ASSIGNED') order by created_at desc, id desc limit 1").get();
  return open?.id ?? null;
}
