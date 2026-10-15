import { getDb } from './db/mongo.js';

// Bengaluru bounding box used by the Part A seeder.
const BBOX = { minLng: 77.45, maxLng: 77.75, minLat: 12.85, maxLat: 13.15 };
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

// Point roughly `meters` away from origin in a random direction.
function jitter([lng, lat], meters) {
  const d = Math.sqrt(Math.random()) * meters;
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (d * Math.cos(theta)) / 111_320;
  const dLng = (d * Math.sin(theta)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
}

function ping(coordinates) {
  return {
    freelancer_id: randInt(1, 10_000),
    is_available: Math.random() < 0.65,
    location: { type: 'Point', coordinates },
    created_at: new Date(),
  };
}

/** Insert `count` pings within `radiusMeters` of [lng, lat]. */
export async function insertPingsNear(origin, count = 20, radiusMeters = 5000) {
  const db = await getDb();
  const docs = Array.from({ length: count }, () => ping(jitter(origin, radiusMeters)));
  await db.collection('WorkerLocations').insertMany(docs);
  return docs.length;
}

/** Insert `count` pings spread over the whole city. */
export async function insertCityPings(count = 300) {
  const db = await getDb();
  const docs = Array.from({ length: count }, () =>
    ping([rand(BBOX.minLng, BBOX.maxLng), rand(BBOX.minLat, BBOX.maxLat)]));
  await db.collection('WorkerLocations').insertMany(docs);
  return docs.length;
}

/**
 * Keeps live data flowing. WorkerLocations has a 7200 s TTL index, so
 * without new pings the map would be empty two hours after seeding.
 */
export function startPingSimulator({ intervalMs = 5000, perTick = 300 } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await insertCityPings(perTick);
    } catch (e) {
      console.warn('[pings] could not insert pings:', e.message);
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  console.log(`[pings] simulator on: ${perTick} pings every ${intervalMs / 1000}s`);
  return () => clearInterval(timer);
}
