import { useState } from 'react';
import { createIntent, type LocationRow } from '../api';

interface Props {
  location: LocationRow;
  onBack: () => void;
  onDone: (id: number) => void;
}

export default function BookConfirm({ location, onBack, onDone }: Props) {
  const defaultDir: 'SEND' | 'RECEIVE' =
    (location.default_direction as 'SEND' | 'RECEIVE') ||
    (location.relationship === 'supplier' ? 'RECEIVE' : 'SEND');
  const defaultPayer: 'ME' | 'RECEIVER' =
    (location.default_payer as 'ME' | 'RECEIVER') || 'ME';

  const [direction, setDirection] = useState<'SEND' | 'RECEIVE'>(defaultDir);
  const [payer, setPayer] = useState<'ME' | 'RECEIVER'>(defaultPayer);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const { id } = await createIntent({ direction, otherLocationId: location.id, payer });
    onDone(id);
  }

  return (
    <div className="book-confirm">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="section-head">
        <h2>Book · {location.nickname}</h2>
        <span className={`chip status status--ASSIGNED`} style={{ textTransform: 'capitalize' }}>{location.relationship}</span>
      </div>

      <div className="field">
        <span>Direction</span>
        <select
          aria-label="direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'SEND' | 'RECEIVE')}
        >
          <option value="SEND">SEND — your shop → them</option>
          <option value="RECEIVE">RECEIVE — them → your shop</option>
        </select>
      </div>

      <div className="field">
        <span>Who pays the driver</span>
        <select
          aria-label="payer"
          value={payer}
          onChange={(e) => setPayer(e.target.value as 'ME' | 'RECEIVER')}
        >
          <option value="ME">ME — I pay (wallet / cash / UPI)</option>
          <option value="RECEIVER">RECEIVER — they pay the driver</option>
        </select>
      </div>

      <button className="primary" style={{ width: '100%' }} onClick={confirm} disabled={busy}>
        {busy ? 'Booking…' : 'Confirm booking'}
      </button>
    </div>
  );
}
