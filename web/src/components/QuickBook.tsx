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
      <div className="section-head">
        <h2>Quick Book</h2>
        <span className="count-pill">1 tap</span>
      </div>
      <div className="chip-row">
        {locations.length === 0 && <p className="empty">No saved shops yet.</p>}
        {locations.map((loc) => (
          <button
            key={loc.id}
            className="location-chip"
            onClick={() => onSelect(loc)}
            title={loc.relationship}
          >
            <span className={`rel-dot ${loc.relationship}`} />
            {loc.nickname}
          </button>
        ))}
      </div>
    </div>
  );
}
