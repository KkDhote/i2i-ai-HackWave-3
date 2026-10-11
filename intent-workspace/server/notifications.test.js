import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifications, notificationSchedule } from './notifications.js';
import { taskKey } from './goalsRoutes.js';

const now = Date.parse('2026-10-11T06:30:00Z');
const task = { title: 'Fix UPI checkout', owner: 'Ankit', status: 'in_progress', priority: 'Medium', dueAt: '2026-10-14T18:29:59.999Z' };

test('three-day and one-day reminders follow Indian calendar days', () => {
  assert.deepEqual(notificationSchedule, { daysBefore: [3, 1], timezone: 'Asia/Kolkata' });
  const three = buildNotifications([task], [], now)[0];
  assert.equal(three.kind, 'due_3d');
  assert.equal(three.daysUntilDue, 3);
  assert.equal(three.href, `#task-${taskKey(task)}`);
  const two = buildNotifications([task], [], Date.parse('2026-10-11T18:30:00Z'))[0];
  assert.equal(two.daysUntilDue, 2);
  assert.equal(two.id, three.id);
  const one = buildNotifications([task], [], Date.parse('2026-10-12T18:30:00Z'))[0];
  assert.equal(one.kind, 'due_1d');
  assert.equal(one.daysUntilDue, 1);
  assert.notEqual(one.id, three.id);
  assert.equal(buildNotifications([task], [], Date.parse('2026-10-09T18:29:59Z')).length, 0);
});

test('today and overdue are separate reminders, with stable IDs and rescheduling', () => {
  const today = buildNotifications([task], [], Date.parse('2026-10-14T06:30:00Z'))[0];
  assert.equal(today.kind, 'due_today');
  const overdue = buildNotifications([task], [], Date.parse('2026-10-14T18:30:00Z'))[0];
  assert.equal(overdue.kind, 'overdue');
  assert.notEqual(overdue.id, today.id);
  assert.equal(buildNotifications([task], [], now)[0].id, buildNotifications([task], [], now + 60000)[0].id);
  assert.notEqual(buildNotifications([{ ...task, dueAt: '2026-10-13T18:29:59.999Z' }], [], now)[0].id, buildNotifications([task], [], now)[0].id);
});

test('completed tasks are quiet and blocked tasks retain the due reminder', () => {
  for (const status of ['done', 'completed', 'closed', 'DONE']) assert.deepEqual(buildNotifications([{ ...task, status, blocker: 'Keys pending' }], [], now), []);
  const blocked = { ...task, status: 'blocked', blocker: 'Payment gateway keys pending' };
  const alerts = buildNotifications([blocked], [], now);
  assert.deepEqual(alerts.map(alert => alert.kind), ['blocked', 'due_3d']);
  assert.equal(alerts[0].message, blocked.blocker);
  assert.notEqual(alerts[0].id, buildNotifications([{ ...blocked, blocker: 'GST documents pending' }], [], now)[0].id);
  assert.match(buildNotifications([{ ...blocked, blocker: null }], [], now)[0].message, /No blocker reason/);
});

test('missing and invalid schedules ask for correction without inventing dates', () => {
  for (const dueAt of [null, '', 'not-a-date', '2026-02-30', '2026-02-30T18:29:59.999Z']) {
    const alert = buildNotifications([{ ...task, dueAt }], [], now)[0];
    assert.equal(alert.kind, dueAt ? 'invalid_due_date' : 'missing_due_date');
    assert.equal(alert.dueAt, undefined);
    assert.equal(alert.daysUntilDue, undefined);
  }
  const mongoDate = buildNotifications([{ ...task, dueAt: new Date(task.dueAt) }], [], now)[0];
  assert.equal(mongoDate.kind, 'due_3d');
});

test('active goals report missing links and stale unfinished work without duplicating overdue tasks', () => {
  const goal = { id: 'goal-1', title: 'Launch Hindi checkout', status: 'active', taskKeys: [taskKey(task), 'missing'], updatedAt: '2026-10-01T00:00:00Z' };
  const alerts = buildNotifications([task], [goal], now);
  assert.equal(alerts.filter(alert => alert.kind === 'goal_missing_tasks').length, 1);
  assert.equal(alerts.filter(alert => alert.kind === 'goal_stalled').length, 1);
  assert.equal(alerts.find(alert => alert.goalId).href, '#goal-goal-1');
  for (const status of ['paused', 'completed']) assert.equal(buildNotifications([task], [{ ...goal, status }], now).filter(alert => alert.goalId).length, 0);
  assert.equal(buildNotifications([{ ...task, status: 'done' }], [{ ...goal, taskKeys: [taskKey(task)] }], now).length, 0);
  const overdueTask = { ...task, dueAt: '2026-10-01T00:00:00Z' };
  assert.equal(buildNotifications([overdueTask], [goal], now).filter(alert => alert.kind === 'overdue').length, 1);
});
