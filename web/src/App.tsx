import { useState } from 'react';
import QuickBook from './components/QuickBook';
import ActiveList from './components/ActiveList';
import BookConfirm from './components/BookConfirm';
import DeliveryDetail from './components/DeliveryDetail';
import Ledger from './components/Ledger';
import type { LocationRow } from './api';

type View =
  | { name: 'main' }
  | { name: 'book'; location: LocationRow }
  | { name: 'detail'; id: number }
  | { name: 'ledger' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'main' });
  const goMain = () => setView({ name: 'main' });

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand" onClick={goMain}>Porter Cockpit</h1>
        <nav className="nav">
          <button onClick={goMain}>Deliveries</button>
          <button onClick={() => setView({ name: 'ledger' })}>Ledger</button>
        </nav>
      </header>

      {view.name === 'main' && (
        <>
          <QuickBook onSelect={(loc) => setView({ name: 'book', location: loc })} />
          <ActiveList onSelect={(id) => setView({ name: 'detail', id })} />
        </>
      )}
      {view.name === 'book' && (
        <BookConfirm location={view.location} onBack={goMain} onDone={goMain} />
      )}
      {view.name === 'detail' && <DeliveryDetail id={view.id} onBack={goMain} />}
      {view.name === 'ledger' && <Ledger onBack={goMain} />}
    </div>
  );
}
