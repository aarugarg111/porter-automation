import type { LandmarkKB } from '../landmarks/kb.js';
export type VoiceTurn = { action:'speak'|'transfer'; say?:string; sendPin?:boolean; transferTo?:string };
const MIN_CONFIDENCE = 0.4;
export class VoiceAgent {
  constructor(private kb: LandmarkKB, private deps: { ownerPhone: string }) {}
  inboundTurn(spoken: string, opts: { shouldEscalate: boolean }): VoiceTurn {
    if (opts.shouldEscalate) return { action:'transfer', transferTo: this.deps.ownerPhone };
    const m = this.kb.match(spoken);
    if (!m || m.confidence < MIN_CONFIDENCE) return { action:'transfer', transferTo: this.deps.ownerPhone };
    return { action:'speak', say: m.directions, sendPin: true };
  }
}
