export interface Messenger {
  sendDriverDirections(phone: string, landmarkNotes: string): Promise<void>;
  confirmReceiver(phone: string, orderId: string): Promise<void>;
  notifyReceiverPayment(phone: string, amountPaise: number): Promise<void>;
}
