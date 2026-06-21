// src/capture/inbound.ts
// Inbound WhatsApp capture — the reply side of Jobs 4 & 5 that was previously missing.
//  • Receiver replies "haan, aa gaya" → records receiver_confirmed_at (Job 4 confirmation).
//  • Driver/agent forwards a UPI id or QR image to the Porter number → records it on the
//    delivery and pings the owner to pay (Job 5 UPI path). We NEVER auto-pay or auto-settle —
//    money stays the owner's manual call; we only capture + surface.
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';

export type InboundWhatsApp = { from: string; body?: string; mediaKind?: string; mediaRef?: string };
export type InboundResult = { kind: string; deliveryId: number | null };

const now = () => new Date().toISOString();
const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

// Receiver said the parcel arrived (Hindi/Hinglish/English + common emoji).
const AFFIRM = /(\bhaan\b|\bhan\b|\bhaa+n?\b|\bji\b|aa\s?gaya|aagayi|mil\s?gaya|milgaya|pohonch|pahunch|recd|received|\bdone\b|\byes\b|\bok\b|✅|👍)/i;
// A UPI VPA like name@okhdfc / 98xxxxxxxx@ybl.
const UPI = /\b([a-z0-9.\-_]{2,256}@[a-z]{2,64})\b/i;

// Find the delivery this inbound phone belongs to. Driver match wins (UPI forward), then the
// drop-location's owner (receiver). Tiny volume → match in JS for consistent phone normalization.
function matchDeliveryForInbound(db: DatabaseSync, fromPhone: string): { id: number; role: 'driver' | 'receiver' } | null {
  const f = norm(fromPhone);
  if (!f) return null;
  const rows = db.prepare(`select d.id, d.driver_phone, l.phone as drop_phone
    from deliveries d left join locations l on l.id = d.drop_location_id
    where d.status != 'CANCELLED' order by d.created_at desc, d.id desc`).all() as any[];
  for (const r of rows) if (norm(r.driver_phone) === f) return { id: r.id, role: 'driver' };
  for (const r of rows) if (norm(r.drop_phone) === f) return { id: r.id, role: 'receiver' };
  return null;
}

export async function handleInboundWhatsApp(
  db: DatabaseSync, msgr: Messenger, ownerPhone: string, msg: InboundWhatsApp,
): Promise<InboundResult> {
  const match = matchDeliveryForInbound(db, msg.from);
  const deliveryId = match?.id ?? null;
  const body = msg.body ?? '';
  const upi = body.match(UPI)?.[1];
  const isImage = (msg.mediaKind ?? '').toLowerCase() === 'image';

  let kind = 'other';
  if (deliveryId != null && match?.role === 'receiver' && AFFIRM.test(body)) {
    kind = 'receiver_confirm';
    db.prepare('update deliveries set receiver_confirmed_at = coalesce(receiver_confirmed_at, ?) where id = ?').run(now(), deliveryId);
  } else if (deliveryId != null && upi) {
    kind = 'payment_upi';
    db.prepare('update deliveries set payment_upi_id = coalesce(payment_upi_id, ?) where id = ?').run(upi, deliveryId);
  } else if (deliveryId != null && isImage && msg.mediaRef) {
    kind = 'payment_qr';
    db.prepare('update deliveries set payment_qr_url = coalesce(payment_qr_url, ?) where id = ?').run(msg.mediaRef, deliveryId);
  }

  db.prepare(`insert into inbound_messages (delivery_id, from_phone, body, media_kind, media_ref, kind, created_at)
    values (?,?,?,?,?,?,?)`).run(deliveryId, msg.from, body || null, msg.mediaKind ?? null, msg.mediaRef ?? null, kind, now());

  // Surface payment forwards to the owner (read-side only — owner pays manually).
  if ((kind === 'payment_upi' || kind === 'payment_qr') && deliveryId != null) {
    const ref = upi ?? msg.mediaRef ?? '';
    await msgr.notifyOwner(ownerPhone, `💸 Payment detail for delivery #${deliveryId}: ${ref}. Dashboard me dekho aur pay karo.`);
  }
  return { kind, deliveryId };
}
