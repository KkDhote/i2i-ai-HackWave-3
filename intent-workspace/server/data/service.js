import { getDb } from '../db.js';
import { buildPayload } from './payload.js';

// MongoDB collections used by the workspace (prefixed iw_ so they never clash with your older collections)
export const COLLECTIONS = ['clients', 'tickets', 'comms', 'meetings', 'usage', 'tasks', 'releases', 'feed', 'insights', 'sources'];

export async function loadSource() {
  const db = await getDb();
  const lists = await Promise.all(COLLECTIONS.map(n => db.collection('iw_' + n).find({}, { projection: { _id: 0 } }).toArray()));
  return Object.fromEntries(COLLECTIONS.map((n, i) => [n, lists[i]]));
}

// accepts an id ("kestrel"), an alias ("blue peak") or a full name; falls back to kestrel
export function resolveClientId(clients, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return 'kestrel';
  const hit = clients.find(c => c.id === s || c.name.toLowerCase() === s || (c.aliases || []).some(a => s.includes(a)));
  return hit ? hit.id : 'kestrel';
}

export async function getWorkspaceData(clientQuery) {
  const src = await loadSource();
  if (!src.clients.length) throw new Error('No data in MongoDB yet. Run: npm run seed:real');
  return buildPayload(src, resolveClientId(src.clients, clientQuery), new Date());
}
