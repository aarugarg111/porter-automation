import type { Delivery } from '../api';

interface Props {
  delivery: Delivery;
  onSelect: (id: number) => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

export default function DeliveryRow({ delivery: d, onSelect }: Props) {
  const arrow = d.direction === 'SEND' ? '→' : '←';
  const amount = d.amount != null ? `₹${Math.round(d.amount / 100)}` : null;
  const settled = d.payment_status === 'settled';
  const sub = [d.driver_name, timeAgo(d.started_at || d.created_at)].filter(Boolean).join(' · ');

  return (
    <div className={`delivery-row${d.late ? ' is-late' : ''}`} onClick={() => onSelect(d.id)}>
      <span className={`dir ${d.direction}`} title={d.direction}>{arrow}</span>
      <div className="row-main">
        <div className="row-line1">
          <span className={`chip status status--${d.status}`}>{d.status}</span>
          {d.late && <span className="chip late-badge"><span aria-hidden>⚠</span> late</span>}
          {d.receiver_confirmed_at && <span className="chip confirm-badge">✓ confirmed</span>}
        </div>
        <div className="row-line2">{sub || '—'}</div>
      </div>
      <div className="row-right">
        {amount ? <span className="amount">{amount}</span> : <span className="amount muted">—</span>}
        <span className={`pay-dot${settled ? ' settled' : ''}`}>{settled ? 'settled' : d.payer}</span>
      </div>
    </div>
  );
}
