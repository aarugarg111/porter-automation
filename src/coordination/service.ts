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

  // Job 4 voice backup: place an outbound AI call to the receiver to confirm delivery,
  // but only when the monthly budget allows — otherwise leave it for the owner to call manually.
  async confirmReceiverByCall(input: { deliveryId:number|null; receiverPhone:string; orderId:string; estSeconds?:number }): Promise<{ placed:boolean; callId?:string; escalated:boolean }> {
    const est = input.estSeconds ?? 60;
    if (this.deps.budget.shouldEscalate(est)) return { placed:false, escalated:true };
    const { callId } = await this.deps.telephony.placeOutboundCall({
      toPhone: input.receiverPhone,
      agentScript: `Namaste, Aryan Enterprises se. Order ${input.orderId} aapko mil gaya? Haan ya na bataiye.`,
      deliveryId: input.deliveryId ?? undefined,
    });
    return { placed:true, callId, escalated:false };
  }

  recordCall(input: { deliveryId:number|null; direction:'IN'|'OUT'; seconds:number; escalated:boolean }): number {
    return this.deps.budget.record(input);
  }
}
