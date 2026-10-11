import { catalog, layouts, VARIANT_IDS } from './catalog.js';
import { clientName } from './intent.js';
const span = (n) => (Number.isInteger(n) && n >= 3 && n <= 12 ? n : 6);

// Validator: unknown ids dropped, duplicates removed, spans clamped. Never trust raw AI output.
export function buildComponents(list, mode) {
  const seen = new Set();
  return list.filter(c => catalog[c.id] && !seen.has(c.id) && seen.add(c.id)).slice(0, mode === 'fixed' ? 20 : 9).map(c => ({
    id: c.id, span: span(c.span), reason: String(c.reason || 'Relevant to your goal.').slice(0, 200),
    variant: VARIANT_IDS.includes(c.id) ? mode : undefined, def: catalog[c.id]
  }));
}

// Titles with {client} always carry the right client name.
export function titleFor(mode, fallback, clientId) {
  const t = layouts[mode]?.title;
  return t && t.includes('{client}') ? t.replace('{client}', clientName(clientId)) : (fallback || t);
}

// Refinement: remove some components, add others (added ones go just before "actions").
export function applyPatch(current, patch) {
  const gone = new Set(patch.remove || []);
  const kept = current.filter(c => !gone.has(c.id));
  const have = new Set(kept.map(c => c.id));
  const adds = (patch.add || []).filter(c => catalog[c.id] && !have.has(c.id));
  const i = kept.findIndex(c => c.id === 'actions');
  return i < 0 ? [...kept, ...adds] : [...kept.slice(0, i), ...adds, ...kept.slice(i)];
}

const titles = (ids) => ids.filter(id => catalog[id]).map(id => catalog[id].title).join(', ');
export function patchPlan(current, patch, meta = {}) {
  const mode = layouts[current.mode] ? current.mode : 'home';
  const merged = applyPatch(current.components || [], patch);
  const add = (patch.add || []).map(c => c.id), rem = patch.remove || [];
  return { status: 'plan', op: 'patch', clientId: meta.clientId,
    summary: meta.summary || `Kept your current screen${add.length ? ', added ' + titles(add) : ''}${rem.length ? ', removed ' + titles(rem) : ''}.`,
    intent: { key: mode, name: layouts[mode].name, confidence: meta.confidence ?? 0.85, hits: [], source: meta.source || 'rules', fallback: !!meta.failed, ms: meta.ms },
    plan: { mode, title: titleFor(mode, current.title || layouts[mode].title, meta.clientId), desc: current.desc || layouts[mode].desc, components: buildComponents(merged, mode) } };
}

export function curated(key, meta = {}) {
  const l = layouts[key];
  const components = buildComponents(l.components, key);
  return { status: 'plan', op: 'replace', clientId: meta.clientId,
    summary: key === 'home' ? '' : `Arranged ${components.length} components for "${l.name}", most important first.`,
    intent: { key, name: l.name, confidence: meta.confidence ?? 0.8, hits: meta.hits || [], source: meta.source || 'rules', fallback: !!meta.failed },
    plan: { mode: key, title: titleFor(key, null, meta.clientId), desc: l.desc, components } };
}
