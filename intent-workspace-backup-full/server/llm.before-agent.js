import { catalog, layouts, TASKS } from './catalog.js';
import { buildComponents, applyPatch } from './plan.js';
import { investigate } from './agent/investigate.js';
import { chat, parseJson } from './agent/nvidia.js';

// AGENT VERSION. Same exports as before (planWithLLM), so server.js does not change.
// 1) the agent investigates the database with tools   2) it composes the screen ONLY from the catalog, citing that evidence.
// Any problem -> throw -> server falls back to rules (or we continue without evidence if only the investigation failed).
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

  let inv = { trace: [], planner: 'none' };
  try { inv = await investigate(text, current); } catch (e) { console.warn('investigation skipped:', e.message); }
  const good = inv.trace.filter(t => t.ok);
  const evidence = good.length ? JSON.stringify(good.map(t => ({ tool: t.tool, args: t.args, result: t.data }))).slice(0, 7000) : null;

  const ids = Object.entries(catalog).map(([id, c]) => `${id}: ${c.title}`).join('\n');
  const cur = hasCur ? `Current screen (task "${current.mode}"): ${current.components.map(c => c.id).join(', ')}` : 'No current task: the default dashboard is showing.';
  const system = `You plan the screen of an adaptive business workspace. The UI is built only from a fixed catalog of components; you never write code.
Reply with ONE JSON object only (no prose, no code fences):
{"op":"replace|patch|unsupported","intent":"meeting|usage|overdue|other","confidence":0.0-1.0,"title":"string","desc":"string",
 "summary":"1-2 sentences: what you found in the data and how you arranged the screen because of it",
 "findings":["up to 4 short key findings, each with a real number or name from the evidence"],
 "clarify":null or {"message":"string","options":[{"key":"meeting|usage|overdue","label":"string"}]},
 "components":[{"id":"string","span":3-12,"reason":"one short sentence"}],
 "patch":{"add":[{"id":"string","span":3-12,"reason":"string"}],"remove":["id"]}}
Catalog ids:
${ids}
${cur}
${evidence ? `Evidence gathered from the database by tools (real data, never invent numbers):\n${evidence}\n` : ''}Rules:
- New goal: op "replace" with 4-7 components, most important first, spans in a row add up to 12, no patch.
- Refinement of the current screen (also show X, remove Y, focus on Z): op "patch", empty components. Only when a current task exists.
- Let the evidence decide: lead with the most urgent finding, and skip components the evidence shows are not needed. The same goal can need a different screen for a different client.
- Every "reason" must cite concrete evidence (a number, a name, a date) when evidence exists.
- If the goal is too vague, set "clarify" and leave components and patch empty.
- If the request is unrelated to this workspace (clients, usage, projects, tasks, accounts) and cannot be answered by combining catalog components, set op "unsupported" and put one friendly sentence in "summary". If it CAN be answered by combining components, do that instead.`;

  const raw = await chat([{ role: 'system', content: system }, { role: 'user', content: text }], { max_tokens: 1100, timeout: 20000, temperature: 0.2 });
  const out = parseJson(raw);
  const ms = Date.now() - t0;

  if (out.op === 'unsupported') return { status: 'unsupported', message: String(out.summary || 'That is outside what this workspace can do.').slice(0, 300), options: TASKS.map(k => ({ key: k, label: layouts[k].name })) };
  if (out.clarify?.options?.length) {
    const options = out.clarify.options.filter(o => layouts[o.key]);
    if (options.length) return { status: 'clarify', message: String(out.clarify.message), options: options.map(o => ({ key: o.key, label: layouts[o.key].name })) };
  }
  const checked = good.length ? ` Checked: ${[...new Set(good.map(t => t.tool))].join(', ')}.` : '';
  const summary = (String(out.summary || '').slice(0, 300) + checked).trim();
  const conf = Number(out.confidence) || 0.7;
  // shown by the UI when it supports it: what the agent looked at, in order, with the evidence line of each call
  const agent = { planner: inv.planner, findings: (Array.isArray(out.findings) ? out.findings : []).slice(0, 4).map(String),
    calls: inv.trace.map(t => ({ tool: t.tool, args: t.args, ok: t.ok, summary: t.summary, ms: t.ms })) };

  if (out.op === 'patch' && hasCur) {
    const mode = layouts[current.mode] ? current.mode : 'home';
    const merged = applyPatch(current.components, { add: out.patch?.add || [], remove: out.patch?.remove || [] });
    const components = buildComponents(merged, mode);
    if (components.length < 2) throw new Error('LLM patch left too few components');
    console.log(`Agent patch ok in ${ms}ms (${good.length} tool calls)`);
    return { status: 'plan', op: 'patch', summary, agent,
      intent: { key: mode, name: layouts[mode].name, confidence: conf, hits: [], source: 'llm', ms },
      plan: { mode, title: current.title || layouts[mode].title, desc: current.desc || layouts[mode].desc, components } };
  }
  const mode = layouts[out.intent] ? out.intent : 'home';
  const components = buildComponents(out.components || [], mode);
  if (components.length < 3) throw new Error('LLM plan too small');
  console.log(`Agent plan ok in ${ms}ms (${good.length} tool calls)`);
  return { status: 'plan', op: 'replace', summary, agent,
    intent: { key: mode, name: layouts[mode].name, confidence: conf, hits: [], source: 'llm', ms },
    plan: { mode, title: String(out.title || layouts[mode].title), desc: String(out.desc || ''), components } };
}
