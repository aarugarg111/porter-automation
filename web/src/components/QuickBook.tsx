import { useEffect, useState } from 'react';
import { listLocations, type LocationRow } from '../api';

interface Props {
  onSelect: (location: LocationRow) => void;
}

export default function QuickBook({ onSelect }: Props) {
  const [locations, setLocations] = useState<LocationRow[]>([]);

  useEffect(() => {
    listLocations().then(setLocations);
  }, []);

  return (
    <div className="quick-book">
      <h2>Quick Book</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {locations.map((loc) => (
          <button
            key={loc.id}
            className="location-chip"
            onClick={() => onSelect(loc)}
            style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ccc', cursor: 'pointer' }}
          >
            {loc.nickname}
          </button>
        ))}
      </div>
    </div>
  );
}
