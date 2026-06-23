// src/telephony/voice/brain.ts
// The "brain" decides what to say next each turn. Two implementations behind one interface:
//   • LlmBrain (voice/llm_brain.ts) — an LLM holds a real Hindi conversation (the Cashflohero-style path)
//   • GuidanceBrain (here) — rule-based landmark lookup; the zero-key fallback.
// Policy for the fallback: ALWAYS help, never dead-end — a known landmark → its leg; arrived → hang up;
// lost/"connect me" → owner; anything else → universal waypoint directions, NOT a first-miss escalation.
import type { LandmarkKB } from '../../landmarks/kb.js';

export type BrainAction = 'speak' | 'transfer' | 'hangup';
export interface BrainReply { say: string; action: BrainAction }

// Implemented by both brains; methods are async so the LLM brain can await the model.
export interface Brain {
  greeting(): Promise<string>;
  onTranscript(text: string): Promise<BrainReply>;
}

const ARRIVED = /(aa\s?gay|aagay|pahunch|poh?o?nch|pahonch|dikh\s?gay|mil\s?gay|reach|dukaan|saamne|samne|saamane)/i;
const LOST = /(pata nahi|nahi pata|maloom nahi|maalum nahi|samajh nahi|kho gaya|lost|kahan jau|kahaan jau|baat kara|maalik|malik|owner|insaan|aadmi)/i;

const GREETING = 'Haan ji namaste, Aryan Enterprises se. Boliye, abhi kahaan ho?';
const WAYPOINT =
  'Koi baat nahi. Mathura Road pe Canara Bank ya Pillar pachees ki taraf aa jaiye, phir bataiye.';
const REPROMPT = 'Haan boliye, kis jagah ke paas ho?';
const ARRIVE_LINE =
  'Wah, bahut badhiya! Dukaan aapke bilkul saamne hai — Bosch aur Havells ka board, nariyal wale ke saamne. Aa jaiye, shukriya!';
const TRANSFER_LINE = 'Ek minute, main maalik se baat kara deta hoon — woh aapko seedha bata denge.';

export class GuidanceBrain implements Brain {
  private misses = 0;
  constructor(private kb: LandmarkKB) {}

  async greeting(): Promise<string> { return GREETING; }

  async onTranscript(spoken: string): Promise<BrainReply> {
    const s = (spoken || '').trim();
    if (!s) {
      if (++this.misses >= 3) return { say: TRANSFER_LINE, action: 'transfer' };
      return { say: REPROMPT, action: 'speak' };
    }
    const m = this.kb.match(s);
    if (m && m.confidence >= 0.4) {
      this.misses = 0;
      return { say: `${m.directions} Pohonch ke mujhe bata dena.`, action: 'speak' };
    }
    if (LOST.test(s)) return { say: TRANSFER_LINE, action: 'transfer' };
    if (ARRIVED.test(s)) return { say: ARRIVE_LINE, action: 'hangup' };
    if (++this.misses >= 4) return { say: TRANSFER_LINE, action: 'transfer' };
    return { say: WAYPOINT, action: 'speak' };
  }
}
