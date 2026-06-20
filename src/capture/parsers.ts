export type NotifType = 'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'RECEIPT';
export interface ParsedNotif { type: NotifType; orderId?: string; driverName?: string; driverPhone?: string; amountPaise?: number; }
const ORDER = /\b(PRTR\w+)\b/i;
export function parseNotification(text: string): ParsedNotif | null {
  const orderId = text.match(ORDER)?.[1];
  const fare = text.match(/Rs\.?\s*(\d+)/i);
  if (fare) return { type:'RECEIPT', orderId, amountPaise: parseInt(fare[1],10)*100 };
  const assigned = text.match(/(?:Partner|Driver)\s+([A-Za-z]+)\s*\((\d{10})\)/i);
  if (assigned) return { type:'ASSIGNED', orderId, driverName: assigned[1], driverPhone: assigned[2] };
  if (/delivered/i.test(text)) return { type:'DELIVERED', orderId };
  if (/reached.*(drop|destination|delivery)/i.test(text)) return { type:'REACHED_AREA', orderId };
  if (/picked up|pickup done/i.test(text)) return { type:'PICKED_UP', orderId };
  if (/reached.*(pickup|shop)/i.test(text)) return { type:'REACHED_PICKUP', orderId };
  return null;
}
