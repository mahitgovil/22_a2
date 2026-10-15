import express from 'express';
import cors from 'cors';
import { query } from './db/pg.js';
import { getDb } from './db/mongo.js';
import { ah, errorHandler, HttpError } from './errors.js';
import browse from './routes/browse.js';
import transactions from './routes/transactions.js';
import analytics from './routes/analytics.js';
import mongoRoutes from './routes/mongoRoutes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', ah(async (_req, res) => {
    const out = { postgres: 'down', mongo: 'down' };
    try { await query('SELECT 1'); out.postgres = 'up'; } catch (e) { out.postgresError = e.message; }
    try { const db = await getDb(); await db.command({ ping: 1 }); out.mongo = 'up'; } catch (e) { out.mongoError = e.message; }
    res.status(out.postgres === 'up' ? 200 : 503).json(out);
  }));

  app.use('/api', browse);
  app.use('/api', transactions);
  app.use('/api', analytics);
  app.use('/api', mongoRoutes);

  app.use('/api', (req, _res, next) => next(new HttpError(404, 'NOT_FOUND', `No endpoint ${req.method} ${req.originalUrl}`)));
  app.use(errorHandler);
  return app;
}
