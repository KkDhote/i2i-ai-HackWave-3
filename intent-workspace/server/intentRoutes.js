import { Router } from 'express';
import { catalog, layouts } from './catalog.js';
import { decide, patchByRules } from './intent.js';
import { curated, patchPlan } from './plan.js';
import { planWithLLM } from './llm.js';
import { loadSource } from './data/service.js';
import { parseClientId } from './conversationStore.js';

export function parseCurrent(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || !Object.hasOwn(layouts, value.mode) || !Array.isArray(value.components) || value.components.length > 20) return undefined;
  const ids = new Set();
  const components = [];
  for (const c of value.components) {
    if (!c || !Object.hasOwn(catalog, c.id) || ids.has(c.id) || !Number.isInteger(c.span) || c.span < 3 || c.span > 12) return undefined;
    ids.add(c.id); components.push({ id: c.id, span: c.span });
  }
  return { mode: value.mode, title: layouts[value.mode].title, desc: layouts[value.mode].desc, components };
}

export function createIntentRouter({ loadSourceImpl = loadSource, planImpl = planWithLLM, env = process.env } = {}) {
  const router = Router();
  router.post('/api/intent', async (req, res) => {
    const { text = '', pick } = req.body || {}, cid = parseClientId(req.body?.clientId), current = parseCurrent(req.body?.current);
    if (typeof text !== 'string' || text.length > 2000 || cid === undefined || current === undefined || (pick !== undefined && (typeof pick !== 'string' || !Object.hasOwn(layouts, pick))) || (!pick && !text.trim())) return res.status(400).json({ error: 'Provide a supported goal, valid client and valid current screen.' });
    try {
      const src = await loadSourceImpl();
      const named = src.clients.filter(c => (c.aliases || []).some(a => new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) || text.toLowerCase().includes(c.name.toLowerCase()));
      if (named.length > 1 && !/\b(compare|versus|vs)\b|तुलना/i.test(text)) return res.json({ status: 'clarify', message: 'Which client should this screen use? Select a client and name only that client in your request.', options: [] });
      const client = src.clients.find(c => c.id === (named.length === 1 ? named[0].id : cid));
      if (!client) return res.status(400).json({ error: 'Select a valid workspace client.' });
      const clientId = client.id;
      const finish = result => {
        if (result.status === 'plan' && layouts[result.plan.mode].title.includes('{client}')) result = { ...result, plan: { ...result.plan, title: layouts[result.plan.mode].title.replace('{client}', client.name) } };
        return res.json({ ...result, clientId });
      };
      if (pick) return finish(curated(pick, { confidence: 0.8, source: 'user-pick', clientId }));
      if (/^(?:please\s+)?(?:send|delete|sync|deploy|transfer|buy|book|pay)\b|\b(?:weather|poem|recipe)\b|मौसम|कविता/i.test(text.trim())) return finish({status:'unsupported',message:'This input arranges workspace records and does not execute that request. Describe a supported client goal, or add a task for a person to complete.',options:[]});
      const patch = patchByRules(text, current?.components);
      if (patch) return finish(patchPlan(current, patch, { source: 'rules', clientId }));
      const d = decide(text);
      if (/^(?:help|hello|hi|show me stuff|client usage)[.!? ]*$/i.test(text.trim())) return finish({ status: 'clarify', message: 'What would you like to see?', options: ['meeting','usage','overdue','issues','followups','updates'].map(key => ({ key, label: layouts[key].name })) });
      let failed = false;
      if (env.NVIDIA_API_KEY) {
        try { return finish(await planImpl(text, current, { clientId, src })); }
        catch { failed = true; }
      }
      if (d.type === 'clarify') return finish({ status: 'clarify', message: d.message, options: d.keys.map(key => ({ key, label: layouts[key].name })) });
      return finish(curated(d.key, { hits: d.hits, confidence: d.confidence, source: 'rules', clientId, failed }));
    } catch { return res.status(503).json({ error: 'Workspace records could not be loaded. Please retry.' }); }
  });
  return router;
}
export default createIntentRouter();
