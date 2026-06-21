import type { Messenger } from './types.js';
export class MockMessenger implements Messenger {
  sent: {kind:string; phone:string; extra?:any}[] = [];
  async sendDriverDirections(phone:string, notes:string){ this.sent.push({kind:'directions',phone,extra:notes}); }
  async confirmReceiver(phone:string, orderId:string){ this.sent.push({kind:'confirm',phone,extra:orderId}); }
  async notifyReceiverPayment(phone:string, amountPaise:number){ this.sent.push({kind:'payment',phone,extra:amountPaise}); }
  async notifyOwner(phone:string, text:string){ this.sent.push({kind:'owner',phone,extra:text}); }
}
