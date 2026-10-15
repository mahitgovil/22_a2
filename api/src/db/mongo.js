import { MongoClient } from 'mongodb';
import { HttpError } from '../errors.js';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB || 'gigtask';

let client = null;
let connecting = null;

// Lazily connect so the API still starts (and the Postgres screens still
// work) when MongoDB is down. Mongo-backed routes then return 503.
export async function getDb() {
  if (client) return client.db(dbName);
  if (!connecting) {
    connecting = MongoClient.connect(uri, { serverSelectionTimeoutMS: 3000 })
      .then((c) => {
        client = c;
        return c;
      })
      .finally(() => {
        connecting = null;
      });
  }
  try {
    await connecting;
  } catch (err) {
    throw new HttpError(503, 'MONGO_UNAVAILABLE', `MongoDB is not reachable at ${uri}. Start MongoDB and try again.`);
  }
  return client.db(dbName);
}

export async function closeMongo() {
  if (client) await client.close();
  client = null;
}
