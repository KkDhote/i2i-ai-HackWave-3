import { randomUUID } from 'node:crypto';

export const MESSAGE_PAGE_SIZE = 400;
const messageId = /^[a-zA-Z0-9_-]{1,100}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const validConversationId = value => typeof value === 'string' && uuid.test(value);
export function parseClientId(value) {
  if (value == null || value === '') return null;
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value) ? value : undefined;
}
export async function knownClient(db, clientId) {
  return clientId === null || Boolean(await db.collection('iw_clients').findOne({ id: clientId }, { projection: { _id: 0, id: 1 } }));
}
export function parseMessages(value) {
  if (!Array.isArray(value) || value.length > MESSAGE_PAGE_SIZE) return null;
  const messages = [];
  const ids = new Set();
  for (const item of value) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 6000 || typeof item.id !== 'string' || !messageId.test(item.id) || ids.has(item.id)) return null;
    ids.add(item.id);
    const message = { id: item.id, role: item.role, content: item.content };
    for (const [field, max] of [['source', 40], ['reason', 300], ['savedTaskKey', 100]]) {
      if (item[field] !== undefined) {
        if (typeof item[field] !== 'string' || item[field].length > max) return null;
        message[field] = item[field];
      }
    }
    if (item.language !== undefined) {
      if (!['en-IN', 'hi-IN'].includes(item.language)) return null;
      message.language = item.language;
    }
    for (const field of ['failed', 'partial', 'historyPartial']) if (item[field] !== undefined) {
      if (typeof item[field] !== 'boolean') return null;
      message[field] = item[field];
    }
    messages.push(message);
  }
  return messages;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function parseDraft(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (!['title', 'owner', 'dueDate', 'blocker', 'description', 'originalBrief', 'contextQuestion'].every(field => typeof value[field] === 'string') || !Array.isArray(value.contextAnswers) || typeof value.intakeComplete !== 'boolean' || !['title', 'owner', 'dueDate', 'priority', 'status', 'blocker', 'intake', 'context', 'review'].includes(value.field) || !['', 'High', 'Medium', 'Low'].includes(value.priority) || !['', 'open', 'in_progress', 'blocked', 'done'].includes(value.status)) return undefined;
  const draft = {};
  for (const [field, max] of [['title', 180], ['owner', 100], ['dueDate', 10], ['blocker', 500], ['description', 6000], ['originalBrief', 2000], ['contextQuestion', 240], ['understanding', 600]]) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string' || value[field].length > max) return undefined;
      draft[field] = value[field];
    }
  }
  if (draft.dueDate && !validDate(draft.dueDate)) return undefined;
  if (value.clientId !== undefined) {
    const clientId = parseClientId(value.clientId);
    if (clientId === undefined) return undefined;
    draft.clientId = clientId;
  }
  for (const [field, allowed] of [['priority', ['', 'High', 'Medium', 'Low']], ['status', ['', 'open', 'in_progress', 'blocked', 'done']], ['field', ['title', 'owner', 'dueDate', 'priority', 'status', 'blocker', 'intake', 'context', 'review']], ['source', ['rules', 'llm']]]) {
    if (value[field] !== undefined) {
      if (!allowed.includes(value[field])) return undefined;
      draft[field] = value[field];
    }
  }
  for (const field of ['intakeComplete', 'contextSkipped']) if (value[field] !== undefined) {
    if (typeof value[field] !== 'boolean') return undefined;
    draft[field] = value[field];
  }
  if (value.contextAnswers !== undefined) {
    if (!Array.isArray(value.contextAnswers) || value.contextAnswers.length > 2 || value.contextAnswers.some(item => typeof item?.question !== 'string' || !item.question.trim() || item.question.length > 240 || typeof item.answer !== 'string' || !item.answer.trim() || item.answer.length > 1500)) return undefined;
    draft.contextAnswers = value.contextAnswers.map(({ question, answer }) => ({ question, answer }));
  }
  if ((!draft.priority && draft.field !== 'priority') || (!draft.status && draft.field !== 'status')) return undefined;
  if (draft.field !== 'title' && !draft.title.trim()) return undefined;
  if (draft.field === 'context' && (!draft.contextQuestion.trim() || draft.intakeComplete || draft.contextAnswers.length >= 2)) return undefined;
  if (draft.field === 'review' && (!draft.owner.trim() || !draft.dueDate || !draft.intakeComplete || draft.status === 'blocked' && !draft.blocker.trim())) return undefined;
  return draft;
}
export function parseConversationUpdate(body) {
  const clientId = parseClientId(body?.clientId);
  const messages = parseMessages(body?.messages);
  const taskDraft = parseDraft(body?.taskDraft);
  if (clientId === undefined || !messages || taskDraft === undefined || (taskDraft?.clientId !== undefined && taskDraft.clientId !== clientId) || !['en-IN', 'hi-IN'].includes(body?.language) || (body.revision !== undefined && (!Number.isInteger(body.revision) || body.revision < 0)) || (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120))) return null;
  return { clientId, messages, taskDraft, language: body.language, ...(body.title !== undefined ? { title: body.title.trim() } : {}), ...(body.revision !== undefined ? { revision: body.revision } : {}) };
}
export function mergeMessages(stored, incoming) {
  const existing = new Map(stored.map(message => [message.id, message]));
  for (const message of incoming) {
    const previous = existing.get(message.id);
    if (previous && (previous.role !== message.role || previous.content !== message.content)) return null;
  }
  return [...stored, ...incoming.filter(message => !existing.has(message.id))];
}
export function newConversation(clientId, title, now = new Date()) {
  const at = now.toISOString();
  return { id: randomUUID(), clientId, title: title || 'New conversation', messages: [], taskDraft: null, language: 'en-IN', createdAt: at, updatedAt: at, revision: 0 };
}
export function conversationSummary({ id, clientId, title, updatedAt, createdAt, revision }) {
  return { id, clientId, title, updatedAt, createdAt, revision };
}
export function publicConversation(record, before) {
  const all = record.messages || [];
  const index = before ? all.findIndex(message => message.id === before) : all.length;
  if (index < 0) return null;
  const start = Math.max(0, index - MESSAGE_PAGE_SIZE);
  const draft = parseDraft(record.taskDraft);
  const taskDraft = draft?.clientId !== undefined && draft.clientId !== record.clientId ? null : draft || null;
  return { ...conversationSummary(record), language: record.language, messages: all.slice(start, index), taskDraft, totalMessages: all.length, hasEarlierMessages: start > 0, firstMessageId: all[start]?.id || null };
}

