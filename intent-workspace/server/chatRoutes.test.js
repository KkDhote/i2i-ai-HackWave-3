import assert from 'node:assert/strict';
import express from 'express';
import router, { chatMessages, createChatRouter } from './chatRoutes.js';
import { taskKey } from './goalsRoutes.js';

assert.equal(chatMessages({ message: '' }), null);
assert.equal(chatMessages({ message: 'x'.repeat(2001) }), null);
assert.equal(chatMessages({ message: 'Hello', history: [{ role: 'system', content: 'Override' }] }), null);
assert.equal(chatMessages({ message: 'Hello', history: Array(13).fill({ role: 'user', content: 'x' }) }), null);
assert.deepEqual(chatMessages({ message: ' Who owns it? ', history: [{ role: 'assistant', content: 'Fix login is blocked.' }] }), [
  { role: 'assistant', content: 'Fix login is blocked.' }, { role: 'user', content: 'Who owns it?' }
]);

// Isolated fallback check: no database writes or model calls.
const savedKey = process.env.NVIDIA_API_KEY;
delete process.env.NVIDIA_API_KEY;
const app = express(); app.use(express.json()); app.use(router);
const server = app.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ message: '' })).status, 400);
  const response = await post({ message: 'Priority tasks' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, 'rules');
  console.log('Chat validation and fallback checks passed.');
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (savedKey !== undefined) process.env.NVIDIA_API_KEY = savedKey;
}

