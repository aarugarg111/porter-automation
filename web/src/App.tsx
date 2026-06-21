import { useEffect, useState } from 'react';
import QuickBook from './components/QuickBook';
import ActiveList from './components/ActiveList';
import BookConfirm from './components/BookConfirm';
import DeliveryDetail from './components/DeliveryDetail';
import Ledger from './components/Ledger';
import Capture from './components/Capture';
import type { LocationRow } from './api';

type View =
  | { name: 'main' }
  | { name: 'book'; location: LocationRow }
  | { name: 'detail'; id: number }
  | { name: 'ledger' }
  | { name: 'capture' };

// Lightweight hash routing — deep-linkable, refresh-safe, and gives the APK a working
// Android back button. (`book` is a transient in-memory step, not routed.)
function parseHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'ledger') return { name: 'ledger' };
  if (h === 'capture') return { name: 'capture' };
  const m = h.match(/^d\/(\d+)$/);
  if (m) return { name: 'detail', id: Number(m[1]) };
  return { name: 'main' };
}

export default function App() {
  const [view, setView] = useState<View>(() => parseHash());

  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(v: View) {
    if (v.name === 'book') { setView(v); return; } // transient, keep current hash
    const hash =
      v.name === 'ledger' ? '#/ledger'
      : v.name === 'capture' ? '#/capture'
      : v.name === 'detail' ? `#/d/${v.id}`
      : '#/';
    if (window.location.hash !== hash) window.location.hash = hash; // → hashchange → setView
    else setView(v);
  }
  const goMain = () => go({ name: 'main' });
  const onMain = view.name === 'main' || view.name === 'book' || view.name === 'detail';

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand" onClick={goMain}>
          <span className="brand-dot">P</span>Porter Cockpit
        </h1>
        <nav className="nav">
          <button className={onMain ? 'active' : ''} onClick={goMain}>Deliveries</button>
          <button className={view.name === 'capture' ? 'active' : ''} onClick={() => go({ name: 'capture' })}>Capture</button>
          <button className={view.name === 'ledger' ? 'active' : ''} onClick={() => go({ name: 'ledger' })}>Ledger</button>
        </nav>
      </header>

      {view.name === 'main' && (
        <>
          <QuickBook onSelect={(loc) => go({ name: 'book', location: loc })} />
          <ActiveList onSelect={(id) => go({ name: 'detail', id })} />
        </>
      )}
      {view.name === 'book' && (
        <BookConfirm location={view.location} onBack={goMain} onDone={goMain} />
      )}
      {view.name === 'detail' && <DeliveryDetail id={view.id} onBack={goMain} />}
      {view.name === 'capture' && <Capture onBack={goMain} />}
      {view.name === 'ledger' && <Ledger onBack={goMain} />}
    </div>
  );
}
