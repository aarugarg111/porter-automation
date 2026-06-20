import { useEffect, useState } from 'react';
import { getDelivery, type Delivery } from '../api';

interface Props {
  id: number;
  onBack: () => void;
}

export default function DeliveryDetail({ id, onBack }: Props) {
  const [d, setD] = useState<Delivery | null>(null);

  useEffect(() => {
    getDelivery(id).then(setD);
  }, [id]);

  if (!d) return <p>Loading…</p>;

  const statusEvents = (d.events ?? []).filter((e) => e.event_type === 'status');
  const amount = d.amount != null ? `₹${Math.round(d.amount / 100)}` : '—';
  const showUpi = d.payment_method === 'UPI' && d.payment_status !== 'settled';

  return (
    <div className="delivery-detail">
      <button onClick={onBack}>← Back</button>
      <h2>
        Delivery #{d.id} {d.direction === 'SEND' ? '→' : '←'}
      </h2>
      <p>
        Status: <strong>{d.status}</strong>
        {d.late && ' ⚠ late'}
      </p>
      {d.driver_name && (
        <p>
          Driver: {d.driver_name} {d.driver_phone}
        </p>
      )}
      <p>
        Amount: {amount} · Payer: {d.payer} · {d.payment_method ?? '—'} ·{' '}
        {d.payment_status ?? 'pending'}
      </p>
      {showUpi && (
        <div className="upi-pay">
          <strong>Pay now (UPI)</strong>
          {d.payment_upi_id && <p>UPI: {d.payment_upi_id}</p>}
          {d.payment_qr_url && <img src={d.payment_qr_url} alt="payment QR" width={160} />}
        </div>
      )}
      <h3>Timeline</h3>
      <ol className="timeline">
        {statusEvents.map((e) => (
          <li key={e.id}>
            {e.status} — {new Date(e.created_at).toLocaleTimeString()}
          </li>
        ))}
      </ol>
    </div>
  );
}
