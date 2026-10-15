import pg from 'pg';

// Return NUMERIC and BIGINT columns as JS numbers instead of strings.
// Money values are NUMERIC(12,2) and ids are far below 2^53, so this is safe.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
// Keep DATE columns as 'YYYY-MM-DD' strings so they don't shift with time zones.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString:
    process.env.POSTGRES_DSN || 'postgresql://postgres:postgres@localhost:5432/gigtask',
  max: 10,
});

export const query = (text, params) => pool.query(text, params);
