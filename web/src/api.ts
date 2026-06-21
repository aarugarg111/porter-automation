// Typed API client — all calls go through the Vite proxy at /api → backend root

export interface Delivery {
  id: number;
  status: string;
  direction: 'SEND' | 'RECEIVE';
  other_location_id: number;
  payer: 'ME' | 'RECEIVER';
  vehicle?: string;
  amount?: number;
  payment_method?: string;
  payment_status?: string;
  payment_qr_url?: string;
  payment_upi_id?: string;
  driver_name?: string;
  driver_phone?: string;
  late: boolean;
  receiver_confirmed_at?: string | null;
  late_alerted_at?: string | null;
  created_at: string;
  started_at?: string;
  reached_at?: string;
  delivered_at?: string;
  events?: DeliveryEvent[];
  inbound?: InboundMessage[];
}

export interface DeliveryEvent {
  id: number;
  delivery_id: number;
  event_type: string;
  status?: string;
  raw?: string;
  created_at: string;
}

export interface InboundMessage {
  id: number;
  delivery_id: number | null;
  from_phone: string;
  body?: string | null;
  media_kind?: string | null;
  media_ref?: string | null;
  kind: string; // receiver_confirm | payment_upi | payment_qr | other
  created_at: string;
}

export interface LocationRow {
  id: number;
  nickname: string;
  relationship: 'customer' | 'supplier' | 'both';
  contact_person?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  default_direction?: string;
  default_vehicle?: string;
  default_payer?: string;
  landmark_notes?: string;
}

export interface LedgerRow {
  id: number;
  payer: string;
  payment_method?: string;
  payment_status?: string;
  amount: number;
}

export interface LedgerTotals {
  count: number;
  pending: number;
  settled: number;
}

export interface LedgerResponse {
  rows: LedgerRow[];
  totals: LedgerTotals;
}

export interface IntentBody {
  direction: 'SEND' | 'RECEIVE';
  otherLocationId: number;
  payer?: 'ME' | 'RECEIVER';
  vehicle?: string;
}

export async function listDeliveries(): Promise<Delivery[]> {
  const res = await fetch('/api/deliveries');
  return res.json();
}

export async function getDelivery(id: number): Promise<Delivery> {
  const res = await fetch(`/api/deliveries/${id}`);
  return res.json();
}

export async function listLocations(): Promise<LocationRow[]> {
  const res = await fetch('/api/locations');
  return res.json();
}

export async function createIntent(body: IntentBody): Promise<{ id: number }> {
  const res = await fetch('/api/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getLedger(): Promise<LedgerResponse> {
  const res = await fetch('/api/ledger');
  return res.json();
}

export interface AlertsResponse {
  count: number;
  late: Delivery[];
}

export async function getAlerts(): Promise<AlertsResponse> {
  const res = await fetch('/api/alerts');
  return res.json();
}
