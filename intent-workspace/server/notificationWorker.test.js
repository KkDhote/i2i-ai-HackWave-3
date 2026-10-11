import test from 'node:test';
import assert from 'node:assert/strict';
import { runNotificationCycle, startNotificationWorker } from './notificationWorker.js';
import { buildNotifications } from './notifications.js';
import { taskKey } from './goalsRoutes.js';
import { createHash } from 'node:crypto';

const task = { _id: 'task-1', title: 'Complete UPI checkout', owner: 'Ankit', status: 'in_progress', dueAt: '2026-10-14T18:29:59.999Z', priority: 'Medium', clientId: null };
const reminder = { taskKey: taskKey(task), customerName: 'Neha', email: 'neha@example.com', phone: '+919876543210', channels: ['email'], enabled: true };
const env = { NOTIFICATION_DELIVERY_ENABLED: 'true', RESEND_API_KEY: 'test-only-key', NOTIFICATION_EMAIL_FROM: 'demo@example.com' };
const at = date => Date.parse(`2026-10-${date}T06:30:00Z`);
const matches = (record, query) => Object.entries(query).every(([key, value]) => value?.$lt ? record[key] < value.$lt : record[key] === value);
function fakeDb({ tasks = [task], reminders = [reminder], deliveries = [], beforeRead } = {}) {
  const rows = { iw_tasks: structuredClone(tasks), iw_task_reminders: structuredClone(reminders), iw_notification_deliveries: structuredClone(deliveries) };
  return { rows, collection(name) {
    return {
      find(query) { return { async toArray() { return structuredClone(rows[name].filter(row => matches(row, query))); } }; },
      async findOne(query) { beforeRead?.(name, rows); return structuredClone(rows[name].find(row => matches(row, query)) ?? null); },
      async insertOne(record) { if (rows[name].some(row => row._id === record._id)) throw Object.assign(new Error('Duplicate key'), { code: 11000 }); rows[name].push(structuredClone(record)); },
      async updateOne(query, update) { const record = rows[name].find(row => matches(row, query)); if (record) Object.assign(record, update.$set); },
      async updateMany(query, update) { rows[name].filter(row => matches(row, query)).forEach(row => Object.assign(row, update.$set)); }
    };
  } };
}

test('customer stages send once per channel across repeated cycles and restarts', async () => {
  const db = fakeDb(), sent = [];
  const send = async (...args) => { sent.push(args); return { status: 'accepted', providerId: `request-${sent.length}` }; };
  for (const date of ['11', '11', '12', '13', '13', '14', '15', '16']) await runNotificationCycle({ db, now: at(date), env, send });
  assert.deepEqual(sent.map(call => call[3].kind), ['due_3d', 'due_1d', 'due_today', 'overdue']);
  assert.equal(db.rows.iw_notification_deliveries.length, 4);
  assert.ok(db.rows.iw_notification_deliveries.every(row => row.state === 'accepted' && row.providerId && row.acceptedAt));
  assert.ok(db.rows.iw_notification_deliveries.every(row => !('email' in row) && !('phone' in row)));
  assert.ok(!JSON.stringify(db.rows.iw_notification_deliveries).includes(reminder.email));
  assert.ok(!JSON.stringify(db.rows.iw_notification_deliveries).includes(env.RESEND_API_KEY));
});

test('delivery requires master flag, configured provider and enabled customer contact', async () => {
  let sent = 0;
  const send = async () => { sent++; return { status: 'accepted', providerId: 'request-1' }; };
  assert.equal((await runNotificationCycle({ env: {}, send })).enabled, false);
  for (const settings of [fakeDb(), fakeDb({ reminders: [{ ...reminder, enabled: false }] })]) {
    await runNotificationCycle({ db: settings, now: at('11'), env: { NOTIFICATION_DELIVERY_ENABLED: 'true' }, send });
    assert.equal(settings.rows.iw_notification_deliveries.length, 0);
  }
  assert.equal(sent, 0);
  let databaseCalls = 0;
  const stop = startNotificationWorker({ env: {}, getDatabase: async () => { databaseCalls++; }, send });
  stop();
  assert.equal(databaseCalls, 0);
});

