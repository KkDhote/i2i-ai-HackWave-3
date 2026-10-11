import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BSON } from 'mongodb';
import { getDb, closeDb } from '../db.js';
import { generateSeed } from './seedData.js';
import { localizeDemo } from './indianDemo.js';

const key = t => createHash('sha256').update(JSON.stringify([t.clientId ?? '', t.title ?? '', t.owner ?? ''])).digest('hex').slice(0, 20);
const fields = { clients: ['id', 'name'], tasks: ['title', 'owner'], tickets: ['clientId', 'title', 'severity', 'status'], comms: ['clientId', 'who', 'text'], meetings: ['clientId', 'notes'], releases: ['text'], feed: ['text'], insights: ['clientId', 'kind', 'text', 'label'] };
export function localizationPlan(snapshot) {
  const seed = generateSeed(new Date(), false), updates = [], taskKeys = new Map();
  for (const [name, matchFields] of Object.entries(fields)) {
    for (const record of snapshot[name] || []) {
      if (name === 'tasks' && record.createdAt) continue; // Preserve manually created tasks.
      if (!seed[name].some(original => matchFields.every(f => JSON.stringify(original[f]) === JSON.stringify(record[f])))) continue;
      const { _id, ...before } = record;
      const after = localizeDemo(before);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      updates.push({ collection: 'iw_' + name, id: _id, values: after });
      if (name === 'tasks') taskKeys.set(key(before), key(after));
    }
  }
  for (const goal of snapshot.goals || []) {
    const updatedKeys = (goal.taskKeys || []).map(k => taskKeys.get(k) || k);
    if (JSON.stringify(updatedKeys) !== JSON.stringify(goal.taskKeys)) updates.push({ collection: 'iw_goals', id: goal._id, values: { taskKeys: updatedKeys } });
  }
  return updates;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const db = await getDb(), snapshot = {};
    for (const name of [...Object.keys(fields), 'goals']) snapshot[name] = await db.collection('iw_' + name).find({}).toArray();
    const updates = localizationPlan(snapshot);
    console.log(JSON.stringify({ updates: updates.length, collections: [...new Set(updates.map(u => u.collection))], manualTasksPreserved: (snapshot.tasks || []).filter(t => t.createdAt).length }));
    if (process.argv.includes('--apply') && updates.length) {
      const folder = fileURLToPath(new URL('./localization-backups/', import.meta.url));
      await mkdir(folder, { recursive: true });
      const backup = folder + `india-demo-${Date.now()}.json`;
      await writeFile(backup, BSON.EJSON.stringify(snapshot, null, 2), { flag: 'wx' });
      console.log('Backup saved: ' + backup);
      for (const update of updates) await db.collection(update.collection).updateOne({ _id: update.id }, { $set: update.values });
      console.log('Indian demo localization applied.');
    }
  } finally { await closeDb(); }
}
