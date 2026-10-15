import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync, useDebounced } from '../hooks.js';
import { Async, Card, Empty, Pager, Stat, StatusBadge } from '../components/ui.jsx';
import StatusMover from '../components/StatusMover.jsx';
import { useActor } from '../actor.jsx';
import { dateTime, money, num } from '../format.js';

const ENTITIES = [
  { key: 'contracts', label: 'Contracts' },
  { key: 'clients', label: 'Clients' },
  { key: 'freelancers', label: 'Freelancers' },
];

export default function Browse() {
  const { entity, id } = useParams();
  if (!ENTITIES.some((e) => e.key === entity)) {
    return <Empty title="Unknown list">Pick contracts, clients or freelancers.</Empty>;
  }
  return (
    <>
      <div className="tabs" role="tablist" aria-label="What to browse">
        {ENTITIES.map((e) => (
          <NavLink key={e.key} to={`/browse/${e.key}`} role="tab" className={({ isActive }) => (isActive || entity === e.key ? 'tab active' : 'tab')}>
            {e.label}
          </NavLink>
        ))}
      </div>
      {/* key: remount per list so one list's rows never render with another's columns */}
      {id ? <Detail entity={entity} id={id} /> : <List key={entity} entity={entity} />}
    </>
  );
}

/* ---------------- list screens ---------------- */

