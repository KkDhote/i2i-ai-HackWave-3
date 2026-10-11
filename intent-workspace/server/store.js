import mongoose from 'mongoose';
import Dataset from './models/Dataset.js';
import seed from './seed/data.js';
import { getWorkspaceData } from './data/service.js';
import { localizeDemo } from './data/indianDemo.js';

// Data for ONE client. Order: new MongoDB collections (iw_*) -> old Dataset docs -> seed file.
// So the demo never breaks, even if MongoDB is down.
export async function loadData(clientId) {
  try {
    return await getWorkspaceData(clientId);
  } catch (e) {
    console.warn('loadData: using fallback data (' + e.message + ')');
  }
  let all = localizeDemo(seed);
  if (mongoose.connection.readyState === 1) {
    const docs = await Dataset.find().lean();
    if (docs.length) all = { ...seed, ...Object.fromEntries(docs.map(d => [d.key, d.value])) };
  }
  const { byClient, clients, ...base } = all;
  const id = byClient[clientId] ? clientId : clients[0].id;
  return { ...base, ...byClient[id], clients, clientId: id };
}
