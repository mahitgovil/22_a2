import { Router } from 'express';
import { pool, query } from '../db/pg.js';
import { ah, HttpError, intParam, paging } from '../errors.js';

const r = Router();

/**
 * Workflow 1: fund a gig.
 * Calls the Part A stored procedure sp_execute_gig_funding (or the
 * fund-and-start variant). All checks — balance, row lock, atomic
 * debit + insert — happen inside the procedure; the audit row is written by
 * the trg_client_escrow_audit trigger. The API only reads "before" and
 * "after" so the screen can show what changed.
 */
r.post('/contracts/fund', ah(async (req, res) => {
  const clientId = intParam(req.body.clientId, 'clientId');
  const freelancerId = intParam(req.body.freelancerId, 'freelancerId');
  const budget = Number(req.body.budget);
  if (!Number.isFinite(budget)) throw new HttpError(400, 'BAD_INPUT', 'Budget must be a number.');
  const startNow = req.body.startNow === true;

  const conn = await pool.connect();
  try {
    const before = await conn.query(
      `SELECT c.escrow_balance,
              (SELECT COALESCE(MAX(id), 0) FROM wallet_audit_logs) AS last_audit_id,
              (SELECT COALESCE(MAX(id), 0) FROM contracts)        AS last_contract_id
         FROM clients c WHERE c.id = $1`, [clientId]);
    if (!before.rowCount) throw new HttpError(404, 'NOT_FOUND', `Client #${clientId} does not exist.`);
    const { escrow_balance: balanceBefore, last_audit_id, last_contract_id } = before.rows[0];

    const proc = startNow ? 'sp_execute_gig_funding_and_start' : 'sp_execute_gig_funding';
    // Top-level CALL (no BEGIN) so the procedure's own COMMIT is allowed.
    await conn.query(`CALL ${proc}($1, $2, $3)`, [clientId, freelancerId, budget]);

    const [after, contract, audit] = await Promise.all([
      conn.query('SELECT escrow_balance FROM clients WHERE id = $1', [clientId]),
      conn.query(
        `SELECT * FROM contracts WHERE client_id = $1 AND id > $2 ORDER BY id DESC LIMIT 1`,
        [clientId, last_contract_id]),
      conn.query(
        `SELECT * FROM wallet_audit_logs WHERE client_id = $1 AND id > $2 ORDER BY id`,
        [clientId, last_audit_id]),
    ]);

    res.status(201).json({
      procedure: proc,
      balanceBefore,
      balanceAfter: after.rows[0].escrow_balance,
      contract: contract.rows[0] ?? null,
      auditEntries: audit.rows,
    });
  } catch (err) {
    // On failure, report the (unchanged) balance so the UI can prove nothing was charged.
    try {
      const b = await conn.query('SELECT escrow_balance FROM clients WHERE id = $1', [clientId]);
      err.balanceAfterFailure = b.rows[0]?.escrow_balance;
    } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}));

/** Move a contract through FUNDED -> IN PROGRESS -> COMPLETED. */
r.patch('/contracts/:id/status', ah(async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const status = req.body.status;
  if (!['IN PROGRESS', 'COMPLETED'].includes(status)) {
    throw new HttpError(400, 'BAD_INPUT', "status must be 'IN PROGRESS' or 'COMPLETED'.");
  }
  const result = await query('SELECT * FROM fn_advance_contract_status($1, $2)', [id, status]);
  res.json(result.rows[0]);
}));

/**
 * Audit trail for one client (read-only).
 * balance_after is written by the trigger, so it IS the running balance.
 * signed_change and the "previous balance" check are derived with a window
 * function so any gap in the log would be visible.
 */
r.get('/clients/:id/audit', ah(async (req, res) => {
  const id = intParam(req.params.id, 'id');
  const p = paging(req.query, 200);
  const from = req.query.from || null; // YYYY-MM-DD
  const to = req.query.to || null;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
    throw new HttpError(400, 'BAD_INPUT', 'Dates must be YYYY-MM-DD.');
  }

  const client = await query('SELECT id, name, escrow_balance FROM clients WHERE id = $1', [id]);
  if (!client.rowCount) throw new HttpError(404, 'NOT_FOUND', `Client #${id} does not exist.`);

  const filter = `client_id = $1
      AND ($2::date IS NULL OR created_at >= $2::date)
      AND ($3::date IS NULL OR created_at <  $3::date + 1)`;

  const [rows, summary] = await Promise.all([
    query(
      `SELECT id, created_at, action_type, amount_changed,
              CASE WHEN action_type = 'DEBIT' THEN -amount_changed ELSE amount_changed END AS signed_change,
              balance_after AS running_balance,
              balance_after - CASE WHEN action_type = 'DEBIT' THEN -amount_changed ELSE amount_changed END
                AS balance_before
         FROM wallet_audit_logs
        WHERE ${filter}
        ORDER BY created_at DESC, id DESC
        LIMIT $4 OFFSET $5`,
      [id, from, to, p.pageSize, p.offset]),
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(amount_changed) FILTER (WHERE action_type = 'CREDIT'), 0) AS total_credits,
              COALESCE(SUM(amount_changed) FILTER (WHERE action_type = 'DEBIT'), 0)  AS total_debits,
              (ARRAY_AGG(balance_after - CASE WHEN action_type='DEBIT' THEN -amount_changed ELSE amount_changed END
                         ORDER BY created_at, id))[1] AS opening_balance,
              (ARRAY_AGG(balance_after ORDER BY created_at DESC, id DESC))[1] AS closing_balance
         FROM wallet_audit_logs
        WHERE ${filter}`,
      [id, from, to]),
  ]);

  res.json({
    client: client.rows[0],
    summary: summary.rows[0],
    items: rows.rows,
    total: summary.rows[0].total,
    page: p.page,
    pageSize: p.pageSize,
  });
}));

export default r;
