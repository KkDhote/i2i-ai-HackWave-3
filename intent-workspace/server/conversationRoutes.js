import { Router } from 'express';
import { getDb } from './db.js';
import { conversationContext, conversationSummary, knownClient, mergeMessages, newConversation, parseClientId, parseConversationUpdate, publicConversation, validConversationId } from './conversationStore.js';

export function createConversationRouter({ getDbImpl = getDb, now = () => new Date() } = {}) {
  const router = Router();
  const safe = handler => (req, res) => Promise.resolve(handler(req, res)).catch(() => res.status(503).json({ error: 'Chat history could not connect to the database. Please retry.' }));
  async function client(db, value, res) {
    const clientId = parseClientId(value);
    if (clientId === undefined || !(await knownClient(db, clientId))) { res.status(400).json({ error: 'Choose a valid workspace client.' }); return undefined; }
    return clientId;
  }
  async function record(req, res) {
    if (!validConversationId(req.params.id)) { res.status(404).json({ error: 'Conversation not found for this client.' }); return null; }
    const db = await getDbImpl();
    const clientId = await client(db, req.query.clientId, res);
    if (clientId === undefined) return null;
    const conversation = await db.collection('iw_conversations').findOne({ id: req.params.id, clientId });
    if (!conversation) { res.status(404).json({ error: 'Conversation not found for this client.' }); return null; }
    return conversation;
  }
  router.get('/api/conversations', safe(async (req, res) => {
    const db = await getDbImpl();
    const clientId = await client(db, req.query.clientId, res);
    if (clientId === undefined) return;
    const records = await db.collection('iw_conversations').find({ clientId }, { projection: { _id: 0, id: 1, clientId: 1, title: 1, updatedAt: 1, createdAt: 1, revision: 1 } }).sort({ updatedAt: -1 }).limit(100).toArray();
    res.json(records.map(conversationSummary));
  }));
  router.get('/api/conversations/:id/context', safe(async (req, res) => {
    if (req.query.message !== undefined && (typeof req.query.message !== 'string' || req.query.message.length > 2000)) return res.status(400).json({ error: 'Context query must be at most 2000 characters.' });
    const conversation = await record(req, res);
    if (conversation) {
      const { messages, ...context } = conversationContext(conversation, req.query.message || '');
      res.json({ history: messages, ...context });
    }
  }));
  router.get('/api/conversations/:id', safe(async (req, res) => {
    if (req.query.before !== undefined && (typeof req.query.before !== 'string' || req.query.before.length > 100)) return res.status(400).json({ error: 'Invalid earlier-message cursor.' });
    const conversation = await record(req, res);
    if (!conversation) return;
    const result = publicConversation(conversation, req.query.before);
    if (!result) return res.status(400).json({ error: 'Earlier-message cursor was not found.' });
    res.json(result);
  }));
  router.post('/api/conversations', safe(async (req, res) => {
    if (req.body?.title !== undefined && (typeof req.body.title !== 'string' || !req.body.title.trim() || req.body.title.length > 120)) return res.status(400).json({ error: 'Use a conversation title up to 120 characters.' });
    const db = await getDbImpl();
    const clientId = await client(db, req.body?.clientId, res);
    if (clientId === undefined) return;
    const conversation = newConversation(clientId, req.body?.title?.trim(), now());
    await db.collection('iw_conversations').insertOne(conversation);
    res.status(201).json(publicConversation(conversation));
  }));
  router.put('/api/conversations/:id', safe(async (req, res) => {
    const update = parseConversationUpdate(req.body);
    if (!update) return res.status(400).json({ error: 'Provide valid chat messages, task draft, language and client.' });
    if (!validConversationId(req.params.id)) return res.status(404).json({ error: 'Conversation not found for this client.' });
    const db = await getDbImpl();
    const clientId = await client(db, update.clientId, res);
    if (clientId === undefined) return;
    const collection = db.collection('iw_conversations');
    const identity = { id: req.params.id, clientId };
    const previous = await collection.findOne(identity);
    if (!previous) return res.status(404).json({ error: 'Conversation not found for this client.' });
    if (update.revision !== undefined && update.revision !== previous.revision) return res.status(409).json({ error: 'This chat changed in another tab. Reopen its history before sending more messages.' });
    const messages = mergeMessages(previous.messages || [], update.messages);
    if (!messages) return res.status(400).json({ error: 'Saved messages cannot be rewritten. Send a new message to add details.' });
    if (Buffer.byteLength(JSON.stringify(messages), 'utf8') > 12 * 1024 * 1024) return res.status(413).json({ error: 'This conversation is full. Its history is kept; start a new conversation for more messages.' });
    const title = update.title || (previous.title === 'New conversation' ? messages.find(item => item.role === 'user')?.content.trim().slice(0, 120) || previous.title : previous.title);
    const saved = { ...previous, messages, taskDraft: update.taskDraft, language: update.language, title, updatedAt: now().toISOString(), revision: previous.revision + 1 };
    const result = await collection.updateOne({ ...identity, revision: previous.revision }, { $set: { messages, taskDraft: saved.taskDraft, language: saved.language, title, updatedAt: saved.updatedAt, revision: saved.revision } });
    if (!result.matchedCount) return res.status(409).json({ error: 'This chat changed in another tab. Reopen its history before sending more messages.' });
    res.json(publicConversation(saved));
  }));
  return router;
}
export default createConversationRouter();
