import { Component, useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAsync, useDebounced } from '../hooks.js';
import { money } from '../format.js';

export function Loading({ label = 'Loading…', rows = 5 }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${100 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error, onRetry, title = 'Could not load this' }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <strong>{title}</strong>
      <p>{error.message}</p>
      {onRetry && (
        <button className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Catches render errors in a screen so the rest of the app stays usable. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorBox title="This screen hit an error" error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Shows loading / error / empty / content for one async result. */
export function Async({ state, isEmpty, empty, children, rows }) {
  if (state.loading && !state.data) return <Loading rows={rows} />;
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />;
  if (state.data && isEmpty?.(state.data)) return empty;
  if (!state.data) return null;
  return <div className={state.loading ? 'is-refreshing' : undefined}>{children(state.data)}</div>;
}

export function StatusBadge({ status }) {
  const cls = { FUNDED: 'funded', 'IN PROGRESS': 'progress', COMPLETED: 'done' }[status] || 'funded';
  return <span className={`badge badge-${cls}`}>{status.toLowerCase()}</span>;
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted">
        {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}
      </span>
      <div className="pager-buttons">
        <button className="btn btn-small" disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
        <button className="btn btn-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="pager-page">Page {page} of {pages.toLocaleString('en-IN')}</span>
        <button className="btn btn-small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}

export function Stat({ label, value, note }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Search-as-you-type picker for freelancers (by name or id).
 * value: freelancer id or null. onChange(id|null, record|null).
 */
export function FreelancerPicker({ value, onChange, allowNone, noneLabel = 'All freelancers', label = 'Freelancer' }) {
  const inputId = useId();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null);
  const q = useDebounced(text, 250);
  const box = useRef(null);

  const results = useAsync(
    () => (open ? api('/freelancers', { params: { q: q.trim() || undefined, pageSize: 8 } }) : Promise.resolve(null)),
    [q, open],
  );

  // Resolve the display name for an externally-set value.
  useEffect(() => {
    if (value && picked?.id !== value) {
      api(`/freelancers/${value}`).then((f) => setPicked({ id: f.id, name: f.name })).catch(() => setPicked({ id: value, name: '' }));
    }
    if (!value) setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const shown = open ? text : picked ? `#${picked.id}${picked.name ? ' ' + picked.name : ''}` : allowNone ? noneLabel : '';

  return (
    <div className="field combo" ref={box}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        placeholder="Search by name or ID"
        value={shown}
        onFocus={() => { setOpen(true); setText(''); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      {open && (
        <ul className="combo-list" id={listId} role="listbox">
          {allowNone && (
            <li role="option" aria-selected={!value}>
              <button type="button" onClick={() => { onChange(null, null); setOpen(false); }}>{noneLabel}</button>
            </li>
          )}
          {results.loading && <li className="combo-note">Searching…</li>}
          {results.error && <li className="combo-note">{results.error.message}</li>}
          {results.data?.items.length === 0 && <li className="combo-note">No freelancer matches “{text}”.</li>}
          {results.data?.items.map((f) => (
            <li key={f.id} role="option" aria-selected={f.id === value}>
              <button type="button" onClick={() => { setPicked(f); onChange(f.id, f); setOpen(false); }}>
                <span className="num">#{f.id}</span> {f.name}
                {!f.is_available && <span className="muted"> · unavailable</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact client picker + balance chip used in the top bar. */
export function ClientPicker({ onPick }) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 250);
  const results = useAsync(() => api('/clients', { params: { q: q.trim() || undefined, pageSize: 8 } }), [q]);
  return (
    <div className="popover-body">
      <label className="sr-only" htmlFor="client-search">Search clients</label>
      <input id="client-search" autoFocus placeholder="Search clients by name or ID" value={text} onChange={(e) => setText(e.target.value)} />
      <Async state={results} isEmpty={(d) => d.items.length === 0} empty={<Empty title="No client found">Try a different name or an ID.</Empty>} rows={3}>
        {(d) => (
          <ul className="pick-list">
            {d.items.map((c) => (
              <li key={c.id}>
                <button onClick={() => onPick(c)}>
                  <span><span className="num">#{c.id}</span> {c.name}</span>
                  <span className="num muted">{money(c.escrow_balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  );
}
