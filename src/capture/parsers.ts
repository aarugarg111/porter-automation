export type NotifType = 'ASSIGNED'|'SEARCHING'|'STARTED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'CANCELLED'|'RECEIPT';
export interface ParsedNotif { type: NotifType; orderId?: string; driverName?: string; driverPhone?: string; amountPaise?: number; }
// Live Porter order ids look like "CRN1657868951"; older/alt builds used "PRTR…". Match either.
const ORDER = /\b((?:CRN|PRTR)\w*\d+)\b/i;
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
  // Terminal: "Your order CRN… has been cancelled." / "CRN… got cancelled."
  if (/cancel/i.test(text)) return { type:'CANCELLED', orderId };
  // "Searching for a new driver" / "Finding a new driver…" — the assigned driver fell through and
  // Porter is reassigning. NOTE: Porter omits the order id here, so this usually can't be matched.
  if (/searching for (?:a )?(?:new )?driver|finding a (?:new )?driver/i.test(text)) return { type:'SEARCHING', orderId };
  // Live Porter: "<Driver Name> has been assigned for your order CRN…" — carries the name, no phone.
  const named = text.match(/^\s*(.+?)\s+has\s+been\s+assigned\b/i);
  if (named) return { type:'ASSIGNED', orderId, driverName: named[1].trim() };
  // Alt/legacy: "Partner Ramesh (9876543210) assigned to …" — carries the driver's phone.
  const assigned = text.match(/(?:Partner|Driver)\s+([A-Za-z]+)\s*\((\d{10})\)/i);
  if (assigned) return { type:'ASSIGNED', orderId, driverName: assigned[1], driverPhone: assigned[2] };
  // "Your order CRN… has started" / "…is now live" — the trip is underway (treated as in-transit).
  if (/has started|is now live/i.test(text)) return { type:'STARTED', orderId };
  if (/delivered/i.test(text)) return { type:'DELIVERED', orderId };
  if (/reached.*(drop|destination|delivery)/i.test(text)) return { type:'REACHED_AREA', orderId };
  if (/picked up|pickup done/i.test(text)) return { type:'PICKED_UP', orderId };
  if (/reached.*(pickup|shop)/i.test(text)) return { type:'REACHED_PICKUP', orderId };
  return null;
}
