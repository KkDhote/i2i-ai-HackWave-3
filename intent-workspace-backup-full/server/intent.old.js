import { layouts, TASKS } from './catalog.js';
import seed from './seed/data.js';
export function detect(text) {
  const t = text.toLowerCase();
  return Object.entries(layouts).filter(([, l]) => l.keywords).map(([key, l]) => {
    const hits = l.keywords.filter(w => t.includes(w));
    return { key, score: hits.length, hits };
  }).sort((a, b) => b.score - a.score);
}
export function decide(text) {
  const [a, b] = detect(text);
  if (a.score === 0) return { type: 'clarify', message: "I'm not sure what you're trying to do. Which fits best?", keys: TASKS };
  if (b.score > 0 && a.score - b.score < 1) return { type: 'clarify', message: 'That could mean two things. Which one?', keys: [a.key, b.key] };
  return { type: 'intent', key: a.key, hits: a.hits, confidence: Math.min(0.98, 0.55 + a.score * 0.14) };
}

// ---- Rule-based refinement ("also show X", "remove Y"), used when the AI is off or fails ----
const ALIASES = {
  kpis: ['key number', 'kpi', 'metric'], usage: ['usage', 'trend', 'chart', 'graph'], client: ['client overview', 'client info'],
  comms: ['communication', 'message', 'comms'], issues: ['issue', 'bug', 'ticket'], meeting: ['last meeting', 'previous meeting'],
  talk: ['talking point'], actions: ['action', 'next step'], segs: ['segment', 'breakdown'], causes: ['cause', 'hypothes'],
  releases: ['release', 'deploy'], overdue: ['overdue', 'late task', 'late work'], load: ['workload', 'by owner'],
  blockers: ['blocker', 'blocked'], accts: ['account'], feed: ['activity', 'feed']
};
const ADD = /\b(also|add|include|too|as well|plus)\b/, DEL = /\b(remove|hide|drop|without|delete)\b/;
export function patchByRules(text, current) {
  const t = text.toLowerCase(), del = DEL.test(t), add = ADD.test(t);
  if (!current?.length || (!del && !add)) return null;
  const ids = Object.entries(ALIASES).filter(([, w]) => w.some(x => t.includes(x))).map(([id]) => id);
  const have = new Set(current.map(c => c.id));
  const patch = del
    ? { add: [], remove: ids.filter(id => have.has(id)) }
    : { add: ids.filter(id => !have.has(id)).map(id => ({ id, span: 6, reason: 'You asked for this to be added.' })), remove: [] };
  return patch.add.length || patch.remove.length ? patch : null;
}

// ---- Which client does the user mean? ("Bluepeak meeting", "Kestrel usage") ----
export function detectClient(text) {
  const t = text.toLowerCase();
  return seed.clients.find(c => c.aliases.some(a => t.includes(a)))?.id || null;
}
export const clientName = (id) => seed.clients.find(c => c.id === id)?.name || seed.clients[0].name;
