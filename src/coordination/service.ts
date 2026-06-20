import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from '../messenger/types.js';
import type { VoiceAgent, VoiceTurn } from '../telephony/voice_agent.js';
import type { TelephonyProvider } from '../telephony/provider.js';
import type { BudgetTracker } from '../budget/tracker.js';

export type CoordDeps = {
  messenger: Messenger; voice: VoiceAgent; telephony: TelephonyProvider;
  budget: BudgetTracker; ownerPhone: string;
};

export class CoordinationService {
  constructor(private db: DatabaseSync, private deps: CoordDeps) {}

  async handleDriverInbound(input: { deliveryId:number|null; driverPhone:string; spoken:string; estSeconds?:number }): Promise<VoiceTurn> {
    const shouldEscalate = this.deps.budget.shouldEscalate(input.estSeconds ?? 90);
    const turn = this.deps.voice.inboundTurn(input.spoken, { shouldEscalate });
    if (turn.action === 'speak') {
      // Reinforce the spoken directions with a WhatsApp pin (free) so the driver can tap it.
      await this.deps.messenger.sendDriverDirections(input.driverPhone, turn.say || '');
    }
    return turn;
  }

  recordCall(input: { deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated:boolean }): number {
    return this.deps.budget.record(input);
  }
}