const COLUMNS = {
  contracts: [
    { h: 'Contract', c: (r) => <Link to={`/browse/contracts/${r.id}`}>#{r.id}</Link> },
    { h: 'Client', c: (r) => <Link to={`/browse/clients/${r.client_id}`}>{r.client_name}</Link> },
    { h: 'Freelancer', c: (r) => <Link to={`/browse/freelancers/${r.freelancer_id}`}>{r.freelancer_name}</Link> },
    { h: 'Budget', n: true, c: (r) => money(r.budget) },
    { h: 'Status', c: (r) => <StatusBadge status={r.status} /> },
    { h: 'Created', c: (r) => dateTime(r.created_at) },
  ],
  clients: [
    { h: 'Client', c: (r) => <Link to={`/browse/clients/${r.id}`}>#{r.id}</Link> },
    { h: 'Name', c: (r) => r.name },
    { h: 'Escrow balance', n: true, c: (r) => money(r.escrow_balance) },
  ],
  freelancers: [
    { h: 'Freelancer', c: (r) => <Link to={`/browse/freelancers/${r.id}`}>#{r.id}</Link> },
    { h: 'Name', c: (r) => r.name },
    { h: 'Availability', c: (r) => (r.is_available ? 'Available' : 'Unavailable') },
    { h: 'Home location', c: (r) => `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` },
  ],
};

function List({ entity }) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const status = params.get('status') || '';
  const available = params.get('available') || '';
  const [text, setText] = useState(params.get('q') || '');
  const q = useDebounced(text, 300);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') || '') !== q) set({ q, page: '' });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = {
    page,
    pageSize: 15,
    q: entity !== 'contracts' ? q : undefined,
    id: entity === 'contracts' && /^\d+$/.test(q) ? q : undefined,
    status: entity === 'contracts' ? status : undefined,
    available: entity === 'freelancers' ? available : undefined,
  };
  const state = useAsync(() => api(`/${entity}`, { params: query }), [entity, page, q, status, available]);
  const cols = COLUMNS[entity];

  return (
    <Card>
      <div className="filters">
        <div className="field">
          <label htmlFor="search">{entity === 'contracts' ? 'Contract number' : 'Name or ID'}</label>
          <input id="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={entity === 'contracts' ? 'e.g. 50001' : 'e.g. Joshua or 12'} />
        </div>
        {entity === 'contracts' && (
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" value={status} onChange={(e) => set({ status: e.target.value, page: '' })}>
              <option value="">All statuses</option>
              <option>FUNDED</option>
              <option>IN PROGRESS</option>
              <option>COMPLETED</option>
            </select>
          </div>
        )}
        {entity === 'freelancers' && (
          <div className="field">
            <label htmlFor="avail">Availability</label>
            <select id="avail" value={available} onChange={(e) => set({ available: e.target.value, page: '' })}>
              <option value="">Everyone</option>
              <option value="true">Available</option>
              <option value="false">Unavailable</option>
            </select>
          </div>
        )}
      </div>

      <Async
        state={state}
        isEmpty={(d) => d.items.length === 0}
        empty={<Empty title="No results">Nothing matches these filters. Clear the search or choose another status.</Empty>}
      >
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{cols.map((c) => <th key={c.h} className={c.n ? 'r' : undefined}>{c.h}</th>)}</tr>
                </thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.id}>
                      {cols.map((c) => <td key={c.h} className={c.n ? 'r num' : undefined} data-label={c.h}>{c.c(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set({ page: p > 1 ? String(p) : '' })} />
          </>
        )}
      </Async>
    </Card>
  );
}

/* ---------------- detail screens ---------------- */

function Detail({ entity, id }) {
  return (
    <>
      <p><Link to={`/browse/${entity}`}>← Back to {entity}</Link></p>
      {entity === 'contracts' && <ContractDetail id={id} />}
      {entity === 'clients' && <ClientDetail id={id} />}
      {entity === 'freelancers' && <FreelancerDetail id={id} />}
    </>
  );
}

function ContractDetail({ id }) {
  const state = useAsync(() => api(`/contracts/${id}`), [id]);
  return (
    <Async state={state}>
      {(c) => (
        <Card title={`Contract #${c.id}`} actions={<StatusBadge status={c.status} />}>
          <dl className="facts">
            <div><dt>Client</dt><dd><Link to={`/browse/clients/${c.client_id}`}>#{c.client_id} {c.client_name}</Link></dd></div>
            <div><dt>Freelancer</dt><dd><Link to={`/browse/freelancers/${c.freelancer_id}`}>#{c.freelancer_id} {c.freelancer_name}</Link></dd></div>
            <div><dt>Budget</dt><dd className="num">{money(c.budget)}</dd></div>
            <div><dt>Created</dt><dd>{dateTime(c.created_at)}</dd></div>
          </dl>
          <div className="row">
            <StatusMover contract={c} onChanged={state.reload} />
          </div>
          <p className="muted">Contracts move from funded to in progress to completed. A freelancer can only have one contract in progress at a time.</p>
        </Card>
      )}
    </Async>
  );
}

function ContractMiniTable({ rows, who }) {
  if (!rows.length) return <Empty title="No contracts yet">Fund a gig to create the first one.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Contract</th><th>{who}</th><th className="r">Budget</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td data-label="Contract"><Link to={`/browse/contracts/${r.id}`}>#{r.id}</Link></td>
              <td data-label={who}>{r.client_name ?? r.freelancer_name}</td>
              <td className="r num" data-label="Budget">{money(r.budget)}</td>
              <td data-label="Status"><StatusBadge status={r.status} /></td>
              <td data-label="Created">{dateTime(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientDetail({ id }) {
  const state = useAsync(() => api(`/clients/${id}`), [id]);
  const { setClientId } = useActor();
  const navigate = useNavigate();
  return (
    <Async state={state}>
      {(c) => (
        <>
          <Card
            title={`#${c.id} ${c.name}`}
            actions={
              <button className="btn btn-small" onClick={() => { setClientId(c.id); navigate('/fund'); }}>
                Act as this client
              </button>
            }
          >
            <div className="stats">
              <Stat label="Escrow balance" value={money(c.escrow_balance)} />
              <Stat label="Contracts" value={num(c.stats.contracts)} note={`${c.stats.funded} funded · ${c.stats.in_progress} in progress · ${c.stats.completed} completed`} />
              <Stat label="Total committed" value={money(c.stats.total_spent)} />
            </div>
            <p><Link to={`/audit?client=${c.id}`} onClick={() => setClientId(c.id)}>See this client's audit trail</Link></p>
          </Card>
          <Card title="Latest contracts">
            <ContractMiniTable rows={c.recentContracts} who="Freelancer" />
          </Card>
        </>
      )}
    </Async>
  );
}

function FreelancerDetail({ id }) {
  const state = useAsync(() => api(`/freelancers/${id}`), [id]);
  return (
    <Async state={state}>
      {(f) => (
        <>
          <Card title={`#${f.id} ${f.name}`} actions={<span className={`badge ${f.is_available ? 'badge-done' : 'badge-funded'}`}>{f.is_available ? 'available' : 'unavailable'}</span>}>
            <div className="stats">
              <Stat label="Lifetime earnings" value={money(f.total_earnings)} note="from the materialized view" />
              <Stat label="Completed contracts" value={num(f.completed_contracts)} />
              <Stat label="Home location" value={`${f.latitude.toFixed(3)}, ${f.longitude.toFixed(3)}`} />
            </div>
            <p><Link to={`/fund?freelancer=${f.id}`}>Fund a gig for this freelancer</Link></p>
          </Card>
          <Card title="Portfolio">
            <Portfolio doc={f.portfolio} error={f.portfolioError} />
          </Card>
          <Card title="Latest contracts">
            <ContractMiniTable rows={f.recentContracts} who="Client" />
          </Card>
        </>
      )}
    </Async>
  );
}

/* ---------------- flexible portfolio document ---------------- */

const KNOWN = ['freelancer_id', 'headline', 'skills', 'years_experience', 'hourly_rate', 'rates_by_skill', 'projects', 'certifications', 'languages', 'links'];

export function Portfolio({ doc, error }) {
  if (error) return <div className="notice notice-error" role="alert"><strong>Portfolio unavailable</strong><p>{error}</p></div>;
  if (!doc) return <Empty title="No portfolio on file">This freelancer has not added a portfolio.</Empty>;
  const extra = Object.entries(doc).filter(([k]) => !KNOWN.includes(k));
  return (
    <div className="portfolio">
      <p className="lead">{doc.headline}</p>
      {doc.skills && <div className="chips">{doc.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
      <dl className="facts">
        {doc.years_experience !== undefined && <div><dt>Experience</dt><dd>{doc.years_experience} years</dd></div>}
        {doc.hourly_rate && <div><dt>Hourly rate</dt><dd className="num">{money(doc.hourly_rate.amount)}</dd></div>}
        {doc.languages && <div><dt>Languages</dt><dd>{doc.languages.join(', ')}</dd></div>}
      </dl>
      {doc.rates_by_skill && (
        <>
          <h3>Rates by skill</h3>
          <dl className="facts">{Object.entries(doc.rates_by_skill).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{money(v)} / hour</dd></div>)}</dl>
        </>
      )}
      {doc.projects && (
        <>
          <h3>Projects</h3>
          <ul className="plain">
            {doc.projects.map((p, i) => (
              <li key={i}>
                <strong>{p.title}</strong> for {p.client} ({p.year})
                {p.tech && <span className="muted"> · {p.tech.join(', ')}</span>}
                {p.link && <> · <a href={p.link} target="_blank" rel="noreferrer">link</a></>}
              </li>
            ))}
          </ul>
        </>
      )}
      {doc.certifications && (
        <>
          <h3>Certifications</h3>
          <ul className="plain">{doc.certifications.map((c, i) => <li key={i}>{c.name}, {c.issuer} ({c.year})</li>)}</ul>
        </>
      )}
      {doc.links && (
        <>
          <h3>Links</h3>
          <ul className="plain">{Object.entries(doc.links).map(([k, v]) => <li key={k}>{k}: <a href={v} target="_blank" rel="noreferrer">{v}</a></li>)}</ul>
        </>
      )}
      {extra.length > 0 && (
        <>
          <h3>Other details</h3>
          <dl className="facts">{extra.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>)}</dl>
        </>
      )}
      <details className="raw">
        <summary>View the raw MongoDB document</summary>
        <pre>{JSON.stringify(doc, null, 2)}</pre>
      </details>
    </div>
  );
}
