// P0 extension: persistent goal plans linked to existing iw_tasks, computed live graph and gap radar.
import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db.js';

const router = Router();
const key = task => createHash('sha256').update(JSON.stringify([task.clientId ?? '', task.title ?? '', task.owner ?? ''])).digest('hex').slice(0, 20);
const iso = () => new Date().toISOString();
const trim = (value, max = 180) => String(value ?? '').trim().slice(0, max);
function enrich(goal, tasks, now = Date.now()) {
  const linked = goal.taskKeys.map(k => tasks.find(t => key(t) === k)).filter(Boolean);
  const done = linked.filter(t => ['done', 'completed', 'closed'].includes(String(t.status).toLowerCase())).length;
  const overdue = linked.filter(t => !['done', 'completed', 'closed'].includes(String(t.status).toLowerCase()) && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < now);
  const blocked = linked.filter(t => t.blocker && !['done', 'completed', 'closed'].includes(String(t.status).toLowerCase()));
  const unlinked = goal.taskKeys.length - linked.length;
  const stalled = linked.length > 0 && done < linked.length && Date.parse(goal.updatedAt) < now - 7 * 86400000;
  const alerts = [
    ...overdue.map(t => ({ kind: 'overdue', severity: 'high', message: `${t.title} is overdue`, taskKey: key(t) })),
    ...blocked.map(t => ({ kind: 'blocked', severity: 'high', message: `${t.title} is blocked: ${trim(t.blocker, 100)}`, taskKey: key(t) })),
    ...(unlinked ? [{ kind: 'missing', severity: 'medium', message: `${unlinked} linked task(s) no longer found` }] : []),
    ...(stalled ? [{ kind: 'stalled', severity: 'medium', message: 'Goal has not been updated for 7 days' }] : [])
  ];
  const nodes = [
    { id: goal.id, label: goal.title, type: 'goal', status: goal.status },
    ...linked.map(t => ({ id: key(t), label: t.title, type: 'task', status: t.status, owner: t.owner }))
  ];
  return { ...goal, progress: goal.taskKeys.length ? Math.round(100 * done / goal.taskKeys.length) : 0,
    completedTasks: done, totalTasks: goal.taskKeys.length,
    graph: { nodes, edges: linked.map(t => ({ from: goal.id, to: key(t) })) }, alerts };
}
const safe = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.get('/api/goals/tasks', safe(async (req, res) => {
  const db = await getDb();
  const tasks = await db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray();
  res.json(tasks.map(t => ({ taskKey: key(t), title: t.title, owner: t.owner, status: t.status, priority: t.priority, dueAt: t.dueAt, blocker: t.blocker ?? null, clientId: t.clientId ?? null })));
}));
router.get('/api/goals', safe(async (req, res) => {
  const db = await getDb();
  const [goals, tasks] = await Promise.all([
    db.collection('iw_goals').find({}).sort({ createdAt: -1 }).toArray(),
    db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray()
  ]);
  res.json(goals.map(g => enrich({ ...g, _id: undefined }, tasks)));
}));
router.post('/api/goals', safe(async (req, res) => {
  const title = trim(req.body?.title), taskKeys = req.body?.taskKeys;
  if (!title || !Array.isArray(taskKeys) || taskKeys.length > 50 || !taskKeys.every(k => typeof k === 'string'))
    return res.status(400).json({ error: 'Provide title and taskKeys array (up to 50).' });
  const db = await getDb();
  const tasks = await db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray();
  const valid = new Set(tasks.map(key));
  const unique = [...new Set(taskKeys)];
  if (unique.some(k => !valid.has(k))) return res.status(400).json({ error: 'One or more taskKeys are invalid.' });
  const goal = { id: randomUUID(), title, status: 'active', taskKeys: unique, createdAt: iso(), updatedAt: iso() };
  await db.collection('iw_goals').insertOne(goal);
  res.status(201).json(enrich(goal, tasks));
}));
router.patch('/api/goals/:id', safe(async (req, res) => {
  const update = {};
  if (req.body?.status !== undefined) {
    if (!['active', 'paused', 'completed'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    update.status = req.body.status;
  }
  if (req.body?.title !== undefined) {
    update.title = trim(req.body.title);
    if (!update.title) return res.status(400).json({ error: 'Title required' });
  }
  if (Array.isArray(req.body?.taskKeys)) {
    if (req.body.taskKeys.length > 50) return res.status(400).json({ error: 'Too many tasks' });
    const db = await getDb();
    const tasks = await db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray();
    const valid = new Set(tasks.map(key));
    update.taskKeys = [...new Set(req.body.taskKeys)];
    if (update.taskKeys.some(k => !valid.has(k))) return res.status(400).json({ error: 'Invalid taskKey' });
  }
  update.updatedAt = iso();
  const db = await getDb();
  const result = await db.collection('iw_goals').updateOne({ id: req.params.id }, { $set: update });
  if (!result.matchedCount) return res.status(404).json({ error: 'Goal not found' });
  const [goal, tasks] = await Promise.all([db.collection('iw_goals').findOne({ id: req.params.id }), db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray()]);
  res.json(enrich({ ...goal, _id: undefined }, tasks));
}));
export default router;
