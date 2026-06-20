export type OutboundCall = { toPhone:string; agentScript:string; deliveryId?:number };
export interface TelephonyProvider {
  placeOutboundCall(c: OutboundCall): Promise<{ callId:string }>;
  warmTransfer(callId: string, toPhone: string): Promise<void>;
}

export class FakeTelephonyProvider implements TelephonyProvider {
  calls: OutboundCall[] = [];
  transfers: { callId:string; toPhone:string }[] = [];
  async placeOutboundCall(c: OutboundCall) { this.calls.push(c); return { callId: `fake-${this.calls.length}` }; }
  async warmTransfer(callId: string, toPhone: string) { this.transfers.push({ callId, toPhone }); }
}

// Real adapter — Bolna voice agent on an Exotel +91 number. Uses global fetch; no SDK dependency.
export class BolnaAdapter implements TelephonyProvider {
  private base = 'https://api.bolna.ai';
  private key = process.env.BOLNA_API_KEY || '';
  private agentId = process.env.BOLNA_AGENT_ID || '';
  private from = process.env.EXOTEL_FROM || '';
  async placeOutboundCall(c: OutboundCall): Promise<{ callId:string }> {
    const res = await fetch(`${this.base}/call`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ agent_id: this.agentId, recipient_phone_number: c.toPhone, from_phone_number: this.from, variables: { script: c.agentScript } }),
    });
    if (!res.ok) throw new Error(`bolna placeOutboundCall failed: ${res.status}`);
    const data:any = await res.json();
    return { callId: String(data.call_id ?? data.id ?? '') };
  }
  async warmTransfer(callId: string, toPhone: string): Promise<void> {
    const res = await fetch(`${this.base}/call/${callId}/transfer`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ to_phone_number: toPhone }),
    });
    if (!res.ok) throw new Error(`bolna warmTransfer failed: ${res.status}`);
  }
}
