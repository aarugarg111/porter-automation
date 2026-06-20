export type Status = 'INTENT'|'ASSIGNED'|'REACHED_PICKUP'|'PICKED_UP'|'REACHED_AREA'|'DELIVERED'|'CANCELLED';
export const STATUS_ORDER: Status[] = ['INTENT','ASSIGNED','REACHED_PICKUP','PICKED_UP','REACHED_AREA','DELIVERED'];
export function canTransition(from: Status, to: Status): boolean {
  if (to === 'CANCELLED') return from !== 'DELIVERED';
  const f = STATUS_ORDER.indexOf(from), t = STATUS_ORDER.indexOf(to);
  return f >= 0 && t > f; // forward-only, skips allowed
}
