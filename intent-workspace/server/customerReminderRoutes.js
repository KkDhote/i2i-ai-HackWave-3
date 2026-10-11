import { Router } from 'express';
import { getDb } from './db.js';
import { taskKey } from './goalsRoutes.js';
import { parseCustomerReminder, reminderChannels } from './customerReminders.js';

const router = Router();

router.get('/api/notifications/settings', async (_req, res) => {
  try {
    const db = await getDb();
    const [reminders, deliveries] = await Promise.all([
      db.collection('iw_task_reminders').find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray(),
      db.collection('iw_notification_deliveries').find({}, { projection: { _id: 0, id: 1, taskKey: 1, taskTitle: 1, channel: 1, state: 1, provider: 1, providerId: 1, kind: 1, createdAt: 1, updatedAt: 1, acceptedAt: 1, error: 1 } }).sort({ createdAt: -1 }).limit(25).toArray()
    ]);
    res.json({ channels: reminderChannels(), reminders, deliveries, deliveryEnabled: process.env.NOTIFICATION_DELIVERY_ENABLED === 'true' });
  } catch {
    res.status(503).json({ error: 'Customer reminder settings are unavailable. Check the database connection.' });
  }
});

router.put('/api/notifications/settings/:taskKey', async (req, res) => {
  const reminder = parseCustomerReminder(req.body);
  if (!reminder) return res.status(400).json({ error: 'Provide valid customer contacts, selected channels and an enabled setting. Email reminders need an email address; SMS and WhatsApp need a phone number such as +919876543210.' });
  if (!/^[a-f0-9]{20}$/.test(req.params.taskKey)) return res.status(404).json({ error: 'Task not found.' });
  try {
    const db = await getDb();
    const tasks = await db.collection('iw_tasks').find({}, { projection: { title: 1, owner: 1, clientId: 1 } }).toArray();
    if (!tasks.some(task => taskKey(task) === req.params.taskKey)) return res.status(404).json({ error: 'Task not found.' });
    const saved = { taskKey: req.params.taskKey, ...reminder, updatedAt: new Date().toISOString() };
    await db.collection('iw_task_reminders').updateOne({ _id: req.params.taskKey }, { $set: saved }, { upsert: true });
    res.json(saved);
  } catch {
    res.status(503).json({ error: 'Customer reminder settings could not be saved. Check the database connection.' });
  }
});

export default router;
