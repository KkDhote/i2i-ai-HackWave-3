import { catalog, layouts, TASKS } from './catalog.js';
import { buildComponents, applyPatch } from './plan.js';

// The AI decides intent + layout, but ONLY from the catalog. Any problem -> throw -> server falls back to rules.
// It sees the current screen, so it can answer a new goal (replace) or a refinement (patch).
// Cache: same request -> instant answer (no second AI call).
const cache = new Map();
const keyOf = (text, current) => {
  const c = current && current.mode !== 'home' ? current : null;
  return text.trim().toLowerCase() + '|' + (c ? c.mode + ':' + c.components.map(x => x.id).join(',') : '');
};
export async function planWithLLM(text, current) {
  const k = keyOf(text, current), hit = cache.get(k);
  if (hit) return { ...hit, intent: hit.intent && { ...hit.intent, ms: 0, cached: true } };
  const out = await planFresh(text, current);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(k, out);
  return out;
}

async function planFresh(text, current) {
  const t0 = Date.now();
  const hasCur = current?.components?.length > 0 && current.mode !== 'home';
  const ids = Object.entries(catalog).map(([id, c]) => `${id}: ${c.title}`).join('\n');
  const cur = hasCur ? `Current screen (task "${current.mode}"): ${current.components.map(c => c.id).join(', ')}` : 'No current task: the default dashboard is showing.';
  const system = `You plan the screen of an adaptive business workspace. The UI is built only from a fixed catalog of components; you never write code.
Reply with ONE JSON object only (no prose, no code fences):
{"op":"replace|patch|unsupported","intent":"meeting|usage|overdue|other","confidence":0.0-1.0,"title":"string","desc":"string",
 "summary":"1-2 sentences telling the user how and why you arranged the screen",
 "clarify":null or {"message":"string","options":[{"key":"meeting|usage|overdue","label":"string"}]},
 "components":[{"id":"string","span":3-12,"reason":"one short sentence"}],
 "patch":{"add":[{"id":"string","span":3-12,"reason":"string"}],"remove":["id"]}}
Catalog ids:
${ids}
${cur}
Rules:
- New goal: op "replace" with 4-7 components, most important first, spans in a row add up to 12, no patch.
- Refinement of the current screen (also show X, remove Y, focus on Z): op "patch", empty components. Only when a current task exists.
- If the goal is too vague, set "clarify" and leave components and patch empty.
- If the request is unrelated to this workspace (clients, usage, projects, tasks, accounts) and cannot be answered by combining catalog components, set op "unsupported" and put one friendly sentence in "summary". If it CAN be answered by combining components, do that instead.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(6000),
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.LLM_MODEL || 'claude-haiku-5-5', max_tokens: 900, system, messages: [{ role: 'user', content: text }] })
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const raw = (await res.json()).content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
  const out = JSON.parse(raw);
  const ms = Date.now() - t0;

  if (out.op === 'unsupported') return { status: 'unsupported', message: String(out.summary || 'That is outside what this workspace can do.').slice(0, 300), options: TASKS.map(k => ({ key: k, label: layouts[k].name })) };
  if (out.clarify?.options?.length) {
    const options = out.clarify.options.filter(o => layouts[o.key]);
    if (options.length) return { status: 'clarify', message: String(out.clarify.message), options: options.map(o => ({ key: o.key, label: layouts[o.key].name })) };
  }
  const summary = String(out.summary || '').slice(0, 300);
  const conf = Number(out.confidence) || 0.7;

  if (out.op === 'patch' && hasCur) {
    const mode = layouts[current.mode] ? current.mode : 'home';
    const merged = applyPatch(current.components, { add: out.patch?.add || [], remove: out.patch?.remove || [] });
    const components = buildComponents(merged, mode);
    if (components.length < 2) throw new Error('LLM patch left too few components');
    console.log(`LLM patch ok in ${ms}ms`);
    return { status: 'plan', op: 'patch', summary,
      intent: { key: mode, name: layouts[mode].name, confidence: conf, hits: [], source: 'llm', ms },
      plan: { mode, title: current.title || layouts[mode].title, desc: current.desc || layouts[mode].desc, components } };
  }
  const mode = layouts[out.intent] ? out.intent : 'home';
  const components = buildComponents(out.components || [], mode);
  if (components.length < 3) throw new Error('LLM plan too small');
  console.log(`LLM plan ok in ${ms}ms`);
  return { status: 'plan', op: 'replace', summary,
    intent: { key: mode, name: layouts[mode].name, confidence: conf, hits: [], source: 'llm', ms },
    plan: { mode, title: String(out.title || layouts[mode].title), desc: String(out.desc || ''), components } };
}
