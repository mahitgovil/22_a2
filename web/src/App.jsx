import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useActor } from './actor.jsx';
import { ClientPicker, ErrorBoundary } from './components/ui.jsx';
import { money } from './format.js';
import Browse from './screens/Browse.jsx';
import Fund from './screens/Fund.jsx';
import Audit from './screens/Audit.jsx';
import Analytics from './screens/Analytics.jsx';
import MapScreen from './screens/MapScreen.jsx';
import Reviews from './screens/Reviews.jsx';

const NAV = [
  { to: '/browse', label: 'Browse' },
  { to: '/fund', label: 'Fund a gig' },
  { to: '/audit', label: 'Audit trail' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/map', label: 'Map' },
  { to: '/reviews', label: 'Reviews' },
];

function ActorSwitcher() {
  const { client, clientId, error, setClientId } = useActor();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <div className="actor" ref={ref}>
      <span className="actor-label">Acting as client</span>
      <button className="actor-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {error ? (
          <span>Client #{clientId} · unavailable</span>
        ) : client ? (
          <>
            <span className="actor-name">#{client.id} {client.name}</span>
            <span className="num actor-balance">{money(client.escrow_balance)}</span>
          </>
        ) : (
          <span>Loading client…</span>
        )}
        <span aria-hidden="true" className="caret">▾</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Switch client">
          <ClientPicker onPick={(c) => { setClientId(c.id); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const title = NAV.find((n) => pathname.startsWith(n.to))?.label ?? 'GigTask';
  useEffect(() => {
    document.title = `${title} · GigTask Desk`;
  }, [title]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GigTask <span className="brand-sub">Desk</span></span>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <p className="side-foot">Freelance micro-jobs. PostgreSQL holds the money, MongoDB holds the maps and reviews.</p>
      </aside>
      <div className="main">
        <header className="top">
          <h1>{title}</h1>
          <ActorSwitcher />
        </header>
        <main className="content" id="content">
          {/* key: navigating to another page clears a previous error */}
          <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/browse/contracts" replace />} />
            <Route path="/browse" element={<Navigate to="/browse/contracts" replace />} />
            <Route path="/browse/:entity" element={<Browse />} />
            <Route path="/browse/:entity/:id" element={<Browse />} />
            <Route path="/fund" element={<Fund />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/map" element={<MapScreen />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="*" element={<div className="empty"><strong>Page not found</strong><p>Use the menu to pick a screen.</p></div>} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
