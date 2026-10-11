import 'dotenv/config';
import { MongoClient } from 'mongodb';

// One shared connection for the whole server. Database name comes from MONGO_URI (.../intent_workspace).
let client = null, db = null;

export async function getDb() {
  if (db) return db;
  client = new MongoClient(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intent_workspace');
  await client.connect();
  db = client.db();
  return db;
}

export async function closeDb() {
  if (client) await client.close();
  client = null; db = null;
}