// Stored transcripts remain complete; model input is bounded and chosen across the entire transcript.
export function conversationContext(record, message = '') {
  const all = (record.messages || []).filter(item => !item.failed && ['user', 'assistant'].includes(item.role));
  let recentStart = all.length, recentLength = Math.min(message.length, 2000);
  while (recentStart > 0 && all.length - recentStart < 40) {
    const length = all[recentStart - 1].content.length;
    if (recentLength + length > 40000) break;
    recentLength += length; recentStart--;
  }
  const older = all.slice(0, recentStart);
  const tokens = [...new Set(message.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(token => !['the', 'and', 'for', 'that', 'this', 'with', 'task', 'about', 'what', 'which', 'please', 'add', 'create', 'new', 'client'].includes(token));
  const selected = new Set();
  const candidates = [];
  const add = index => { if (index >= 0 && index < older.length && !selected.has(index)) { selected.add(index); candidates.push(index); } };
  for (let index = 0; index < Math.min(4, older.length); index++) add(index);
  const matches = older.map((item, index) => ({ index, score: tokens.reduce((score, token) => score + (item.content.toLowerCase().includes(token) ? 1 : 0), 0) })).filter(item => item.score).sort((a, b) => b.score - a.score || b.index - a.index);
  for (const { index } of matches) { add(index - 1); add(index); add(index + 1); }
  for (let index = older.length - 1; index >= 0; index--) add(index);
  const kept = [];
  let length = 0;
  for (const index of candidates) {
    const content = `${older[index].role}: ${older[index].content.slice(0, 1600)}`;
    if (length + content.length + 2 > 20000) continue;
    kept.push({ index, content }); length += content.length + 2;
  }
  kept.sort((a, b) => a.index - b.index);
  return {
    messages: all.slice(recentStart).map(({ role, content }) => ({ role, content })),
    memory: kept.map(item => item.content).join('\n\n'),
    historyPartial: kept.length < older.length || kept.some(({ index }) => older[index].content.length > 1600),
    totalMessages: all.length
  };
}
