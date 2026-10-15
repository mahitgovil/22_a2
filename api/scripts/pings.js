// Standalone live-ping generator: `npm run pings`
// Inserts fresh WorkerLocations pings every 5 s so the Map screen always has
// data (the collection's TTL index deletes pings after 7200 s).
import 'dotenv/config';
import { startPingSimulator } from '../src/pings.js';

startPingSimulator({
  intervalMs: Number(process.env.PING_INTERVAL_MS || 5000),
  perTick: Number(process.env.PINGS_PER_TICK || 300),
});
