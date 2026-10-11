const j = async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const post = (url, body, ms) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }).then(j);
const historySignal = signal => signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
export const api = {
  createTask: async (task) => {
    const due = new Date(`${task.dueDate}T23:59:59.999`);
    if (!Number.isFinite(due.getTime())) throw Error('Choose a valid due date.');
    const result = await post('/api/goals/tasks', { title: task.title, owner: task.owner, priority: task.priority, status: task.status, blocker: task.blocker, description: task.description || '', location: task.location || '', clientId: task.clientId || null, dueAt: due.toISOString() }, 15000);
    window.dispatchEvent(new Event('workspace-tasks-changed'));
    return result;
  },
  taskIntake: body => post('/api/tasks/intake', body, 15000),
  conversations: (clientId, signal) => fetch('/api/conversations?clientId=' + encodeURIComponent(clientId || ''), { signal: historySignal(signal) }).then(j),
  conversation: (id, clientId, signal, before) => fetch(`/api/conversations/${encodeURIComponent(id)}?clientId=${encodeURIComponent(clientId || '')}${before ? '&before=' + encodeURIComponent(before) : ''}`, { signal: historySignal(signal) }).then(j),
  conversationContext: (id, clientId, message, signal) => fetch(`/api/conversations/${encodeURIComponent(id)}/context?clientId=${encodeURIComponent(clientId || '')}&message=${encodeURIComponent(message)}`, { signal: historySignal(signal) }).then(j),
  newConversation: clientId => post('/api/conversations', { clientId: clientId || null }, 15000),
  saveConversation: (id, body) => fetch('/api/conversations/' + encodeURIComponent(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }).then(j),
  data: (client = '', signal) => fetch('/api/data?client=' + encodeURIComponent(client), { signal }).then(j),
  intent: (body) => post('/api/intent', body, 120000),
  action: (body) => post('/api/action', body, 20000),
  eval: (mode) => fetch('/api/eval?mode=' + mode, { signal: AbortSignal.timeout(90000) }).then(j)
};
