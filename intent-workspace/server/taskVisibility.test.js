import assert from 'node:assert/strict';
import { generateSeed } from './data/seedData.js';
import { buildPayload } from './data/payload.js';
import { TOOLS } from './agent/tools.js';
const now = new Date('2026-10-11T12:00:00Z');
const source = generateSeed(now);
source.tasks = [
  { title: 'Fix login issue', owner: 'Ankit', status: 'in_progress', priority: 'High', dueAt: '2026-10-29T18:29:59.999Z' },
  { title: 'Blocked overdue task', owner: 'Ravi', status: 'blocked', priority: 'High', dueAt: '2026-10-01T12:00:00Z', blocker: 'Waiting for access' },
  { title: 'In-progress overdue task', owner: 'Mei', status: 'in_progress', priority: 'Medium', dueAt: '2026-10-02T12:00:00Z' },
  ...['done', 'completed', 'closed'].map(status => ({ title: status, owner: 'Sam', status, priority: 'High', dueAt: '2026-10-01T12:00:00Z' }))
];
const payload = buildPayload(source, 'kestrel', now);
assert.equal(payload.kpis.home.find(k => k.label === 'Open tasks').value, '3');
assert.deepEqual(payload.tasks.map(t => t.task), ['Blocked overdue task', 'In-progress overdue task']);
assert.equal(payload.blockers.length, 1);
assert.equal(payload.kpis.overdue.find(k => k.label === 'On track').value, '33%');
const evidence = TOOLS.get_overdue_work.run(source, {}, now).data;
assert.equal(evidence.overdueCount, 2);
assert.deepEqual(evidence.overdue.map(t => t.task), payload.tasks.map(t => t.task));
console.log('In-progress/blocked task visibility and metrics checks passed.');
