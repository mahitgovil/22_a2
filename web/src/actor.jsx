import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { store } from './format.js';

/**
 * Demo "who am I" switcher (no real login). The current actor is a client,
 * because clients own the wallet that Workflow 1 and the audit trail use.
 * `bump()` re-reads the client after a transaction so balances stay fresh.
 */
const Ctx = createContext(null);
export const useActor = () => useContext(Ctx);

export function ActorProvider({ children }) {
  const [clientId, setClientIdState] = useState(() => store.get('gigtask.clientId', 1));
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const setClientId = useCallback((id) => {
    setClientIdState(id);
    store.set('gigtask.clientId', id);
  }, []);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setError(null);
    api(`/clients/${clientId}`)
      .then((c) => live && setClient(c))
      .catch((e) => live && (setClient(null), setError(e)));
    return () => { live = false; };
  }, [clientId, tick]);

  const value = useMemo(() => ({ clientId, client, error, setClientId, bump, tick }), [clientId, client, error, setClientId, bump, tick]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
