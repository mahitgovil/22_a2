import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useActor } from '../actor.jsx';
import { useAsync } from '../hooks.js';
import { Async, Card, Empty, Pager, Stat } from '../components/ui.jsx';
import { COLORS, LineChart } from '../components/charts.jsx';
import { dateTime, money, moneyShort, num } from '../format.js';

export default function Audit() {
  const { clientId, setClientId, tick } = useActor();
  const [params] = useSearchParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // /audit?client=7 (from the client page) switches the acting client.
  useEffect(() => {
    const c = Number(params.get('client'));
    if (c && c !== clientId) setClientId(c);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [clientId, from, to]);

  const invalidRange = from && to && from > to;
  const state = useAsync(
    () => (invalidRange ? Promise.resolve(null) : api(`/clients/${clientId}/audit`, { params: { from, to, page, pageSize: 20 } })),
    [clientId, from, to, page, tick],
  );

  return (
    <>
      <Card title="Wallet audit trail">
        <p className="muted">Every change to the escrow balance is recorded by a database trigger. This view is read-only.</p>
        <div className="filters">
          <div className="field">
            <label htmlFor="from">From</label>
            <input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="to">To</label>
            <input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to) && <button className="btn btn-small align-end" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
        </div>
        {invalidRange && <div className="notice notice-error" role="alert"><strong>The start date is after the end date.</strong><p>Pick a start date on or before the end date.</p></div>}
      </Card>

      {!invalidRange && (
        <Async
          state={state}
          isEmpty={(d) => d.items.length === 0}
          empty={<Card><Empty title="No wallet activity in this period">Clear the date filter, or fund a gig to create the first entry.</Empty></Card>}
        >
          {(d) => (
            <>
              <div className="stats">
                <Stat label="Balance at start of range" value={money(d.summary.opening_balance)} />
                <Stat label="Money in" value={money(d.summary.total_credits)} />
                <Stat label="Money out" value={money(d.summary.total_debits)} />
                <Stat label="Balance at end of range" value={money(d.summary.closing_balance)} note={`Current balance ${money(d.client.escrow_balance)}`} />
              </div>
              <Card title={`Running balance, page ${d.page}`}>
                <LineChart
                  label="Running balance over the entries on this page"
                  labels={[...d.items].reverse().map((r) => dateTime(r.created_at))}
                  datasets={[{ label: 'Balance', data: [...d.items].reverse().map((r) => r.running_balance), borderColor: COLORS.brand, backgroundColor: COLORS.brandSoft, fill: true, tension: 0.15, pointRadius: 2 }]}
                  yFormat={moneyShort}
                  height={220}
                />
              </Card>
              <Card title={`${num(d.total)} entries for ${d.client.name}`}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Entry</th><th>When</th><th>Type</th><th className="r">Change</th><th className="r">Running balance</th></tr>
                    </thead>
                    <tbody>
                      {d.items.map((r) => (
                        <tr key={r.id}>
                          <td data-label="Entry">#{r.id}</td>
                          <td data-label="When">{dateTime(r.created_at)}</td>
                          <td data-label="Type">{r.action_type === 'DEBIT' ? 'Debit (money out)' : 'Credit (money in)'}</td>
                          <td className={`r num ${r.signed_change < 0 ? 'neg' : 'pos'}`} data-label="Change">{r.signed_change < 0 ? '−' : '+'}{money(Math.abs(r.signed_change))}</td>
                          <td className="r num" data-label="Running balance">{money(r.running_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
              </Card>
            </>
          )}
        </Async>
      )}
    </>
  );
}
