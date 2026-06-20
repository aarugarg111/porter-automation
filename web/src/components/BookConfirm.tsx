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
      <button onClick={onBack}>← Back</button>
      <h2>Book: {location.nickname}</h2>
      <p>
        <label>
          Direction{' '}
          <select
            aria-label="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'SEND' | 'RECEIVE')}
          >
            <option value="SEND">SEND — your shop → them</option>
            <option value="RECEIVE">RECEIVE — them → your shop</option>
          </select>
        </label>
      </p>
      <p>
        <label>
          Payer{' '}
          <select
            aria-label="payer"
            value={payer}
            onChange={(e) => setPayer(e.target.value as 'ME' | 'RECEIVER')}
          >
            <option value="ME">ME</option>
            <option value="RECEIVER">RECEIVER</option>
          </select>
        </label>
      </p>
      <button onClick={confirm} disabled={busy}>
        {busy ? 'Booking…' : 'Confirm'}
      </button>
    </div>
  );
}
