import { Router } from 'express';
import { query } from '../db/pg.js';
import { getDb } from '../db/mongo.js';
import { ah, HttpError, intParam, paging } from '../errors.js';

const r = Router();

// Builds "WHERE ..." from optional filters. Values are always parameterised.
function where(filters) {
  const clauses = [];
  const params = [];
  for (const [sql, value] of filters) {
    if (value === undefined || value === null || value === '') continue;
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function pageOf(baseSql, countSql, w, { pageSize, offset, page }, orderBy) {
  const n = w.params.length;
  const [rows, count] = await Promise.all([
    query(`${baseSql} ${w.sql} ${orderBy} LIMIT $${n + 1} OFFSET $${n + 2}`, [...w.params, pageSize, offset]),
    query(`${countSql} ${w.sql}`, w.params),
  ]);
  return { items: rows.rows, total: count.rows[0].total, page, pageSize };
}

const idOrName = (q) => (q && /^\d+$/.test(q) ? Number(q) : undefined);

// ---------- Clients ----------
r.get('/clients', ah(async (req, res) => {
  const p = paging(req.query);
  const q = (req.query.q || '').trim();
  const w = where([
    ['id = ?', idOrName(q)],
    ['name ILIKE ?', q && !idOrName(q) ? `%${q}%` : undefined],
  ]);
  res.json(await pageOf(
    'SELECT id, name, escrow_balance FROM clients',
    'SELECT COUNT(*)::int AS total FROM clients',
    w, p, 'ORDER BY id',
  ));
}));

r.get('/clients/:id', ah(async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const c = await query('SELECT id, name, escrow_balance FROM clients WHERE id = $1', [id]);
  if (!c.rowCount) throw new HttpError(404, 'NOT_FOUND', `Client #${id} does not exist.`);
  const [stats, recent] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS contracts,
              COUNT(*) FILTER (WHERE status = 'FUNDED')::int      AS funded,
              COUNT(*) FILTER (WHERE status = 'IN PROGRESS')::int AS in_progress,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int   AS completed,
              COALESCE(SUM(budget), 0) AS total_spent
         FROM contracts WHERE client_id = $1`, [id]),
    query(
      `SELECT c.id, c.freelancer_id, f.name AS freelancer_name, c.budget, c.status, c.created_at
         FROM contracts c JOIN freelancers f ON f.id = c.freelancer_id
        WHERE c.client_id = $1 ORDER BY c.created_at DESC LIMIT 10`, [id]),
  ]);
  res.json({ ...c.rows[0], stats: stats.rows[0], recentContracts: recent.rows });
}));

// ---------- Freelancers ----------
r.get('/freelancers', ah(async (req, res) => {
  const p = paging(req.query);
  const q = (req.query.q || '').trim();
  const avail = req.query.available === 'true' ? true : req.query.available === 'false' ? false : undefined;
  const w = where([
    ['id = ?', idOrName(q)],
    ['name ILIKE ?', q && !idOrName(q) ? `%${q}%` : undefined],
    ['is_available = ?', avail],
  ]);
  res.json(await pageOf(
    'SELECT id, name, latitude, longitude, is_available FROM freelancers',
    'SELECT COUNT(*)::int AS total FROM freelancers',
    w, p, 'ORDER BY id',
  ));
}));

r.get('/freelancers/:id', ah(async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const f = await query(
    `SELECT f.id, f.name, f.latitude, f.longitude, f.is_available,
            s.completed_contracts, s.total_earnings
       FROM freelancers f
       LEFT JOIN freelancer_lifetime_summary s ON s.freelancer_id = f.id
      WHERE f.id = $1`, [id]);
  if (!f.rowCount) throw new HttpError(404, 'NOT_FOUND', `Freelancer #${id} does not exist.`);
  const recent = await query(
    `SELECT c.id, c.client_id, cl.name AS client_name, c.budget, c.status, c.created_at
       FROM contracts c JOIN clients cl ON cl.id = c.client_id
      WHERE c.freelancer_id = $1 ORDER BY c.created_at DESC LIMIT 10`, [id]);

  // Portfolio lives in MongoDB; the page still works if Mongo is down.
  let portfolio = null;
  let portfolioError = null;
  try {
    const db = await getDb();
    portfolio = await db.collection('Portfolios').findOne({ freelancer_id: id }, { projection: { _id: 0 } });
  } catch (e) {
    portfolioError = e.message;
  }
  res.json({ ...f.rows[0], recentContracts: recent.rows, portfolio, portfolioError });
}));

// ---------- Contracts ----------
const STATUSES = ['FUNDED', 'IN PROGRESS', 'COMPLETED'];

r.get('/contracts', ah(async (req, res) => {
  const p = paging(req.query);
  const status = req.query.status;
  if (status && !STATUSES.includes(status)) throw new HttpError(400, 'BAD_INPUT', `status must be one of ${STATUSES.join(', ')}`);
  const w = where([
    ['c.id = ?', req.query.id ? intParam(req.query.id, 'id') : undefined],
    ['c.status = ?', status],
    ['c.client_id = ?', req.query.clientId ? intParam(req.query.clientId, 'clientId') : undefined],
    ['c.freelancer_id = ?', req.query.freelancerId ? intParam(req.query.freelancerId, 'freelancerId') : undefined],
  ]);
  res.json(await pageOf(
    `SELECT c.id, c.client_id, cl.name AS client_name, c.freelancer_id, f.name AS freelancer_name,
            c.budget, c.status, c.created_at
       FROM contracts c
       JOIN clients cl ON cl.id = c.client_id
       JOIN freelancers f ON f.id = c.freelancer_id`,
    'SELECT COUNT(*)::int AS total FROM contracts c',
    w, p, 'ORDER BY c.created_at DESC, c.id DESC',
  ));
}));

r.get('/contracts/:id', ah(async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const c = await query(
    `SELECT c.*, cl.name AS client_name, f.name AS freelancer_name
       FROM contracts c
       JOIN clients cl ON cl.id = c.client_id
       JOIN freelancers f ON f.id = c.freelancer_id
      WHERE c.id = $1`, [id]);
  if (!c.rowCount) throw new HttpError(404, 'NOT_FOUND', `Contract #${id} does not exist.`);
  res.json(c.rows[0]);
}));

export default r;
