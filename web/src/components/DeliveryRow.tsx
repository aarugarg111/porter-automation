import type { Delivery } from '../api';

interface Props {
  delivery: Delivery;
  onSelect: (id: number) => void;
}

export default function DeliveryRow({ delivery, onSelect }: Props) {
  const arrow = delivery.direction === 'SEND' ? '→' : '←';
  const amount = delivery.amount != null ? `₹${Math.round(delivery.amount / 100)}` : '';

  return (
    <div
      className="delivery-row"
      onClick={() => onSelect(delivery.id)}
      style={{ cursor: 'pointer', padding: '8px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '8px' }}
    >
      <span className="direction-arrow">{arrow}</span>
      {delivery.late && <span className="late-warning">⚠</span>}
      <span className="status-chip">{delivery.status}</span>
      {delivery.payer && (
        <span className="payer-badge" style={{ fontSize: '0.8em', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>
          {delivery.payer}
        </span>
      )}
      {delivery.payment_method && (
        <span className="method-badge" style={{ fontSize: '0.8em', background: '#ddf', padding: '2px 6px', borderRadius: '4px' }}>
          {delivery.payment_method}
        </span>
      )}
      {amount && <span className="amount">{amount}</span>}
    </div>
  );
}
