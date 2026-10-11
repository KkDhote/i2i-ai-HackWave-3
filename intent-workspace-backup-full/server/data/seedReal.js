import { getDb, closeDb } from '../db.js';
import { generateSeed } from './seedData.js';
import { COLLECTIONS } from './service.js';

// Fills MongoDB with realistic data (relative to today). Safe to re-run: it only replaces the iw_* collections.
const db = await getDb();
const seed = generateSeed(new Date());
for (const name of COLLECTIONS) {
  const col = db.collection('iw_' + name);
  await col.deleteMany({});
  if (seed[name].length) await col.insertMany(seed[name]);
  console.log(`iw_${name}: ${seed[name].length} documents`);
}
await closeDb();
console.log('Seed done.');
