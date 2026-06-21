// src/deliveries/service.ts
import type { DatabaseSync } from 'node:sqlite';
import { canTransition, type Status } from './status.js';
import { getLocation } from '../locations/repo.js';
import type { Messenger } from '../messenger/types.js';
import type { ParsedNotif } from '../capture/parsers.js';
const now = () => new Date().toISOString();
// Default minutes from pickup→drop before a delivery is flagged late (Job 2). Per-booking
// override via `expectedMinutes`; otherwise DEFAULT_ETA_MINUTES env (fallback 45).
const defaultEtaMinutes = () => Number(process.env.DEFAULT_ETA_MINUTES ?? 45);
export function createIntent(db: DatabaseSync,
  i: { direction:'SEND'|'RECEIVE'; otherLocationId:number; vehicle?:string; payer?:'ME'|'RECEIVER'; expectedMinutes?:number }): number {
  const home:any = db.prepare('select id from locations where is_home=1').get();
  const pickup = i.direction==='SEND' ? home.id : i.otherLocationId;
  const drop   = i.direction==='SEND' ? i.otherLocationId : home.id;
  const eta = i.expectedMinutes ?? defaultEtaMinutes();
  return Number(db.prepare(`insert into deliveries (direction,pickup_location_id,drop_location_id,status,payer,expected_minutes,created_at)
    values (?,?,?,?,?,?,?)`).run(i.direction,pickup,drop,'INTENT', i.payer||'ME', eta, now()).lastInsertRowid);
}
const TYPE_TO_STATUS: Record<string, Status|undefined> = {
  ASSIGNED:'ASSIGNED', REACHED_PICKUP:'REACHED_PICKUP', PICKED_UP:'PICKED_UP',
  REACHED_AREA:'REACHED_AREA', DELIVERED:'DELIVERED' };

// Pre-notify the receiver of the amount to hand the driver, then settle — but ONLY once
// the delivery is DELIVERED *and* the fare is known. Idempotent + order-independent, so it
// works whether Porter's "delivered" or "fare" notification lands first (HANDOFF §9 ordering bug:
// previously the receiver could be told "₹0" if the fare arrived after the delivered event).
// When I'm paying by UPI and we have the driver's WhatsApp (captured on the inbound call), ask him
// for his UPI QR/id after delivery — his reply is captured by the inbound handler and surfaced to me.
async function maybeRequestDriverQr(db: DatabaseSync, msgr: Messenger, deliveryId: number) {
  const d: any = db.prepare('select * from deliveries where id=?').get(deliveryId);
  if (!d) return;
  if (d.payer !== 'ME') return;                                    // only when I pay
  if (d.payment_method && d.payment_method !== 'UPI') return;      // cash/wallet → no QR needed
  if (!d.driver_whatsapp || d.driver_qr_requested_at) return;      // need WhatsApp; ask once
  await msgr.requestDriverQr(d.driver_whatsapp, d.porter_order_id || '');
  db.prepare("update deliveries set driver_qr_requested_at=? where id=?").run(now(), d.id);
}

async function maybeSettleReceiverPayment(db: DatabaseSync, msgr: Messenger, deliveryId: number) {
  const d:any = db.prepare('select * from deliveries where id=?').get(deliveryId);
  if (!d) return;
  if (d.status !== 'DELIVERED' || d.payer !== 'RECEIVER') return; // wait for delivery; ME settles manually
  if (d.payment_status === 'settled') return;                     // already pre-notified
  if (d.amount == null || d.amount <= 0) return;                  // fare not known yet — wait for RECEIPT
  const drop = getLocation(db, d.drop_location_id);
  if (!drop?.phone) return;
  await msgr.notifyReceiverPayment(drop.phone, d.amount);
  db.prepare("update deliveries set payment_status='settled' where id=?").run(d.id);
}

export async function applyParsed(db: DatabaseSync, msgr: Messenger, p: ParsedNotif & { deliveryId:number }) {
  const d:any = db.prepare('select * from deliveries where id=?').get(p.deliveryId);
  if (!d) return;
  if (p.type==='RECEIPT' && p.amountPaise!=null) {
    db.prepare('update deliveries set amount=? where id=?').run(p.amountPaise, d.id);
    db.prepare('insert into events (delivery_id,status,source,raw_text,created_at,event_type) values (?,?,?,?,?,?)').run(d.id, 'RECEIPT', 'notif', null, now(), 'receipt');
    await maybeSettleReceiverPayment(db, msgr, d.id); // fare may have arrived after "delivered"
    return;
  }
  const to = TYPE_TO_STATUS[p.type]; if (!to) return;
  if (!canTransition(d.status, to)) return;
  db.prepare('update deliveries set status=?, driver_name=coalesce(?,driver_name), driver_phone=coalesce(?,driver_phone), porter_order_id=coalesce(?,porter_order_id) where id=?')
    .run(to, p.driverName??null, p.driverPhone??null, p.orderId??null, d.id);
  db.prepare('insert into events (delivery_id,status,source,raw_text,created_at,event_type) values (?,?,?,?,?,?)')
    .run(d.id, to, 'notif', null, now(), 'status');
  if (to === 'PICKED_UP') db.prepare("update deliveries set started_at=? where id=? and started_at is null").run(now(), d.id);
  if (to === 'REACHED_AREA') db.prepare("update deliveries set reached_at=? where id=?").run(now(), d.id);
  if (to === 'DELIVERED') db.prepare("update deliveries set delivered_at=? where id=? and delivered_at is null").run(now(), d.id);
  if (to==='ASSIGNED' && p.driverPhone) {
    const pickup = getLocation(db, d.pickup_location_id);
    await msgr.sendDriverDirections(p.driverPhone, pickup?.landmark_notes || '');
  }
  if (to==='DELIVERED') {
    const drop = getLocation(db, d.drop_location_id);
    if (drop?.phone) await msgr.confirmReceiver(drop.phone, d.porter_order_id || '');
    await maybeSettleReceiverPayment(db, msgr, d.id); // no-op if fare not known yet (RECEIPT will retry)
    await maybeRequestDriverQr(db, msgr, d.id);       // ME + UPI + driver WhatsApp → ask driver for QR
  }
}
