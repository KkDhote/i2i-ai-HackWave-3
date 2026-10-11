const j = async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};
const post = (url, body, ms) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }).then(j);
export const api = {
  createTask: async (task) => {
    const due = new Date(`${task.dueDate}T23:59:59.999`);
    if (!Number.isFinite(due.getTime())) throw Error('Choose a valid due date.');
    const result = await post('/api/goals/tasks', { title: task.title, owner: task.owner, priority: task.priority, status: task.status, blocker: task.blocker, dueAt: due.toISOString() }, 15000);
    window.dispatchEvent(new Event('workspace-tasks-changed'));
    return result;
  },
  data: (client = '', signal) => fetch('/api/data?client=' + encodeURIComponent(client), { signal }).then(j),
  intent: (body) => post('/api/intent', body, 120000),
  action: (body) => post('/api/action', body, 20000),
  eval: (mode) => fetch('/api/eval?mode=' + mode, { signal: AbortSignal.timeout(90000) }).then(j)
};
