import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useActor } from '../actor.jsx';
import { useAsync } from '../hooks.js';
import { Async, Card, Empty, FreelancerPicker, StatusBadge } from '../components/ui.jsx';
import StatusMover from '../components/StatusMover.jsx';
import { dateTime, money } from '../format.js';

export default function Fund() {
  const { clientId, client, bump, tick } = useActor();
  const [params] = useSearchParams();
  const [freelancerId, setFreelancerId] = useState(params.get('freelancer') ? Number(params.get('freelancer')) : null);
  const [budget, setBudget] = useState('250');
  const [startNow, setStartNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, ... }

  const recent = useAsync(() => api('/contracts', { params: { clientId, pageSize: 6 } }), [clientId, tick]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const before = client?.escrow_balance;
    try {
      const data = await api('/contracts/fund', { method: 'POST', body: { clientId, freelancerId, budget: Number(budget), startNow } });
      setResult({ ok: true, ...data });
    } catch (err) {
      setResult({ ok: false, error: err, balanceBefore: before, balanceAfter: err.extra?.balanceAfterFailure ?? before });
    } finally {
      setBusy(false);
      bump(); // refresh the balance in the top bar and the recent list
    }
  };

  // Demo shortcuts that set up the two failure cases.
  const tryTooMuch = () => setBudget(String(Math.floor((client?.escrow_balance ?? 0) + 1)));
  const tryBusy = async () => {
    try {
      const d = await api('/contracts', { params: { status: 'IN PROGRESS', pageSize: 1 } });
      if (d.items[0]) { setFreelancerId(d.items[0].freelancer_id); setStartNow(true); setBudget('100'); }
    } catch (err) { setResult({ ok: false, error: err }); }
  };

  const canSubmit = freelancerId && Number(budget) > 0 && !busy && client;

  return (
    <div className="two-col">
      <div>
        <Card title="Fund a gig">
          <form onSubmit={submit} className="form" noValidate>
            <p className="muted">
              Money is held in escrow for <strong>{client ? client.name : `client #${clientId}`}</strong>. Funding takes the budget out of the
              escrow balance and creates the contract in one step.
            </p>
            <FreelancerPicker value={freelancerId} onChange={(id) => setFreelancerId(id)} label="Freelancer to hire" />
            <div className="field">
              <label htmlFor="budget">Budget (₹)</label>
              <input id="budget" type="number" min="1" step="0.01" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <label className="check">
              <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
              <span>Start work right away <span className="muted">(contract begins in progress instead of funded)</span></span>
            </label>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
                {busy ? 'Funding…' : 'Fund gig'}
              </button>
              {!freelancerId && <span className="muted">Choose a freelancer first.</span>}
            </div>
          </form>
          <details className="demo">
            <summary>Demo shortcuts</summary>
            <p className="muted">Fill the form so a failure is easy to show.</p>
            <div className="row">
              <button type="button" className="btn btn-small" onClick={tryTooMuch}>Ask for more than the balance</button>
              <button type="button" className="btn btn-small" onClick={tryBusy}>Hire a freelancer who is already working</button>
            </div>
          </details>
        </Card>

        <Card title={`Latest contracts for ${client?.name ?? `client #${clientId}`}`}>
          <p className="muted">Move a contract along to see the one-active-contract rule in action: start two contracts for the same freelancer and the second is refused.</p>
          <Async state={recent} isEmpty={(d) => d.items.length === 0} empty={<Empty title="No contracts yet">Fund a gig above to create the first one.</Empty>} rows={3}>
            {(d) => (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Contract</th><th>Freelancer</th><th className="r">Budget</th><th>Status</th><th>Next step</th></tr></thead>
                  <tbody>
                    {d.items.map((c) => (
                      <tr key={c.id}>
                        <td data-label="Contract"><Link to={`/browse/contracts/${c.id}`}>#{c.id}</Link></td>
                        <td data-label="Freelancer">#{c.freelancer_id} {c.freelancer_name}</td>
                        <td className="r num" data-label="Budget">{money(c.budget)}</td>
                        <td data-label="Status"><StatusBadge status={c.status} /></td>
                        <td data-label="Next step"><StatusMover contract={c} onChanged={() => { recent.reload(); bump(); }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Card>
      </div>

      <div aria-live="polite">
        {!result && (
          <Card title="Result">
            <Empty title="Nothing submitted yet">Fund a gig to see the balance change and the audit entry the database writes.</Empty>
          </Card>
        )}
        {result?.ok && <Success r={result} />}
        {result && !result.ok && <Failure r={result} />}
      </div>
    </div>
  );
}

function Balances({ before, after }) {
  const changed = before !== after;
  return (
    <div className="balances">
      <div><span className="stat-label">Balance before</span><span className="stat-value num">{money(before)}</span></div>
      <div className={changed ? 'bal-after changed' : 'bal-after'}><span className="stat-label">Balance after</span><span className="stat-value num">{money(after)}</span></div>
    </div>
  );
}

function Success({ r }) {
  return (
    <Card title="Gig funded" className="card-ok">
      <Balances before={r.balanceBefore} after={r.balanceAfter} />
      <p>
        Contract <Link to={`/browse/contracts/${r.contract.id}`}>#{r.contract.id}</Link> was created as <StatusBadge status={r.contract.status} /> for{' '}
        <strong className="num">{money(r.contract.budget)}</strong>.
      </p>
      <h3>Audit entry written by the database trigger</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Entry</th><th>Type</th><th className="r">Amount</th><th className="r">Balance after</th><th>When</th></tr></thead>
          <tbody>
            {r.auditEntries.map((a) => (
              <tr key={a.id}>
                <td data-label="Entry">#{a.id}</td>
                <td data-label="Type">{a.action_type.toLowerCase()}</td>
                <td className="r num" data-label="Amount">{money(a.amount_changed)}</td>
                <td className="r num" data-label="Balance after">{money(a.balance_after)}</td>
                <td data-label="When">{dateTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Procedure used: <code>{r.procedure}</code>.</p>
    </Card>
  );
}

function Failure({ r }) {
  return (
    <Card title="Gig not funded" className="card-fail">
      <div className="notice notice-error" role="alert">
        <strong>{r.error.message}</strong>
      </div>
      {r.balanceAfter !== undefined && <Balances before={r.balanceBefore} after={r.balanceAfter} />}
      {r.error.code === 'FREELANCER_BUSY' || r.error.code === 'INSUFFICIENT_BALANCE' ? (
        <p className="muted">The whole request was rolled back, so there is no new contract and no new audit entry.</p>
      ) : null}
      {r.error.code && <p className="muted">Reason code: <code>{r.error.code}</code></p>}
    </Card>
  );
}
