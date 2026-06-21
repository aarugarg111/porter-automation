export interface Messenger {
  sendDriverDirections(phone: string, landmarkNotes: string): Promise<void>;
  confirmReceiver(phone: string, orderId: string): Promise<void>;
  notifyReceiverPayment(phone: string, amountPaise: number): Promise<void>;
  notifyOwner(phone: string, text: string): Promise<void>;
  // Ask the driver for their UPI QR / id after delivery (when I'm paying by UPI).
  requestDriverQr(phone: string, orderId: string): Promise<void>;
}
