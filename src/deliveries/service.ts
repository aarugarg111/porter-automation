// src/deliveries/service.ts
import type { DatabaseSync } from 'node:sqlite';
import { canTransition, type Status } from './status.js';
import { getLocation } from '../locations/repo.js';
import type { Messenger } from '../messenger/types.js';
import type { ParsedNotif } from '../capture/parsers.js';
const now = () => new Date().toISOString();
export function createIntent(db: DatabaseSync,
  i: { direction:'SEND'|'RECEIVE'; otherLocationId:number; vehicle?:string; payer?:'ME'|'RECEIVER' }): number {
  const home:any = db.prepare('select id from locations where is_home=1').get();
  const pickup = i.direction==='SEND' ? home.id : i.otherLocationId;
  const drop   = i.direction==='SEND' ? i.otherLocationId : home.id;
  return Number(db.prepare(`insert into deliveries (direction,pickup_location_id,drop_location_id,status,payer,created_at)
    values (?,?,?,?,?,?)`).run(i.direction,pickup,drop,'INTENT', i.payer||'ME', now()).lastInsertRowid);
}
const TYPE_TO_STATUS: Record<string, Status|undefined> = {
  ASSIGNED:'ASSIGNED', REACHED_PICKUP:'REACHED_PICKUP', PICKED_UP:'PICKED_UP',
  REACHED_AREA:'REACHED_AREA', DELIVERED:'DELIVERED' };
export async function applyParsed(db: DatabaseSync, msgr: Messenger, p: ParsedNotif & { deliveryId:number }) {
  const d:any = db.prepare('select * from deliveries where id=?').get(p.deliveryId);
  if (!d) return;
  if (p.type==='RECEIPT' && p.amountPaise!=null) {
    db.prepare('update deliveries set amount=? where id=?').run(p.amountPaise, d.id);
    db.prepare('insert into events (delivery_id,status,source,raw_text,created_at) values (?,?,?,?,?)').run(d.id, 'RECEIPT', 'notif', null, now());
    return;
  }
  const to = TYPE_TO_STATUS[p.type]; if (!to) return;
  if (!canTransition(d.status, to)) return;
  db.prepare('update deliveries set status=?, driver_name=coalesce(?,driver_name), driver_phone=coalesce(?,driver_phone), porter_order_id=coalesce(?,porter_order_id) where id=?')
    .run(to, p.driverName??null, p.driverPhone??null, p.orderId??null, d.id);
  db.prepare('insert into events (delivery_id,status,source,raw_text,created_at) values (?,?,?,?,?)')
    .run(d.id, to, 'notif', null, now());
  if (to==='ASSIGNED' && p.driverPhone) {
    const pickup = getLocation(db, d.pickup_location_id);
    await msgr.sendDriverDirections(p.driverPhone, pickup?.landmark_notes || '');
  }
  if (to==='DELIVERED') {
    const drop = getLocation(db, d.drop_location_id);
    if (drop?.phone) await msgr.confirmReceiver(drop.phone, d.porter_order_id || '');
    if (d.payer==='RECEIVER' && drop?.phone) {
      await msgr.notifyReceiverPayment(drop.phone, d.amount || 0);
      db.prepare("update deliveries set payment_status='settled' where id=?").run(d.id);
    }
  }
}