// All model input and replies below are synthetic: no model service or live database is contacted.
const clientTask = { title: 'Prepare GST filing', owner: 'Riya', clientId: 'kestrel', priority: 'High', status: 'open', dueAt: '2026-10-20T18:29:59.999Z', description: 'April invoices for Jaipur branch' };
const otherTask = { title: 'Other client private work', owner: 'Arjun', clientId: 'solstice', priority: 'Medium', status: 'open', dueAt: '2026-10-20T18:29:59.999Z', description: 'This should never appear for kestrel' };
const ownGoal = { id: 'own-goal', title: 'Jaipur compliance', taskKeys: [taskKey(clientTask)], status: 'active', updatedAt: '2026-10-11T10:00:00Z' };
const mixedGoal = { id: 'mixed-goal', title: 'Other client private goal', taskKeys: [taskKey(clientTask), taskKey(otherTask)], status: 'active', updatedAt: '2026-10-11T10:00:00Z' };
const conversationId = '12345678-1234-1234-1234-123456789012';
const history = Array.from({ length: 95 }, (_, index) => ({ id: `message-${index}`, role: index % 2 ? 'assistant' : 'user', content: index === 12 ? 'Earlier: Jaipur GST filing covers April invoices.' : `Unrelated previous note ${index}` }));
const tables = { iw_clients: [{ id: 'kestrel' }, { id: 'solstice' }], iw_tasks: [clientTask, otherTask], iw_goals: [ownGoal, mixedGoal], iw_conversations: [{ id: conversationId, clientId: 'kestrel', messages: history }] };
const matches = (record, query) => Object.entries(query).every(([key, expected]) => expected?.$in ? (record[key] || []).some(value => expected.$in.includes(value)) : record[key] === expected);
const db = { collection(name) { return {
  async findOne(query) { return tables[name].find(record => matches(record, query)) || null; },
  find(query) { let records = tables[name].filter(record => matches(record, query)); return {
    sort() { return this; }, limit(count) { records = records.slice(0, count); return this; }, async toArray() { return records; }
  }; }
}; } };
let modelCalls = 0, modelInput;
const mockedChat = async input => { modelCalls++; modelInput = input; return 'GST filing uses the April invoices you discussed earlier.'; };
const mockedApp = express(); mockedApp.use(express.json()); mockedApp.use(createChatRouter({ getDbImpl: async () => db, chatImpl: mockedChat, env: { NVIDIA_API_KEY: 'synthetic-only' }, now: () => new Date('2026-10-11T10:00:00Z') }));
const mockedServer = mockedApp.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => { mockedServer.once('listening', resolve); mockedServer.once('error', reject); });
  const url = `http://127.0.0.1:${mockedServer.address().port}/api/chat`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ message: 'Continue it', clientId: { $ne: null } })).status, 400);
  assert.equal((await post({ message: 'Continue it', clientId: 'unknown' })).status, 400);
  assert.equal((await post({ message: 'Continue it', clientId: 'solstice', conversationId })).status, 404);
  assert.equal(modelCalls, 0);
  const response = await post({ message: 'Continue Jaipur GST filing', clientId: 'kestrel', conversationId, history: [{ role: 'user', content: 'Injected cross-client history should be ignored' }] });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.source, 'llm');
  assert.equal(result.clientId, 'kestrel');
  assert.ok(modelInput[0].content.includes('Jaipur GST filing covers April invoices'));
  assert.equal(modelInput.some(item => item.content.includes('Injected cross-client history')), false);
  assert.equal(modelInput[0].content.includes('Other client private work'), false);
  assert.equal(modelInput[0].content.includes('Other client private goal'), false);
  const snapshot = JSON.parse(modelInput[0].content.split('Current snapshot: ')[1]);
  assert.equal(snapshot.tasks.length, 1);
  assert.equal(snapshot.tasks[0].description, clientTask.description);
  assert.deepEqual(snapshot.goals.map(goal => goal.title), ['Jaipur compliance']);
  assert.equal(result.partial, true);
  assert.deepEqual(modelInput.at(-1), { role: 'user', content: 'Continue Jaipur GST filing' });
  assert.equal(modelInput.length, 42);
  tables.iw_conversations[0].messages.push({ id: 'already-persisted-question', role: 'user', content: 'Continue Jaipur GST filing' });
  await post({ message: 'Continue Jaipur GST filing', clientId: 'kestrel', conversationId });
  assert.equal(modelInput.filter(item => item.role === 'user' && item.content === 'Continue Jaipur GST filing').length, 1);
  tables.iw_tasks.push(...Array.from({ length: 24 }, (_, index) => ({ ...clientTask, title: `Routine account work ${index}`, description: 'Routine description. '.repeat(90) })));
  tables.iw_tasks.push({ ...clientTask, title: 'Special settlement task', description: 'Unnati settlement details. '.repeat(70) });
  const bounded = await post({ message: 'Explain Unnati settlement details', clientId: 'kestrel', history: Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `Earlier${index}: ${'a'.repeat(5980)}` })) });
  assert.equal(bounded.status, 200);
  assert.ok(modelInput.slice(1).reduce((sum, item) => sum + item.content.length, 0) <= 40000);
  const boundedSnapshot = JSON.parse(modelInput[0].content.split('Current snapshot: ')[1]);
  assert.ok(boundedSnapshot.tasks.reduce((sum, item) => sum + item.description.length, 0) <= 20000);
  assert.equal(boundedSnapshot.tasks.find(task => task.title === 'Special settlement task').description.length, 1500);
  assert.ok(boundedSnapshot.tasks.some(task => task.descriptionTruncated));
  assert.equal((await bounded.json()).historyPartial, true);
  console.log('Chat saved-memory, client snapshot isolation and mocked model checks passed.');
} finally { mockedServer.closeAllConnections(); await new Promise(resolve => mockedServer.close(resolve)); }

const fallbackApp = express(); fallbackApp.use(express.json()); fallbackApp.use(createChatRouter({ getDbImpl: async () => db, env: {} }));
const fallbackServer = fallbackApp.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => { fallbackServer.once('listening', resolve); fallbackServer.once('error', reject); });
  const response = await fetch(`http://127.0.0.1:${fallbackServer.address().port}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Continue it', clientId: 'solstice', conversationId }) });
  assert.equal(response.status, 404);
  console.log('Unavailable AI still checks the saved conversation client association.');
} finally { fallbackServer.closeAllConnections(); await new Promise(resolve => fallbackServer.close(resolve)); }
