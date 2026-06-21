import { useEffect, useState } from 'react';
import { listDeliveries, type Delivery } from '../api';
import DeliveryRow from './DeliveryRow';

interface Props {
  deliveries?: Delivery[];
  onSelect: (id: number) => void;
}

export default function ActiveList({ deliveries: propDeliveries, onSelect }: Props) {
  const [deliveries, setDeliveries] = useState<Delivery[]>(propDeliveries ?? []);

  useEffect(() => {
    if (propDeliveries !== undefined) {
      setDeliveries(propDeliveries);
      return;
    }
    // Polling mode: fetch and poll every 5s
    let cancelled = false;
    const load = () => {
      listDeliveries().then((data) => {
        if (!cancelled) setDeliveries(data);
      });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [propDeliveries]);

  const lateCount = deliveries.filter((d) => d.late).length;
  const confirmedCount = deliveries.filter((d) => d.receiver_confirmed_at).length;

  return (
    <>
      {lateCount > 0 && (
        <div className="alert-banner" role="alert">
          <span className="pulse" />
          {lateCount} {lateCount === 1 ? 'delivery is' : 'deliveries are'} running late — tap to check.
        </div>
      )}

      <div className="stat-strip">
        <div className="stat flight">
          <div className="n">{deliveries.length}</div>
          <div className="l">In&nbsp;flight</div>
        </div>
        <div className="stat late">
          <div className="n">{lateCount}</div>
          <div className="l">Late</div>
        </div>
        <div className="stat">
          <div className="n">{confirmedCount}</div>
          <div className="l">Confirmed</div>
        </div>
      </div>

      <div className="active-list">
        <div className="section-head">
          <h2>Active Deliveries</h2>
          <span className="count-pill">{deliveries.length}</span>
        </div>
        {deliveries.length === 0 && <p className="empty">No active deliveries — book one above.</p>}
        {deliveries.map((d) => (
          <DeliveryRow key={d.id} delivery={d} onSelect={onSelect} />
        ))}
      </div>
    </>
  );
}
