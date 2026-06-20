import React, { useEffect, useState } from 'react';
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

  return (
    <div className="active-list">
      <h2>Active Deliveries</h2>
      {deliveries.length === 0 && <p>No active deliveries.</p>}
      {deliveries.map((d) => (
        <DeliveryRow key={d.id} delivery={d} onSelect={onSelect} />
      ))}
    </div>
  );
}
