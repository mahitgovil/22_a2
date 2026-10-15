import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { Async, Card, Empty, FreelancerPicker, Pager, Stat } from '../components/ui.jsx';
import { COLORS, LineChart } from '../components/charts.jsx';
import { dateOnly, dateTime, money, moneyShort, num } from '../format.js';

export default function Analytics() {
  return (
    <>
      <Summary />
      <MovingAverage />
      <Ranking />
    </>
  );
}

function Summary() {
  const state = useAsync(() => api('/analytics/summary'), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const refresh = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/analytics/refresh', { method: 'POST' });
      state.reload();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Lifetime earnings summary"
      actions={
        <button className="btn btn-small" onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh data'}
        </button>
      }
    >
      {err && <div className="notice notice-error" role="alert"><strong>Refresh failed</strong><p>{err.message}</p></div>}
      <Async state={state}>
        {(d) => (
          <>
            <p className="muted">
              Read from a stored summary of completed contracts, so it loads instantly. Last refreshed{' '}
              <strong>{d.lastRefreshed ? dateTime(d.lastRefreshed) : 'never'}</strong>
              {d.lastRefreshDurationMs ? ` (took ${Math.round(d.lastRefreshDurationMs)} ms)` : ''}. New completed contracts appear here after a refresh.
            </p>
            <div className="stats">
              <Stat label="Total earned by freelancers" value={moneyShort(d.total_earnings)} note={`${num(d.completed_contracts)} completed contracts`} />
              <Stat label="Freelancers who have earned" value={num(d.earning_freelancers)} note={`of ${num(d.freelancers)}`} />
              <Stat label="Average per freelancer" value={money(d.avg_earnings)} />
              <Stat label="Highest earner" value={moneyShort(d.max_earnings)} note={d.topEarners[0]?.name} />
            </div>
          </>
        )}
      </Async>
    </Card>
  );
}

function MovingAverage() {
  const [freelancerId, setFreelancerId] = useState(null);
  const [days, setDays] = useState(90);
  const state = useAsync(() => api('/analytics/moving-average', { params: { freelancerId, days } }), [freelancerId, days]);

  return (
    <Card title="Revenue and 7-day moving average">
      <div className="filters">
        <FreelancerPicker value={freelancerId} onChange={(id) => setFreelancerId(id)} allowNone noneLabel="All freelancers (platform)" label="Show revenue for" />
        <div className="field">
          <label htmlFor="days">Period</label>
          <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 365 days</option>
          </select>
        </div>
      </div>
      <Async
        state={state}
        isEmpty={(d) => d.points.every((p) => p.revenue === 0)}
        empty={<Empty title="No completed contracts in this period">This freelancer earned nothing in the chosen period. Try a longer period or another freelancer.</Empty>}
      >
        {(d) => (
          <LineChart
            label={`Daily revenue and 7-day moving average for ${d.freelancer?.name}`}
            labels={d.points.map((p) => dateOnly(p.day))}
            datasets={[
              { label: 'Daily revenue', data: d.points.map((p) => p.revenue), borderColor: 'rgba(35,66,230,0.35)', backgroundColor: COLORS.brandSoft, fill: true, tension: 0, pointRadius: 0, borderWidth: 1 },
              { label: '7-day moving average', data: d.points.map((p) => p.revenue_7_day_moving_avg), borderColor: COLORS.brand, tension: 0.25, pointRadius: 0, borderWidth: 3 },
            ]}
            yFormat={moneyShort}
            height={300}
          />
        )}
      </Async>
    </Card>
  );
}

function Ranking() {
  const [page, setPage] = useState(1);
  const state = useAsync(() => api('/analytics/ranking', { params: { page, pageSize: 10 } }), [page]);
  return (
    <Card title="Freelancer revenue ranking">
      <p className="muted">Ranked by lifetime revenue from completed contracts. Freelancers with the same revenue share a rank.</p>
      <Async state={state} isEmpty={(d) => d.items.length === 0} empty={<Empty title="No freelancers to rank">Seed the database to see the leaderboard.</Empty>}>
        {(d) => (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Rank</th><th>Freelancer</th><th className="r">Completed</th><th className="r">Lifetime revenue</th></tr></thead>
                <tbody>
                  {d.items.map((r) => (
                    <tr key={r.freelancer_id}>
                      <td className="num" data-label="Rank">{r.revenue_rank}</td>
                      <td data-label="Freelancer"><Link to={`/browse/freelancers/${r.freelancer_id}`}>#{r.freelancer_id} {r.name}</Link></td>
                      <td className="r num" data-label="Completed">{r.completed_contracts}</td>
                      <td className="r num" data-label="Lifetime revenue">{money(r.lifetime_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Async>
    </Card>
  );
}
