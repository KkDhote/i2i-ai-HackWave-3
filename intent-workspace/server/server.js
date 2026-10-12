import mentorRoutes from './mentorRoutes.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import goalsRoutes from './goalsRoutes.js';
import chatRoutes from './chatRoutes.js';
import taskIntakeRoutes from './taskIntakeRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import customerReminderRoutes from './customerReminderRoutes.js';
import calendarRoutes from './calendarRoutes.js';
import intentRoutes from './intentRoutes.js';
import { startNotificationWorker } from './notificationWorker.js';

import { loadData } from './store.js';
import { draftAction } from './actions.js';
import { runEval } from './eval.js';
import dataRoutes from './data/routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use(mentorRoutes);
app.use(goalsRoutes);
app.use(dataRoutes);
app.use(chatRoutes);
app.use(taskIntakeRoutes);
app.use(conversationRoutes);
app.use(notificationRoutes);
app.use(customerReminderRoutes);
app.use(calendarRoutes);
app.use(intentRoutes);

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intent_workspace', { serverSelectionTimeoutMS: 2000 })
  .then(() => console.log('MongoDB connected'))
  .catch(() => console.log('MongoDB not available: using seed file'));

app.get('/api/health', (_, res) => res.json({ ok: true, llm: !!process.env.NVIDIA_API_KEY }));
app.get('/api/data', async (req, res) => res.json(await loadData(req.query.client)));

app.post('/api/action', async (req, res) => {
  const { action, mode, clientId } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });
  res.json(await draftAction({ action, mode, clientId }));
});
app.get('/api/eval', async (req, res) => res.json(await runEval(req.query.mode === 'llm' && !!process.env.NVIDIA_API_KEY)));

const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log('Server on http://localhost:' + port);
  startNotificationWorker();
});
