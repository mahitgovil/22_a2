import { useState } from 'react';
import { api } from '../api.js';

const NEXT = {
  FUNDED: { to: 'IN PROGRESS', label: 'Start work' },
  'IN PROGRESS': { to: 'COMPLETED', label: 'Mark completed' },
};

/**
 * Moves a contract along FUNDED → IN PROGRESS → COMPLETED.
 * Starting a second contract for a freelancer who is already working is
 * rejected by the Part A partial unique index; the message is shown inline.
 */
export default function StatusMover({ contract, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const next = NEXT[contract.status];
  if (!next) return <span className="muted">Finished</span>;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api(`/contracts/${contract.id}/status`, { method: 'PATCH', body: { status: next.to } });
      onChanged?.(updated);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mover">
      <button className="btn btn-small" onClick={go} disabled={busy}>
        {busy ? 'Saving…' : next.label}
      </button>
      {error && (
        <p className="inline-error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}
