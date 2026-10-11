import mongoose from 'mongoose';
import Dataset from './models/Dataset.js';
import seed from './seed/data.js';
// Data for ONE client: shared datasets + that client's own (client, comms, issues, meeting, talk).
// Mongo available -> its values win; otherwise the seed file (demo never breaks).
export async function loadData(clientId) {
  let all = seed;
  if (mongoose.connection.readyState === 1) {
    const docs = await Dataset.find().lean();
    if (docs.length) all = { ...seed, ...Object.fromEntries(docs.map(d => [d.key, d.value])) };
  }
  const { byClient, clients, ...base } = all;
  const id = byClient[clientId] ? clientId : clients[0].id;
  return { ...base, ...byClient[id], clients, clientId: id };
}
