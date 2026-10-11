import { Router } from 'express';
import { getDb } from './db.js';
import { buildNotifications, notificationSchedule } from './notifications.js';

const router = Router();
router.get('/api/notifications', async (_req, res) => {
  try {
    const db = await getDb();
    const [tasks, goals] = await Promise.all([
      db.collection('iw_tasks').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('iw_goals').find({}, { projection: { _id: 0 } }).toArray()
    ]);
    const now = Date.now();
    res.json({ notifications: buildNotifications(tasks, goals, now), generatedAt: new Date(now).toISOString(), schedule: notificationSchedule });
  } catch {
    res.status(503).json({ error: 'Notifications are temporarily unavailable. Check the workspace database and try again.' });
  }
});
export default router;
