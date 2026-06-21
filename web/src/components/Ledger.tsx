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
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h2>Payment Ledger</h2>
      <div className="ledger-stats">
        <div className="stat"><div className="n pending">{rs(data.totals.pending)}</div><div className="l">Pending</div></div>
        <div className="stat"><div className="n settled">{rs(data.totals.settled)}</div><div className="l">Settled</div></div>
        <div className="stat"><div className="n">{data.totals.count}</div><div className="l">Today</div></div>
      </div>
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
              <td><span className={`pay-dot${r.payment_status === 'settled' ? ' settled' : ''}`}>{r.payment_status}</span></td>
              <td>{rs(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
