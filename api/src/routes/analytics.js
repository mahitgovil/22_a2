import { Router } from 'express';
import { query } from '../db/pg.js';
import { ah, intParam, paging } from '../errors.js';

const r = Router();

// Workflow 2: 7-day moving average (window function over a calendar series).
r.get('/analytics/moving-average', ah(async (req, res) => {
  const freelancerId = req.query.freelancerId ? intParam(req.query.freelancerId, 'freelancerId') : null;
  const days = intParam(req.query.days, 'days', { def: 90, min: 7, max: 730 });
  const [series, who] = await Promise.all([
    query('SELECT * FROM fn_freelancer_moving_average($1, $2)', [freelancerId, days]),
    freelancerId
      ? query('SELECT id, name FROM freelancers WHERE id = $1', [freelancerId])
      : Promise.resolve({ rows: [{ id: null, name: 'All freelancers (platform)' }] }),
  ]);
  res.json({ freelancer: who.rows[0] ?? null, days, points: series.rows });
}));

// Workflow 2: DENSE_RANK() leaderboard.
r.get('/analytics/ranking', ah(async (req, res) => {
  const p = paging(req.query);
  const [rows, total] = await Promise.all([
    query('SELECT * FROM fn_freelancer_revenue_ranking($1, $2)', [p.pageSize, p.offset]),
    query('SELECT COUNT(*)::int AS total FROM freelancers'),
  ]);
  res.json({ items: rows.rows, total: total.rows[0].total, page: p.page, pageSize: p.pageSize });
}));

// Summary numbers read ONLY from the materialized view + its refresh log.
r.get('/analytics/summary', ah(async (_req, res) => {
  const [summary, top, refreshed] = await Promise.all([
    query(
      `SELECT COUNT(*)::int                                     AS freelancers,
              COUNT(*) FILTER (WHERE completed_contracts > 0)::int AS earning_freelancers,
              COALESCE(SUM(completed_contracts), 0)::int        AS completed_contracts,
              COALESCE(SUM(total_earnings), 0)                  AS total_earnings,
              ROUND(COALESCE(AVG(total_earnings), 0), 2)        AS avg_earnings,
              COALESCE(MAX(total_earnings), 0)                  AS max_earnings
         FROM freelancer_lifetime_summary`),
    query(
      `SELECT freelancer_id, name, completed_contracts, total_earnings
         FROM freelancer_lifetime_summary ORDER BY total_earnings DESC, freelancer_id LIMIT 5`),
    query(
      `SELECT refreshed_at, duration_ms FROM mv_refresh_log WHERE view_name = 'freelancer_lifetime_summary'`),
  ]);
  res.json({
    ...summary.rows[0],
    topEarners: top.rows,
    lastRefreshed: refreshed.rows[0]?.refreshed_at ?? null,
    lastRefreshDurationMs: refreshed.rows[0]?.duration_ms ?? null,
  });
}));

// Refresh the materialized view (Part A function, now also logs the time).
r.post('/analytics/refresh', ah(async (_req, res) => {
  await query('SELECT refresh_freelancer_lifetime_summary()');
  const log = await query(
    `SELECT refreshed_at, duration_ms FROM mv_refresh_log WHERE view_name = 'freelancer_lifetime_summary'`);
  res.json({ lastRefreshed: log.rows[0].refreshed_at, lastRefreshDurationMs: log.rows[0].duration_ms });
}));

export default r;
