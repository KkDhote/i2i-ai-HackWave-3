import { Router } from 'express';
import { getWorkspaceData, loadSource } from './service.js';
import { buildBriefing } from '../agent/tools.js';

const router = Router();

// Same URL and same JSON shape the frontend already uses, but built from MongoDB.
router.get('/api/data', async (req, res) => {
  try { res.json(await getWorkspaceData(req.query.client)); }
  catch (e) { console.error('data error:', e.message); res.status(500).json({ error: e.message }); }
});

router.get('/api/clients', async (_, res) => {
  try { const { clients } = await loadSource(); res.json(clients.map(c => ({ id: c.id, name: c.name, plan: c.plan, health: c.health }))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Proactive briefing: what needs attention right now, each item with a goal the user can click. No prompt, no LLM, instant.
router.get('/api/briefing', async (_, res) => {
  try { res.json(buildBriefing(await loadSource(), new Date())); }
  catch (e) { console.error('briefing error:', e.message); res.status(500).json({ error: e.message }); }
});

export default router;
