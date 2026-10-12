import assert from 'node:assert/strict';
import { api } from './api.js';

// Verify the shared form/chat save operation without writing to MongoDB.
globalThis.window = new EventTarget();
let updates = 0, requests = 0;
window.addEventListener('workspace-tasks-changed', () => updates++);
const task = { title: 'Review API', owner: 'Asha', dueDate: '2026-10-12', priority: 'High', status: 'blocked', blocker: 'Waiting for access', description: 'Confirm the checkout API returns a valid payment reference.', location:'Pune office', clientId: 'northwind' };
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, '/api/goals/tasks');
  assert.equal(options.method, 'POST');
  const body = JSON.parse(options.body);
  assert.deepEqual({ ...body, dueAt: undefined }, { title: task.title, owner: task.owner, priority: task.priority, status: task.status, blocker: task.blocker, description: task.description, location:task.location, clientId: task.clientId, dueAt: undefined });
  assert.equal(new Date(body.dueAt).getHours(), 23);
  return new Response(JSON.stringify({ title: task.title, taskKey: 'test' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
assert.equal((await api.createTask(task)).taskKey, 'test');
assert.equal(updates, 1);
await assert.rejects(() => api.createTask({ ...task, dueDate: 'bad' }), /valid due date/);
assert.equal(requests, 1);
globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Already exists' }), { status: 409 });
await assert.rejects(() => api.createTask(task), /Already exists/);
assert.equal(updates, 1);
console.log('Task save payload and failure checks passed.');
