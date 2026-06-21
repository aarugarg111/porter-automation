export type NotifType = 'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'RECEIPT';
export interface ParsedNotif { type: NotifType; orderId?: string; driverName?: string; driverPhone?: string; amountPaise?: number; }
const ORDER = /\b(PRTR\w+)\b/i;
// Fare: supports "Rs", "Rs.", "INR", "₹"; comma grouping ("1,250") and paise ("150.50").
// PROVISIONAL (HANDOFF §9) — tune against real Porter notifications.
const FARE = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
export function parseFarePaise(text: string): number | null {
  const m = text.match(FARE);
  if (!m) return null;
  const rupees = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(rupees)) return null;
  return Math.round(rupees * 100);
}
export function parseNotification(text: string): ParsedNotif | null {
  const orderId = text.match(ORDER)?.[1];
  const amountPaise = parseFarePaise(text);
  if (amountPaise != null) return { type:'RECEIPT', orderId, amountPaise };
  const assigned = text.match(/(?:Partner|Driver)\s+([A-Za-z]+)\s*\((\d{10})\)/i);
  if (assigned) return { type:'ASSIGNED', orderId, driverName: assigned[1], driverPhone: assigned[2] };
  if (/delivered/i.test(text)) return { type:'DELIVERED', orderId };
  if (/reached.*(drop|destination|delivery)/i.test(text)) return { type:'REACHED_AREA', orderId };
  if (/picked up|pickup done/i.test(text)) return { type:'PICKED_UP', orderId };
  if (/reached.*(pickup|shop)/i.test(text)) return { type:'REACHED_PICKUP', orderId };
  return null;
}
