import { useEffect, useState } from 'react';
import { getLedger, type LedgerResponse } from '../api';

interface Props {
  onBack: () => void;
}

const rs = (paise: number) => `₹${Math.round(paise / 100)}`;

export default function Ledger({ onBack }: Props) {
  const [data, setData] = useState<LedgerResponse | null>(null);

  useEffect(() => {
    getLedger().then(setData);
  }, []);

  if (!data) return <p>Loading…</p>;

  return (
    <div className="ledger">
      <button onClick={onBack}>← Back</button>
      <h2>Payment Ledger</h2>
      <p>
        Pending: <strong>{rs(data.totals.pending)}</strong> · Settled:{' '}
        <strong>{rs(data.totals.settled)}</strong> · Count: {data.totals.count}
      </p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Payer</th>
            <th>Method</th>
            <th>Status</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.payer}</td>
              <td>{r.payment_method ?? '—'}</td>
              <td>{r.payment_status}</td>
              <td>{rs(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
