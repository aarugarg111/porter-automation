// src/telephony/guide.ts
// Conversational driver guidance. Each turn: the driver says where he is, we reply with the next
// leg toward the shop. Deterministic NLU (keyword match over the landmark KB) — robust to STT noise:
//  • recognised landmark  → speak its exact directions, keep talking
//  • "I've arrived"        → confirm + hang up
//  • not recognised        → route to the universal waypoint (Canara Bank / Pillar 25), re-ask
//  • stuck (2 misses/silence) → connect to the owner (never dead-ends)
import type { LandmarkKB } from '../landmarks/kb.js';

export type GuideTurn = { say: string; next: 'gather' | 'dial' | 'hangup'; progressed: boolean };

// "I'm here / arrived / I can see it" in Hindi/Hinglish.
const ARRIVED = /(aa\s?gay|aagay|pahunch|poh?o?nch|pahonch|dikh\s?gay|mil\s?gay|reach|pohch|dukaan dikh|pohonch gaya)/i;

export const GREETING =
  'Namaste! Aryan Enterprises se. Aap abhi kis jagah ya landmark ke paas khade ho? Bataiye.';
// Everyone can be routed to this known waypoint, then given the final leg.
export const WAYPOINT =
  'Koi baat nahi. Aap Canara Bank ki taraf aa jao, Metro Pillar number 25 ke paas, Mathura Road par. Wahaan pohonch ke mujhe bata dena.';

export function guideTurn(spoken: string, opts: { kb: LandmarkKB; attempt: number }): GuideTurn {
  const s = (spoken || '').trim();

  if (!s) {
    if (opts.attempt >= 2) return { say: 'Theek hai, main aapko maalik se jod raha hoon.', next: 'dial', progressed: false };
    return { say: 'Maaf kijiye, sunai nahi diya. Aap kis landmark ke paas ho?', next: 'gather', progressed: false };
  }

  // A named landmark wins over a bare "aa gaya" — "Canara Bank aa gaya" means he reached the
  // WAYPOINT, so give the next leg, not a false "you're at the shop".
  const m = opts.kb.match(s);
  if (m && m.confidence >= 0.4) {
    return { say: `${m.directions} Pohonch ke mujhe bata dena.`, next: 'gather', progressed: true };
  }

  // "Arrived" with no landmark → he's at the shop front.
  if (ARRIVED.test(s)) {
    return {
      say: 'Bahut badhiya! Dukaan aapke bilkul saamne hai — Bosch aur Havells ka board, nariyal wale ke saamne. Aa jaiye, dhanyavaad.',
      next: 'hangup', progressed: true,
    };
  }

  // Not recognised — route to the waypoint once, then escalate to the owner.
  if (opts.attempt >= 1) {
    return { say: 'Koi baat nahi, main aapko maalik se jod raha hoon, woh guide kar denge.', next: 'dial', progressed: false };
  }
  return { say: WAYPOINT, next: 'gather', progressed: false };
}