test('legacy phone channels are skipped while email sends once', async () => {
  const db = fakeDb({ reminders: [{ ...reminder, channels: ['email', 'whatsapp', 'sms'] }] }), sent = [];
  const send = async channel => { sent.push(channel); return { status: 'accepted', providerId: `request-${channel}` }; };
  await runNotificationCycle({ db, now: at('11'), env, send });
  await runNotificationCycle({ db, now: at('11'), env, send });
  assert.deepEqual(sent, ['email']);
  assert.equal(new Set(db.rows.iw_notification_deliveries.map(row => row._id)).size, 1);
});

test('fresh completion, rescheduling or disabled contacts prevent a stale queued send', async () => {
  let sent = 0;
  const send = async () => { sent++; return { status: 'accepted', providerId: 'request-1' }; };
  for (const change of [rows => { rows.iw_tasks[0].status = 'done'; }, rows => { rows.iw_tasks[0].dueAt = '2026-11-14T18:29:59.999Z'; }, rows => { rows.iw_task_reminders[0].enabled = false; }]) {
    const db = fakeDb({ beforeRead: (_name, rows) => change(rows) });
    await runNotificationCycle({ db, now: at('11'), env, send });
    assert.equal(db.rows.iw_notification_deliveries.length, 0);
  }
  assert.equal(sent, 0);
  const db = fakeDb({ reminders: [{ ...reminder, channels: ['email', 'sms'] }] });
  await runNotificationCycle({ db, now: at('11'), env, send: async () => { sent++; db.rows.iw_tasks[0].status = 'done'; return { status: 'accepted', providerId: 'request-1' }; } });
  assert.equal(sent, 1);
});

test('provider errors stay failed and never automatically retry or expose provider secrets', async () => {
  const db = fakeDb(); let sent = 0;
  const send = async () => { sent++; throw new Error(`timeout with ${env.RESEND_API_KEY} ${reminder.email}`); };
  await runNotificationCycle({ db, now: at('11'), env, send });
  await runNotificationCycle({ db, now: at('11'), env, send });
  const record = db.rows.iw_notification_deliveries[0];
  assert.equal(sent, 1);
  assert.equal(record.state, 'failed');
  assert.match(record.error, /Check the provider log/);
  assert.ok(!record.error.includes(env.RESEND_API_KEY) && !record.error.includes(reminder.email));
});

test('interrupted sending becomes unknown and is never retried', async () => {
  const alert = buildNotifications([task], [], at('11'))[0];
  const id = createHash('sha256').update(JSON.stringify([alert.id, 'email', reminder.email])).digest('hex');
  const db = fakeDb({ deliveries: [{ _id: id, state: 'sending', createdAt: new Date(at('11') - 11 * 60000).toISOString() }] });
  let sent = 0;
  await runNotificationCycle({ db, now: at('11'), env, send: async () => { sent++; } });
  assert.equal(sent, 0);
  assert.equal(db.rows.iw_notification_deliveries[0].state, 'unknown');
});

test('ambiguous provider timeouts remain unknown without an automatic retry', async () => {
  const db = fakeDb(); let sent = 0;
  const send = async () => { sent++; throw Object.assign(new Error('Raw provider timeout details'), { deliveryState: 'unknown' }); };
  const result = await runNotificationCycle({ db, now: at('11'), env, send });
  await runNotificationCycle({ db, now: at('11'), env, send });
  assert.equal(sent, 1);
  assert.equal(result.unknown, 1);
  assert.equal(db.rows.iw_notification_deliveries[0].state, 'unknown');
  assert.ok(!db.rows.iw_notification_deliveries[0].error.includes('Raw provider'));
});

test('customer reminders never send internal blockers or goals', async () => {
  const db = fakeDb({ tasks: [{ ...task, dueAt: '2026-11-14T18:29:59.999Z', blocker: 'Internal approval is pending', status: 'blocked' }] });
  let sent = 0;
  await runNotificationCycle({ db, now: at('11'), env, send: async () => { sent++; } });
  assert.equal(sent, 0);
});
