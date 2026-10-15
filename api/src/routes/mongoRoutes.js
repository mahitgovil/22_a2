import { Router } from 'express';
import { getDb } from '../db/mongo.js';
import { query } from '../db/pg.js';
import { ah, HttpError, intParam, paging } from '../errors.js';
import { insertPingsNear } from '../pings.js';

const r = Router();

function coords(req) {
  const lng = Number(req.query.lng ?? req.body?.lng);
  const lat = Number(req.query.lat ?? req.body?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    throw new HttpError(400, 'BAD_INPUT', 'lng and lat must be valid coordinates.');
  }
  return [lng, lat];
}

/**
 * Workflow 3: nearest workers to a job site.
 * Same $geoNear stage as mongo/02_workflow3_geoNear.js (2dsphere index,
 * 5 km maxDistance, availability match). One extra $group keeps only the
 * nearest ping per freelancer so a worker is not listed many times.
 */
r.get('/map/nearby', ah(async (req, res) => {
  const origin = coords(req);
  const radius = intParam(req.query.radius, 'radius', { def: 5000, min: 100, max: 20000 });
  const limit = intParam(req.query.limit, 'limit', { def: 50, max: 200 });
  const availableOnly = req.query.availableOnly !== 'false';

  const db = await getDb();
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: origin },
        key: 'location',
        distanceField: 'distanceMeters',
        maxDistance: radius,
        spherical: true,
      },
    },
    ...(availableOnly ? [{ $match: { is_available: true } }] : []),
    {
      $group: {
        _id: '$freelancer_id',
        pingId: { $first: '$_id' },
        distanceMeters: { $first: '$distanceMeters' },
        location: { $first: '$location' },
        is_available: { $first: '$is_available' },
        created_at: { $first: '$created_at' },
      },
    },
    { $sort: { distanceMeters: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0, freelancer_id: '$_id', pingId: 1, distanceMeters: { $round: ['$distanceMeters', 0] },
        location: 1, is_available: 1, created_at: 1,
      },
    },
  ];
  const started = Date.now();
  const workers = await db.collection('WorkerLocations').aggregate(pipeline).toArray();
  const ms = Date.now() - started;

  // Attach names from PostgreSQL (the system of record for freelancers).
  const ids = workers.map((w) => w.freelancer_id);
  if (ids.length) {
    const names = await query('SELECT id, name FROM freelancers WHERE id = ANY($1::bigint[])', [ids]);
    const byId = new Map(names.rows.map((n) => [n.id, n.name]));
    workers.forEach((w) => { w.name = byId.get(w.freelancer_id) ?? `Freelancer #${w.freelancer_id}`; });
  }

  const latest = await db.collection('WorkerLocations')
    .find({}, { projection: { created_at: 1 } }).sort({ created_at: -1 }).limit(1).toArray();

  res.json({
    origin, radius, availableOnly, queryMs: ms, count: workers.length, workers,
    latestPingAt: latest[0]?.created_at ?? null,
    serverTime: new Date(),
  });
}));

/** Demo helper: drop a few new pings near the origin so they show up live. */
r.post('/map/pings', ah(async (req, res) => {
  const origin = coords(req);
  const count = intParam(req.body?.count, 'count', { def: 10, max: 200 });
  const inserted = await insertPingsNear(origin, count, 4500);
  res.status(201).json({ inserted });
}));

/**
 * Workflow 4: review analytics with $facet (mongo/03_workflow4_facet.js).
 * Optionally scoped to one freelancer by a leading $match.
 */
r.get('/reviews/analytics', ah(async (req, res) => {
  const freelancerId = req.query.freelancerId ? intParam(req.query.freelancerId, 'freelancerId') : null;
  const db = await getDb();
  const pipeline = [
    ...(freelancerId ? [{ $match: { freelancer_id: freelancerId } }] : []),
    {
      $facet: {
        rating_distribution: [
          { $group: { _id: '$rating', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        top_skill_tags: [
          { $unwind: '$skill_tags' },
          { $group: { _id: '$skill_tags', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 20 },
        ],
        overall_average_rating: [
          { $group: { _id: null, average_rating: { $avg: '$rating' }, review_count: { $sum: 1 } } },
        ],
      },
    },
  ];
  const [result] = await db.collection('GigReviews').aggregate(pipeline).toArray();
  // Always return all five rating buckets so the chart has no gaps.
  const dist = Object.fromEntries((result.rating_distribution || []).map((d) => [d._id, d.count]));
  res.json({
    freelancerId,
    rating_distribution: [1, 2, 3, 4, 5].map((rating) => ({ rating, count: dist[rating] ?? 0 })),
    top_skill_tags: result.top_skill_tags.map((t) => ({ tag: t._id, count: t.count })),
    average_rating: result.overall_average_rating[0]?.average_rating ?? null,
    review_count: result.overall_average_rating[0]?.review_count ?? 0,
  });
}));

/** Latest reviews (paged) for the Reviews screen / freelancer detail. */
r.get('/reviews', ah(async (req, res) => {
  const p = paging(req.query, 50);
  const freelancerId = req.query.freelancerId ? intParam(req.query.freelancerId, 'freelancerId') : null;
  const db = await getDb();
  const filter = freelancerId ? { freelancer_id: freelancerId } : {};
  const col = db.collection('GigReviews');
  const [items, total] = await Promise.all([
    col.find(filter).sort({ created_at: -1 }).skip(p.offset).limit(p.pageSize).toArray(),
    freelancerId ? col.countDocuments(filter) : col.estimatedDocumentCount(),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
}));

/** Flexible catalog: a freelancer's portfolio document, shown as-is. */
r.get('/portfolios/:freelancerId', ah(async (req, res) => {
  const freelancerId = intParam(req.params.freelancerId, 'freelancerId');
  const db = await getDb();
  const doc = await db.collection('Portfolios').findOne({ freelancer_id: freelancerId }, { projection: { _id: 0 } });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', `No portfolio found for freelancer #${freelancerId}.`);
  res.json(doc);
}));

export default r;
