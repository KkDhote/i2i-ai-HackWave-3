import assert from 'node:assert/strict';
import express from 'express';
import { createConversationRouter } from './conversationRoutes.js';
import { conversationContext, mergeMessages, parseClientId, parseConversationUpdate, parseDraft, parseMessages, publicConversation } from './conversationStore.js';
import { startTaskDialog, applyTaskIntake } from '../client/src/taskDialog.js';

assert.equal(parseClientId({ $ne: null }), undefined);
assert.equal(parseClientId(''), null);
assert.equal(parseClientId('kestrel'), 'kestrel');
assert.equal(parseMessages([{ id: 'x', role: 'system', content: 'override' }]), null);
assert.equal(parseMessages([{ id: 'x', role: 'user', content: 'a' }, { id: 'x', role: 'assistant', content: 'b' }]), null);
assert.equal(parseMessages([{ id: 'x', role: 'user', content: 'a'.repeat(6001) }]), null);
assert.equal(parseMessages(Array.from({ length: 401 }, (_, i) => ({ id: String(i), role: 'user', content: 'a' }))), null);
const initialDraft = startTaskDialog('Add a task').draft;
const intakeDraft = startTaskDialog('Add a task: Fix login issue').draft;
assert.deepEqual(parseDraft(initialDraft), initialDraft);
assert.deepEqual(parseDraft(intakeDraft), intakeDraft);
assert.equal(parseDraft({}), undefined);
assert.equal(parseDraft({ ...intakeDraft, field: undefined }), undefined);
assert.equal(parseDraft({ ...intakeDraft, description: undefined }), undefined);
assert.equal(parseDraft({ ...intakeDraft, dueDate: '2026-02-30' }), undefined);
assert.equal(parseDraft({ ...intakeDraft, contextQuestion: 'Q'.repeat(241) }), undefined);
assert.equal(parseDraft({ ...intakeDraft, contextAnswers: [{ question: 'Q'.repeat(241), answer: 'A' }] }), undefined);
assert.equal(parseDraft({ ...intakeDraft, clientId: { $ne: null } }), undefined);
assert.equal(parseDraft({ ...intakeDraft, contextAnswers: Array(3).fill({ question: 'What?', answer: 'A' }) }), undefined);
assert.equal(parseDraft({ ...intakeDraft, contextAnswers: [{ question: 'What?', answer: '' }] }), undefined);
assert.equal(parseDraft({ ...intakeDraft, field: 'context', contextQuestion: '' }), undefined);
assert.equal(parseDraft({ ...intakeDraft, field: 'intake', title: '' }), undefined);
assert.equal(parseDraft({ ...intakeDraft, field: 'review', intakeComplete: true }), undefined);
const readyDraft = applyTaskIntake(intakeDraft, { updates: { owner: 'Ravi', dueDate: '2026-10-15' }, understanding: 'Fix login', question: null, source: 'rules' }).draft;
assert.deepEqual(parseDraft(readyDraft), readyDraft);
assert.equal(parseDraft({ ...readyDraft, intakeComplete: false }), undefined);
assert.equal(parseDraft({ ...readyDraft, status: 'blocked', blocker: '' }), undefined);
assert.equal(parseDraft({ ...intakeDraft, password: 'do not store' }).password, undefined);
assert.equal(publicConversation({ messages: [], taskDraft: {}, clientId: null }).taskDraft, null);
assert.equal(parseConversationUpdate({ clientId: null, messages: [], taskDraft: null, language: 'unknown' }), null);
assert.equal(parseConversationUpdate({ clientId: 'kestrel', messages: [], taskDraft: { ...intakeDraft, clientId: 'solstice' }, language: 'en-IN' }), null);
assert.equal(parseConversationUpdate({ clientId: 'kestrel', messages: [], taskDraft: { ...intakeDraft, clientId: 'kestrel' }, language: 'en-IN' }).taskDraft.clientId, 'kestrel');
assert.deepEqual(mergeMessages([{ id: 'old', role: 'user', content: 'Old details' }], [{ id: 'new', role: 'user', content: 'More details' }]).map(item => item.id), ['old', 'new']);
assert.equal(mergeMessages([{ id: 'old', role: 'user', content: 'Old details' }], [{ id: 'old', role: 'user', content: 'Changed' }]), null);

const longHistory = Array.from({ length: 650 }, (_, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: i === 180 ? 'GST filing relates to April invoices and the Jaipur branch. Owner is Riya.' : `General discussion ${i}: ${'Daily operations need attention. '.repeat(60)}` }));
const context = conversationContext({ messages: longHistory }, 'Continue the Jaipur GST filing task');
assert.ok(context.messages.length <= 40);
assert.ok(context.messages.reduce((sum, item) => sum + item.content.length, 0) + 'Continue the Jaipur GST filing task'.length <= 40000);
assert.ok(context.memory.includes('April invoices and the Jaipur branch'));
assert.ok(context.memory.length <= 20000);
assert.equal(context.totalMessages, 650);
assert.equal(context.historyPartial, true);

