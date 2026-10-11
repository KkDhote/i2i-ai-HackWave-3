import { createHash } from 'node:crypto';
import { getDb } from './db.js';
import { taskKey } from './goalsRoutes.js';
import { buildNotifications } from './notifications.js';
import { reminderChannels } from './customerReminders.js';
import { sendReminder } from './notificationDelivery.js';

const customerAlert = alert => ['due_1d', 'due_today', 'overdue'].includes(alert.kind) || (alert.kind === 'due_3d' && alert.daysUntilDue === 3);
const recipientFor = (channel, reminder) => String(reminder.email || '').trim().toLowerCase();
const deliveryKey = (alert, channel, recipient) => createHash('sha256').update(JSON.stringify([alert.id, channel, recipient])).digest('hex');
const failureMessage = 'The provider could not accept this request. Check the provider log before sending again.';
const unknownMessage = 'The provider request outcome is unknown. Verify in the provider console before sending again.';

export async function runNotificationCycle({ db, now = Date.now, env = process.env, send = sendReminder } = {}) {
  const summary = { enabled: env.NOTIFICATION_DELIVERY_ENABLED === 'true', attempted: 0, accepted: 0, failed: 0, unknown: 0 };
  if (!summary.enabled) return summary;
  const clock = () => new Date(typeof now === 'function' ? now() : now).getTime();
  const tasksCollection = db.collection('iw_tasks'), remindersCollection = db.collection('iw_task_reminders'), deliveries = db.collection('iw_notification_deliveries');
  const current = clock(), timestamp = new Date(current).toISOString();
  // A process interruption can leave a provider request's result unknown. Never retry it automatically.
  await deliveries.updateMany({ state: 'sending', createdAt: { $lt: new Date(current - 10 * 60000).toISOString() } },
    { $set: { state: 'unknown', updatedAt: timestamp, error: 'Delivery result is unknown after an interrupted check. Verify with the provider before trying again.' } });
  const [tasks, reminders] = await Promise.all([tasksCollection.find({}).toArray(), remindersCollection.find({ enabled: true }).toArray()]);
  const byKey = new Map(tasks.map(task => [taskKey(task), task]));
  const alerts = buildNotifications(tasks, [], current).filter(customerAlert);
  for (const alert of alerts) {
    const initialTask = byKey.get(alert.taskKey), initialReminder = reminders.find(reminder => reminder.taskKey === alert.taskKey);
    if (!initialTask || !initialReminder || !Array.isArray(initialReminder.channels)) continue;
    for (const channel of initialReminder.channels) {
      if (env.NOTIFICATION_DELIVERY_ENABLED !== 'true' || !reminderChannels(env)[channel]?.configured) continue;
      // Re-read both records just before reserving each channel, including its due-date stage.
      const [task, reminder] = await Promise.all([
        tasksCollection.findOne(initialTask._id != null ? { _id: initialTask._id } : { title: initialTask.title, owner: initialTask.owner, clientId: initialTask.clientId ?? null }),
        remindersCollection.findOne({ taskKey: alert.taskKey })
      ]);
      if (!task || !reminder?.enabled || !Array.isArray(reminder.channels) || !reminder.channels.includes(channel)
        || env.NOTIFICATION_DELIVERY_ENABLED !== 'true' || !reminderChannels(env)[channel]?.configured) continue;
      const freshAlert = buildNotifications([task], [], clock()).find(candidate => customerAlert(candidate) && candidate.id === alert.id);
      const recipient = recipientFor(channel, reminder);
      if (!freshAlert || !recipient) continue;
      const id = deliveryKey(freshAlert, channel, recipient), createdAt = new Date(clock()).toISOString();
      const record = { _id: id, id, taskKey: alert.taskKey, taskTitle: task.title, channel, kind: freshAlert.kind, state: 'sending',
        provider: reminderChannels(env)[channel].provider, createdAt, updatedAt: createdAt };
      try { await deliveries.insertOne(record); }
      catch (error) { if (error.code === 11000) continue; throw error; }
      summary.attempted++;
      let result;
      try {
        result = await send(channel, reminder, task, freshAlert, id, { env });
        if (result?.status !== 'accepted' || typeof result.providerId !== 'string' || !result.providerId) throw Object.assign(new Error('Provider did not confirm acceptance.'), { deliveryState: 'unknown' });
      } catch (error) {
        const state = error?.deliveryState === 'unknown' ? 'unknown' : 'failed';
        summary[state]++;
        await deliveries.updateOne({ _id: id }, { $set: { state, updatedAt: new Date(clock()).toISOString(), error: state === 'unknown' ? unknownMessage : failureMessage } });
        continue;
      }
      const acceptedAt = new Date(clock()).toISOString();
      await deliveries.updateOne({ _id: id }, { $set: { state: 'accepted', providerId: result.providerId, acceptedAt, updatedAt: acceptedAt } });
      summary.accepted++;
    }
  }
  return summary;
}

export function startNotificationWorker({ getDatabase = getDb, env = process.env, send = sendReminder, intervalMs = 60000, logger = console } = {}) {
  let busy = false, stopped = false;
  const tick = async () => {
    if (busy || stopped || env.NOTIFICATION_DELIVERY_ENABLED !== 'true') return;
    busy = true;
    try {
      const db = await getDatabase();
      if (!stopped) await runNotificationCycle({ db, env, send });
    } catch { logger.error('Notification delivery check failed. Check the database and provider settings.'); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => { stopped = true; clearInterval(timer); };
}
