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
import { startNotificationWorker } from './notificationWorker.js';

import { layouts } from './catalog.js';
import { decide, patchByRules, detectClient } from './intent.js';
import { curated, patchPlan, titleFor } from './plan.js';
import { planWithLLM } from './llm.js';
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

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/intent_workspace', { serverSelectionTimeoutMS: 2000 })
  .then(() => console.log('MongoDB connected'))
  .catch(() => console.log('MongoDB not available: using seed file'));

app.get('/api/health', (_, res) => res.json({ ok: true, llm: !!process.env.NVIDIA_API_KEY }));
app.get('/api/data', async (req, res) => res.json(await loadData(req.query.client)));

const WARM = ["Prepare for tomorrow's client meeting", 'Investigate why active users dropped', 'Review overdue project work'];
const withClient = (base, clientId) => ({ ...base, clientId,
  plan: { ...base.plan, title: titleFor(base.plan.mode, base.plan.title, clientId) } });

app.post('/api/intent', async (req, res) => {
  const { text = '', pick, current, clientId: cid } = req.body || {};
  if (pick && layouts[pick]) return res.json(curated(pick, { confidence: 0.8, source: 'user-pick', clientId: cid }));
  if (!text.trim()) return res.status(400).json({ error: 'text is required' });
  const clientId = detectClient(text) || cid;   // "Kestrel usage" switches the client

  let failed = false;
  if (process.env.NVIDIA_API_KEY) {
    try {
      const base = await planWithLLM(text, WARM.includes(text.trim()) ? null : current);
      return res.json(base.status === 'plan' ? withClient(base, clientId) : base);
    } catch (e) { failed = true; console.warn('LLM failed, using rules:', e.message); }
  }
  // Rules fallback: refinement first, then new intent
  const patch = patchByRules(text, current?.components);
  if (patch) return res.json(patchPlan(current, patch, { source: 'rules', clientId, failed }));
  const d = decide(text);
  if (d.type === 'clarify') return res.json({ status: 'clarify', message: d.message, options: d.keys.map(k => ({ key: k, label: layouts[k].name })) });
  res.json(curated(d.key, { hits: d.hits, confidence: d.confidence, source: 'rules', clientId, failed }));
});

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
  if (process.env.NVIDIA_API_KEY) WARM.forEach(t => planWithLLM(t, null).catch(() => {}));  // pre-warm: demo prompts answer instantly
});
