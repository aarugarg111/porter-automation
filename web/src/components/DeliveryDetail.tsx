import { useEffect, useState } from 'react';
import { getDelivery, type Delivery } from '../api';

interface Props {
  id: number;
  onBack: () => void;
}

const rs = (paise?: number) => (paise != null ? `₹${Math.round(paise / 100)}` : '—');
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function DeliveryDetail({ id, onBack }: Props) {
  const [d, setD] = useState<Delivery | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => getDelivery(id).then((x) => { if (!cancelled) setD(x); });
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  if (!d) return <div className="delivery-detail"><p className="empty">Loading…</p></div>;

  const statusEvents = (d.events ?? []).filter((e) => e.event_type === 'status');
  const settled = d.payment_status === 'settled';
  const hasUpi = !!(d.payment_upi_id || d.payment_qr_url);

  return (
    <div className="delivery-detail">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="detail-head">
        <h2>
          Delivery #{d.id}
          <span className={`dir ${d.direction}`} style={{ width: 26, height: 26, fontSize: '0.9rem' }}>
            {d.direction === 'SEND' ? '→' : '←'}
          </span>
          <span className={`chip status status--${d.status}`}>{d.status}</span>
          {d.late && <span className="chip late-badge"><span aria-hidden>⚠</span> late</span>}
        </h2>
      </div>

      {d.driver_name && (
        <div className="driver-card">
          <span className="driver-avatar">{d.driver_name[0]?.toUpperCase() ?? '?'}</span>
          <div className="meta">
            <div className="name">{d.driver_name}</div>
            {d.driver_phone && <div className="phone">{d.driver_phone}</div>}
          </div>
          {d.driver_phone && <a className="call-link" href={`tel:${d.driver_phone}`} title="Call driver">📞</a>}
        </div>
      )}

      <dl className="kv">
        <dt>Amount</dt><dd>{rs(d.amount)}</dd>
        <dt>Payer</dt><dd>{d.payer}</dd>
        <dt>Method</dt><dd>{d.payment_method ?? '—'}</dd>
        <dt>Payment</dt>
        <dd><span className={`pay-dot${settled ? ' settled' : ''}`}>{d.payment_status ?? 'pending'}</span></dd>
        {d.receiver_confirmed_at && (
          <>
            <dt>Receiver</dt>
            <dd><span className="chip confirm-badge">✓ confirmed {fmtTime(d.receiver_confirmed_at)}</span></dd>
          </>
        )}
      </dl>

      {hasUpi && (
        <div className="upi-pay">
          <div className="title">💸 Pay the driver (UPI)</div>
          {d.payment_upi_id && <span className="upi-id">{d.payment_upi_id}</span>}
          {d.payment_qr_url && <img src={d.payment_qr_url} alt="payment QR" width={170} />}
        </div>
      )}

      {!!(d.inbound && d.inbound.length) && (
        <>
          <h3>Messages</h3>
          {d.inbound!.map((m) => (
            <div key={m.id} className="inbound-msg">
              <span className={`tag ${m.kind}`}>{m.kind.replace('_', ' ')}</span>
              <div className="body">
                {m.body || (m.media_kind ? `[${m.media_kind}]` : '—')}
                <div className="from">{m.from_phone} · {fmtTime(m.created_at)}</div>
              </div>
            </div>
          ))}
        </>
      )}

      <h3>Timeline</h3>
      <ol className="timeline">
        {statusEvents.map((e) => (
          <li key={e.id}>
            <span className="t-status">{e.status}</span>
            <span className="t-time">{fmtTime(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
