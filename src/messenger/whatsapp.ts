import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Messenger } from './types.js';
import type { WhatsAppClient } from './whatsapp_client.js';

const here = dirname(fileURLToPath(import.meta.url));
const asset = (name:string) => join(here, '..', '..', 'assets', name);

export class WhatsAppMessenger implements Messenger {
  constructor(private db: DatabaseSync, private client: WhatsAppClient) {}

  async sendDriverDirections(phone: string, landmarkNotes: string) {
    const home:any = this.db.prepare('select * from locations where is_home=1').get();
    if (home?.lat != null && home?.lng != null) {
      await this.client.sendLocation(phone, home.lat, home.lng, home.nickname || 'Pickup');
    }
    const line = landmarkNotes || home?.landmark_notes || '';
    await this.client.sendText(phone, `Namaste! Pickup yahan hai. ${line}`.trim());
    const photo = asset('shopfront.jpg');
    if (existsSync(photo)) await this.client.sendImage(phone, photo, 'Dukaan ka photo');
    const voice = asset('directions-hi.ogg');
    if (existsSync(voice)) await this.client.sendVoiceNote(phone, voice);
  }

  async confirmReceiver(phone: string, orderId: string) {
    await this.client.sendText(phone, `Namaste, aapka parcel (order ${orderId}) aa gaya? Confirm kar dijiye.`);
  }

  async notifyReceiverPayment(phone: string, amountPaise: number) {
    const rupees = (amountPaise / 100).toFixed(amountPaise % 100 ? 2 : 0);
    await this.client.sendText(phone, `Driver ko ₹${rupees} de dena. Dhanyavaad.`);
  }

  // Owner-facing alert (e.g. a delivery running late) — plain text to the owner's WhatsApp.
  async notifyOwner(phone: string, text: string) {
    await this.client.sendText(phone, text);
  }
}
