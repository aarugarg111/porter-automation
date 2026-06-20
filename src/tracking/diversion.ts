// src/tracking/diversion.ts
export function isLate(d: { status:string; started_at?:string; expected_minutes?:number }, nowMs:number, threshold=1.5): boolean {
  if (['DELIVERED','REACHED_AREA','CANCELLED'].includes(d.status)) return false;
  if (!d.started_at || !d.expected_minutes) return false;
  const elapsedMin = (nowMs - Date.parse(d.started_at)) / 60000;
  return elapsedMin > d.expected_minutes * threshold;
}
