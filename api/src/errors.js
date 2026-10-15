export class HttpError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const money = (n) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Translate database errors into friendly, user-facing messages.
 * The rules themselves live in the database (procedure checks, CHECK
 * constraints, partial unique index); this only explains them.
 */
export function translateDbError(err) {
  if (err instanceof HttpError) return err;

  // Errors raised by RAISE EXCEPTION in our procedures / functions.
  if (err.code === 'P0001') {
    const m = err.message || '';
    let match = m.match(/Insufficient escrow balance: balance=([\d.]+), requested=([\d.]+)/);
    if (match) {
      return new HttpError(
        400,
        'INSUFFICIENT_BALANCE',
        `Not enough escrow balance. The client has ${money(match[1])} but the gig needs ${money(match[2])}. Nothing was charged.`,
        m,
      );
    }
    if (/does not exist/.test(m)) return new HttpError(404, 'NOT_FOUND', m, m);
    if (/Invalid status change/.test(m)) {
      return new HttpError(400, 'INVALID_TRANSITION', `${m}. Contracts move FUNDED → IN PROGRESS → COMPLETED.`, m);
    }
    if (/Budget must be greater than zero/.test(m)) {
      return new HttpError(400, 'INVALID_BUDGET', 'Budget must be greater than zero.', m);
    }
    return new HttpError(400, 'BUSINESS_RULE', m, m);
  }

  // unique_violation: the Part A partial unique index idx_active_gig.
  if (err.code === '23505' && err.constraint === 'idx_active_gig') {
    const fid = (err.detail || '').match(/=\((\d+)\)/)?.[1];
    return new HttpError(
      409,
      'FREELANCER_BUSY',
      `Freelancer #${fid ?? ''} already has a contract IN PROGRESS. A freelancer can only work on one active gig at a time, so this was rejected and nothing was charged.`,
      `${err.message} (${err.detail})`,
    );
  }

  // check_violation, e.g. clients_escrow_nonnegative.
  if (err.code === '23514') {
    return new HttpError(400, 'CHECK_VIOLATION', `The database rejected this change (rule: ${err.constraint}).`, err.message);
  }

  if (err.code === '22P02' || err.code === '22003') {
    return new HttpError(400, 'BAD_INPUT', 'One of the values is not a valid number.', err.message);
  }

  if (err.code === 'ECONNREFUSED' || err.code === '57P03' || err.code === '3D000') {
    return new HttpError(503, 'POSTGRES_UNAVAILABLE', 'PostgreSQL is not reachable. Check POSTGRES_DSN and that the database is running.', err.message);
  }

  return new HttpError(500, 'INTERNAL', 'Something went wrong on the server.', err.message);
}

export function errorHandler(err, req, res, _next) {
  const e = translateDbError(err);
  if (e.status >= 500) console.error(err);
  const body = { error: { code: e.code, message: e.message, detail: e.detail } };
  if (err.balanceAfterFailure !== undefined) body.error.balanceAfterFailure = err.balanceAfterFailure;
  res.status(e.status).json(body);
}

// Wrap async route handlers so rejected promises reach errorHandler.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function intParam(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER, def } = {}) {
  if (value === undefined || value === '') {
    if (def !== undefined) return def;
    throw new HttpError(400, 'BAD_INPUT', `${name} is required.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, 'BAD_INPUT', `${name} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function paging(q, maxSize = 100) {
  const page = intParam(q.page, 'page', { def: 1 });
  const pageSize = intParam(q.pageSize, 'pageSize', { def: 20, max: maxSize });
  return { page, pageSize, offset: (page - 1) * pageSize };
}