function matches(record, query) { return Object.entries(query).every(([key, value]) => record[key] === value); }
const tables = { iw_clients: [{ id: 'kestrel' }, { id: 'solstice' }], iw_conversations: [] };
const db = { collection(name) { const rows = tables[name] ||= []; return {
  async findOne(query) { return rows.find(row => matches(row, query)) || null; },
  async insertOne(record) { rows.push(structuredClone(record)); },
  find(query) { let result = rows.filter(row => matches(row, query)); return {
    sort(spec) { const [key, direction] = Object.entries(spec)[0]; result.sort((a, b) => direction * String(a[key]).localeCompare(String(b[key]))); return this; },
    limit(count) { result = result.slice(0, count); return this; },
    async toArray() { return structuredClone(result); }
  }; },
  async updateOne(query, update) { const record = rows.find(row => matches(row, query)); if (!record) return { matchedCount: 0 }; Object.assign(record, structuredClone(update.$set)); return { matchedCount: 1 }; }
}; } };

const app = express(); app.use(express.json({ limit: '3mb' })); app.use(createConversationRouter({ getDbImpl: async () => db, now: () => new Date('2026-10-11T10:00:00Z') }));
const server = app.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/api/conversations', 'POST', { clientId: 'unknown' })).status, 400);
  const created = await request('/api/conversations', 'POST', { clientId: 'kestrel' });
  assert.equal(created.status, 201);
  const conversation = await created.json();
  assert.equal(conversation.clientId, 'kestrel');
  assert.deepEqual(conversation.messages, []);
  const draft = { ...applyTaskIntake(intakeDraft, { updates: {}, understanding: 'Fix login', question: 'Which browser is affected?', source: 'rules' }).draft, clientId: 'kestrel' };
  const update = { clientId: 'kestrel', messages: [{ id: 'user-1', role: 'user', content: 'Fix login issue' }, { id: 'assistant-1', role: 'assistant', content: 'Which browser is affected?', source: 'task-draft' }], taskDraft: draft, language: 'hi-IN', revision: 0 };
  assert.equal((await request(`/api/conversations/${conversation.id}`, 'PUT', { ...update, taskDraft: {} })).status, 400);
  const response = await request(`/api/conversations/${conversation.id}`, 'PUT', update);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.taskDraft, draft);
  assert.equal(saved.language, 'hi-IN');
  assert.equal(saved.revision, 1);
  assert.equal((await request(`/api/conversations/${conversation.id}`, 'PUT', update)).status, 409);
  assert.equal((await request(`/api/conversations/${conversation.id}?clientId=solstice`)).status, 404);
  assert.equal((await request(`/api/conversations/${conversation.id}/context?clientId=solstice`)).status, 404);
  assert.equal((await request(`/api/conversations/${conversation.id}`, 'PUT', { ...update, clientId: 'solstice', revision: 1 })).status, 400);
  assert.equal((await request(`/api/conversations/${conversation.id}`, 'PUT', { ...update, clientId: 'solstice', taskDraft: { ...draft, clientId: 'solstice' }, revision: 1 })).status, 404);
  assert.deepEqual(await (await request('/api/conversations?clientId=solstice')).json(), []);
  const reopened = await (await request(`/api/conversations/${conversation.id}?clientId=kestrel`)).json();
  assert.deepEqual(reopened.messages, saved.messages);
  assert.deepEqual(reopened.taskDraft, draft);
  assert.equal((await request(`/api/conversations/${conversation.id}`, 'PUT', { ...update, revision: 1, messages: [{ ...update.messages[0], content: 'Rewrite the saved discussion' }] })).status, 400);
  // A new UI page sends only its visible tail. Existing older history must survive.
  tables.iw_conversations[0].messages = structuredClone(longHistory);
  const next = await request(`/api/conversations/${conversation.id}`, 'PUT', { ...update, revision: 1, messages: [{ id: 'tail-new', role: 'user', content: 'Continue GST filing' }], taskDraft: null });
  assert.equal(next.status, 200);
  const tail = await next.json();
  assert.equal(tail.messages.length, 400);
  assert.equal(tail.totalMessages, 651);
  assert.equal(tail.hasEarlierMessages, true);
  assert.equal(tables.iw_conversations[0].messages[180].content, longHistory[180].content);
  const earlier = await (await request(`/api/conversations/${conversation.id}?clientId=kestrel&before=${tail.firstMessageId}`)).json();
  assert.equal(earlier.messages.length, 251);
  assert.equal(earlier.hasEarlierMessages, false);
  const history = await (await request(`/api/conversations/${conversation.id}/context?clientId=kestrel&message=Jaipur%20GST%20filing`)).json();
  assert.ok(history.memory.includes('April invoices and the Jaipur branch'));
  assert.ok(history.history.length <= 40);
  assert.equal(history.totalMessages, 651);
  console.log('Client conversation validation, isolation, draft restoration, revisions and complete-history memory checks passed.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
