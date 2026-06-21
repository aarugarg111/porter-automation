import { useState } from 'react';
import { postCapture, type CaptureResult } from '../api';

interface Props {
  onBack: () => void;
}

// What the parser understands today (src/capture/parsers.ts) — shown as one-tap examples so the
// owner can try it, and so the wording stays close to real Porter notifications.
const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Driver assigned', text: 'Partner Ramesh (9876543210) assigned to your order PRTR1234' },
  { label: 'Picked up', text: 'Your order has been picked up' },
  { label: 'Reached drop', text: 'Driver reached the drop location' },
  { label: 'Delivered', text: 'Your order PRTR1234 has been delivered' },
  { label: 'Fare receipt', text: 'Trip complete. Total fare Rs 1,250' },
];

const TOKEN_KEY = 'porter.captureToken';

function banner(r: CaptureResult): { cls: string; msg: string } {
  if (r.reason === 'unauthorized') return { cls: 'red', msg: 'Capture token needed — open Settings below and paste it.' };
  if (r.matched) return { cls: 'green', msg: `✓ Updated delivery #${r.deliveryId}.` };
  if (r.reason === 'no-open-delivery') return { cls: 'amber', msg: 'Read it, but no matching open delivery. Book it first, then paste updates.' };
  if (r.reason === 'unparsed') return { cls: 'amber', msg: "Saved, but couldn't read this wording. Send it to me and I'll tune the parser." };
  return { cls: 'amber', msg: 'Saved.' };
}

export default function Capture({ onBack }: Props) {
  const [text, setText] = useState('');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState('');

  function saveToken(v: string) {
    setToken(v);
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await postCapture(text.trim(), token || undefined);
      setResult(r);
      if (r.matched) setText('');
    } catch {
      setError("Couldn't reach the cockpit. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const b = result ? banner(result) : null;

  return (
    <div className="capture">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="section-head">
        <h2>Capture</h2>
        <span className="count-pill">paste a Porter update</span>
      </div>

      <p className="capture-hint">
        Copy a Porter app notification and paste it here. The cockpit reads it and moves the matching
        delivery forward — the same pipeline the auto-forwarder uses.
      </p>

      <textarea
        className="capture-text"
        aria-label="notification text"
        placeholder="Paste the Porter notification text…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
      />

      <div className="chip-row">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} className="example-chip" onClick={() => setText(ex.text)} type="button">
            {ex.label}
          </button>
        ))}
      </div>

      <button className="primary" style={{ width: '100%' }} onClick={submit} disabled={busy || !text.trim()}>
        {busy ? 'Reading…' : 'Read & update'}
      </button>

      {b && <div className={`capture-result ${b.cls}`} role="status">{b.msg}</div>}
      {error && <div className="capture-result red" role="status">{error}</div>}

      <button className="link-btn" onClick={() => setShowSettings((s) => !s)}>
        {showSettings ? 'Hide settings' : 'Settings (capture token)'}
      </button>
      {showSettings && (
        <div className="field">
          <span>Capture token</span>
          <input
            type="password"
            aria-label="capture token"
            placeholder="Only if the box sets CAPTURE_TOKEN"
            value={token}
            onChange={(e) => saveToken(e.target.value)}
          />
          <small className="capture-note">Stored on this device only. Use the same value as the box's CAPTURE_TOKEN.</small>
        </div>
      )}
    </div>
  );
}
