// src/telephony/voice/brain.ts
// The "brain" of the real-time voice agent. Per finished utterance it decides what to say next.
// Policy (fixing the old IVR's failures): it ALWAYS helps and never dead-ends —
//   • a recognised landmark        → that landmark's exact next leg
//   • "I've arrived / I see it"     → confirm + hang up
//   • "I'm lost / connect me"       → hand to the owner
//   • anything else (incl. STT it can't place) → the universal waypoint directions (Mathura Road /
//     Canara Bank / Pillar 25), NOT an escalation. Only after several blind misses does it hand off.
// Phrasing is warm and short (no 20-second monologue, no robotic keypad prompt).
import type { LandmarkKB } from '../../landmarks/kb.js';

export type BrainAction = 'speak' | 'transfer' | 'hangup';
export interface BrainReply { say: string; action: BrainAction }

const ARRIVED = /(aa\s?gay|aagay|pahunch|poh?o?nch|pahonch|dikh\s?gay|mil\s?gay|reach|dukaan|saamne|samne|saamane)/i;
const LOST = /(pata nahi|nahi pata|maloom nahi|maalum nahi|samajh nahi|kho gaya|lost|kahan jau|kahaan jau|baat kara|maalik|malik|owner|insaan|aadmi)/i;

const GREETING = 'Haan ji namaste, Aryan Enterprises se. Boliye, abhi kahaan ho?';
const WAYPOINT =
  'Koi baat nahi. Mathura Road pe Canara Bank ya Pillar pachees ki taraf aa jaiye, phir bataiye.';
const REPROMPT = 'Haan boliye, kis jagah ke paas ho?';
const ARRIVE_LINE =
  'Wah, bahut badhiya! Dukaan aapke bilkul saamne hai — Bosch aur Havells ka board, nariyal wale ke saamne. Aa jaiye, shukriya!';
const TRANSFER_LINE = 'Ek minute, main maalik se baat kara deta hoon — woh aapko seedha bata denge.';

export class GuidanceBrain {
  private misses = 0;
  constructor(private kb: LandmarkKB) {}

  greeting(): string { return GREETING; }

  onTranscript(spoken: string): BrainReply {
    const s = (spoken || '').trim();
    if (!s) {
      if (++this.misses >= 3) return { say: TRANSFER_LINE, action: 'transfer' };
      return { say: REPROMPT, action: 'speak' };
    }
    // A recognised landmark wins (and beats a bare "aa gaya" — "Canara Bank aa gaya" = next leg).
    const m = this.kb.match(s);
    if (m && m.confidence >= 0.4) {
      this.misses = 0;
      return { say: `${m.directions} Pohonch ke mujhe bata dena.`, action: 'speak' };
    }
    if (LOST.test(s)) return { say: TRANSFER_LINE, action: 'transfer' };
    if (ARRIVED.test(s)) return { say: ARRIVE_LINE, action: 'hangup' };
    // Heard something, couldn't place it → give the universal directions (don't escalate).
    if (++this.misses >= 4) return { say: TRANSFER_LINE, action: 'transfer' };
    return { say: WAYPOINT, action: 'speak' };
  }
}
