import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export type InboundWhatsApp = { from: string; body?: string; mediaKind?: string; mediaRef?: string };

// Where inbound media (e.g. a forwarded payment QR) is saved; served at /inbound-media (see index.ts).
export const inboundMediaDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'inbound');
let mediaSeq = 0;
function saveInboundMedia(media: any): string | undefined {
  if (!media?.data) return undefined;
  mkdirSync(inboundMediaDir, { recursive: true });
  const ext = String(media.mimetype || 'application/octet-stream').split('/')[1].split(';')[0] || 'bin';
  const name = `wa-${Date.now()}-${++mediaSeq}.${ext}`;
  writeFileSync(join(inboundMediaDir, name), Buffer.from(media.data, 'base64'));
  return `/inbound-media/${name}`;
}

export interface WhatsAppClient {
  sendText(phone: string, text: string): Promise<void>;
  sendLocation(phone: string, lat: number, lng: number, label: string): Promise<void>;
  sendImage(phone: string, path: string, caption?: string): Promise<void>;
  sendVoiceNote(phone: string, path: string): Promise<void>;
  // Register a handler for inbound messages (receiver confirmations, UPI/QR forwards).
  // Optional: only the live adapter actually receives; fakes/logging no-op or replay in tests.
  onMessage?(cb: (m: InboundWhatsApp) => void): void;
}

export class FakeWhatsAppClient implements WhatsAppClient {
  sent: { kind:string; phone:string; extra?:any }[] = [];
  private inboundCb?: (m: InboundWhatsApp) => void;
  async sendText(phone:string, text:string){ this.sent.push({ kind:'text', phone, extra:text }); }
  async sendLocation(phone:string, lat:number, lng:number, label:string){ this.sent.push({ kind:'location', phone, extra:{lat,lng,label} }); }
  async sendImage(phone:string, path:string, caption?:string){ this.sent.push({ kind:'image', phone, extra:{path,caption} }); }
  async sendVoiceNote(phone:string, path:string){ this.sent.push({ kind:'voice', phone, extra:path }); }
  onMessage(cb: (m: InboundWhatsApp) => void){ this.inboundCb = cb; }
  /** test helper: simulate an inbound message arriving on the linked phone */
  emit(m: InboundWhatsApp){ this.inboundCb?.(m); }
}

// Real adapter — whatsapp-web.js loaded lazily so tests never import it.
export class WhatsAppWebClient implements WhatsAppClient {
  private client:any; private ready = false;
  private inboundCb?: (m: InboundWhatsApp) => void;
  onMessage(cb: (m: InboundWhatsApp) => void){ this.inboundCb = cb; }
  private async ensure() {
    if (this.ready) return;
    // @ts-ignore optional dependency, installed only on the Porter phone host
    const wweb:any = await import('whatsapp-web.js');
    const { Client, LocalAuth } = wweb.default ?? wweb;
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: process.env.WHATSAPP_SELF || 'porter' }),
      // Honor a system Chrome/Edge via PUPPETEER_EXECUTABLE_PATH (avoids puppeteer's Chromium download).
      puppeteer: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    });
    this.client.on('qr', (qr:string) => console.log('[whatsapp] scan QR:\n', qr));
    // Inbound: receiver confirmations + driver UPI/QR forwards. Media is saved to assets/inbound
    // (served at /inbound-media) so the dashboard can show a forwarded payment QR.
    this.client.on('message', async (m:any) => {
      if (!this.inboundCb) return;
      let mediaKind: string | undefined, mediaRef: string | undefined;
      if (m.hasMedia) {
        try {
          const media = await m.downloadMedia();
          mediaKind = String(media?.mimetype || '').split('/')[0] || undefined;
          mediaRef = saveInboundMedia(media);
        } catch (e) { console.error('[whatsapp] media download failed', e); }
      }
      this.inboundCb({ from: m.from, body: m.body, mediaKind, mediaRef });
    });
    await new Promise<void>((resolve) => { this.client.on('ready', () => resolve()); this.client.initialize(); });
    this.ready = true;
  }
  private jid(phone:string){ const d = phone.replace(/\D/g,''); return `${d.length===10?'91'+d:d}@c.us`; }
  async sendText(phone:string, text:string){ await this.ensure(); await this.client.sendMessage(this.jid(phone), text); }
  async sendLocation(phone:string, lat:number, lng:number, label:string){
    await this.ensure();
    // @ts-ignore Location class from the same module
    const wweb:any = await import('whatsapp-web.js'); const { Location } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), new Location(lat, lng, label));
  }
  async sendImage(phone:string, path:string, caption?:string){
    await this.ensure();
    // @ts-ignore MessageMedia from the same module
    const wweb:any = await import('whatsapp-web.js'); const { MessageMedia } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), MessageMedia.fromFilePath(path), { caption });
  }
  async sendVoiceNote(phone:string, path:string){
    await this.ensure();
    // @ts-ignore MessageMedia from the same module
    const wweb:any = await import('whatsapp-web.js'); const { MessageMedia } = wweb.default ?? wweb;
    await this.client.sendMessage(this.jid(phone), MessageMedia.fromFilePath(path), { sendAudioAsVoice: true });
  }
}
