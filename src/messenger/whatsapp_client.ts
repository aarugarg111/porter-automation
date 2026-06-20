export interface WhatsAppClient {
  sendText(phone: string, text: string): Promise<void>;
  sendLocation(phone: string, lat: number, lng: number, label: string): Promise<void>;
  sendImage(phone: string, path: string, caption?: string): Promise<void>;
  sendVoiceNote(phone: string, path: string): Promise<void>;
}

export class FakeWhatsAppClient implements WhatsAppClient {
  sent: { kind:string; phone:string; extra?:any }[] = [];
  async sendText(phone:string, text:string){ this.sent.push({ kind:'text', phone, extra:text }); }
  async sendLocation(phone:string, lat:number, lng:number, label:string){ this.sent.push({ kind:'location', phone, extra:{lat,lng,label} }); }
  async sendImage(phone:string, path:string, caption?:string){ this.sent.push({ kind:'image', phone, extra:{path,caption} }); }
  async sendVoiceNote(phone:string, path:string){ this.sent.push({ kind:'voice', phone, extra:path }); }
}

// Real adapter — whatsapp-web.js loaded lazily so tests never import it.
export class WhatsAppWebClient implements WhatsAppClient {
  private client:any; private ready = false;
  private async ensure() {
    if (this.ready) return;
    // @ts-ignore optional dependency, installed only on the Porter phone host
    const wweb:any = await import('whatsapp-web.js');
    const { Client, LocalAuth } = wweb.default ?? wweb;
    this.client = new Client({ authStrategy: new LocalAuth({ clientId: process.env.WHATSAPP_SELF || 'porter' }) });
    this.client.on('qr', (qr:string) => console.log('[whatsapp] scan QR:\n', qr));
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
