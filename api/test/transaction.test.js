// Tests for the most important flow: Workflow 1 (gig funding).
// They run against a real, seeded PostgreSQL database (POSTGRES_DSN),
// because the rules under test live in the database itself.
//   npm test
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query } from '../src/db/pg.js';
import { closeMongo } from '../src/db/mongo.js';

const app = createApp();
let clientId;
let freeFreelancerId;

before(async () => {
  // A client with plenty of money and a freelancer with no active contract.
  clientId = (await query('SELECT id FROM clients ORDER BY escrow_balance DESC LIMIT 1')).rows[0].id;
  freeFreelancerId = (await query(
    `SELECT f.id FROM freelancers f
      WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.freelancer_id = f.id AND c.status = 'IN PROGRESS')
      ORDER BY f.id DESC LIMIT 1`)).rows[0].id;
});

after(async () => {
  await pool.end();
  await closeMongo();
});

const balanceOf = async (id) => (await query('SELECT escrow_balance FROM clients WHERE id = $1', [id])).rows[0].escrow_balance;

test('successful funding debits the balance, creates a FUNDED contract and an audit row', async () => {
  const before = await balanceOf(clientId);
  const res = await request(app).post('/api/contracts/fund')
    .send({ clientId, freelancerId: freeFreelancerId, budget: 123.45 });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.balanceBefore, before);
  assert.equal(res.body.balanceAfter, +(before - 123.45).toFixed(2));
  assert.equal(res.body.contract.status, 'FUNDED');
  assert.equal(res.body.contract.budget, 123.45);
  // The trigger wrote exactly one DEBIT row with the new balance.
  assert.equal(res.body.auditEntries.length, 1);
  assert.equal(res.body.auditEntries[0].action_type, 'DEBIT');
  assert.equal(res.body.auditEntries[0].balance_after, res.body.balanceAfter);
});

test('insufficient balance is rejected with a friendly message and nothing is charged', async () => {
  const before = await balanceOf(clientId);
  const auditBefore = (await query('SELECT COUNT(*)::int n FROM wallet_audit_logs WHERE client_id = $1', [clientId])).rows[0].n;

  const res = await request(app).post('/api/contracts/fund')
    .send({ clientId, freelancerId: freeFreelancerId, budget: before + 1 });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INSUFFICIENT_BALANCE');
  assert.match(res.body.error.message, /Not enough escrow balance/);
  assert.equal(await balanceOf(clientId), before);
  const auditAfter = (await query('SELECT COUNT(*)::int n FROM wallet_audit_logs WHERE client_id = $1', [clientId])).rows[0].n;
  assert.equal(auditAfter, auditBefore);
});

test('second active gig for the same freelancer is blocked by the partial unique index and rolled back', async () => {
  const first = await request(app).post('/api/contracts/fund')
    .send({ clientId, freelancerId: freeFreelancerId, budget: 50, startNow: true });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.contract.status, 'IN PROGRESS');

  const before = await balanceOf(clientId);
  const second = await request(app).post('/api/contracts/fund')
    .send({ clientId, freelancerId: freeFreelancerId, budget: 50, startNow: true });

  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'FREELANCER_BUSY');
  assert.equal(second.body.error.balanceAfterFailure, before);
  assert.equal(await balanceOf(clientId), before, 'debit must be rolled back');

  // Clean up: complete the active contract so the freelancer is free again.
  const done = await request(app).patch(`/api/contracts/${first.body.contract.id}/status`).send({ status: 'COMPLETED' });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'COMPLETED');
});

test('invalid inputs and transitions are rejected', async () => {
  const bad = await request(app).post('/api/contracts/fund').send({ clientId, freelancerId: freeFreelancerId, budget: -5 });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'INVALID_BUDGET');

  const missing = await request(app).post('/api/contracts/fund').send({ clientId: 999999999, freelancerId: 1, budget: 5 });
  assert.equal(missing.status, 404);

  const completed = (await query("SELECT id FROM contracts WHERE status = 'COMPLETED' LIMIT 1")).rows[0].id;
  const back = await request(app).patch(`/api/contracts/${completed}/status`).send({ status: 'IN PROGRESS' });
  assert.equal(back.status, 400);
  assert.equal(back.body.error.code, 'INVALID_TRANSITION');
});

test('audit trail returns a consistent running balance', async () => {
  const res = await request(app).get(`/api/clients/${clientId}/audit?pageSize=50`);
  assert.equal(res.status, 200);
  const rows = res.body.items; // newest first
  for (let i = 0; i < rows.length - 1; i++) {
    // Each row's balance_before equals the previous row's running balance.
    assert.equal(rows[i].balance_before, rows[i + 1].running_balance);
  }
  assert.equal(res.body.summary.closing_balance, await balanceOf(clientId));
});
