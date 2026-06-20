// Dev-only adapters: behave like the fakes but print what WOULD be sent, so a local run
// (PORTER_LIVE=0) shows the driver WhatsApps and AI calls in the server console.
import type { WhatsAppClient } from '../messenger/whatsapp_client.js';
import type { TelephonyProvider, OutboundCall } from '../telephony/provider.js';

const log = (icon: string, msg: string) => console.log(`${icon} ${msg}`);

export class LoggingWhatsAppClient implements WhatsAppClient {
  async sendText(phone: string, text: string) { log('📱', `WhatsApp → ${phone}: ${text}`); }
  async sendLocation(phone: string, lat: number, lng: number, label: string) {
    log('📍', `WhatsApp pin → ${phone}: ${label} (${lat}, ${lng})`);
  }
  async sendImage(phone: string, path: string, caption?: string) {
    log('🖼️', `WhatsApp image → ${phone}: ${path}${caption ? ` (${caption})` : ''}`);
  }
  async sendVoiceNote(phone: string, path: string) { log('🎙️', `WhatsApp voice note → ${phone}: ${path}`); }
}

export class LoggingTelephonyProvider implements TelephonyProvider {
  private n = 0;
  async placeOutboundCall(c: OutboundCall) {
    const callId = `dev-${++this.n}`;
    log('📞', `AI call → ${c.toPhone} [${callId}]: "${c.agentScript}"`);
    return { callId };
  }
  async warmTransfer(callId: string, toPhone: string) {
    log('↪️', `Warm-transfer ${callId} → owner ${toPhone}`);
  }
}
