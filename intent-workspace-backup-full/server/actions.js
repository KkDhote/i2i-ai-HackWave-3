import { loadData } from './store.js';
import { clientName } from './intent.js';

// Every fact an action may use, each with an id the AI must cite. Nothing outside this list may appear in a draft.
function evidenceOf(d) {
  const lines = [];
  const add = (label, rows, f) => (rows || []).slice(0, 4).forEach(r => lines.push(`${label}: ${f(r)}`));
  add('Client', d.client, r => r.text);
  add('Open issue', d.issues, r => `${r.tag}: ${r.text}`);
  add('Recent message', d.comms, r => `${r.tag}: ${r.text}`);
  add('Last meeting', d.meeting, r => r.text);
  add('Likely cause', d.causes, r => `${r.text} (${r.tag})`);
  add('Overdue task', d.tasks, r => `${r.task} (${r.owner}, ${r.days} days late)`);
  add('Blocker', d.blockers, r => `${r.text} (${r.tag})`);
  return lines.map((text, i) => ({ id: 'E' + (i + 1), text }));
}

function template(action, mode, name, d, ev) {
  const order = mode === 'usage' ? ['Likely cause', 'Open issue'] : mode === 'overdue' ? ['Overdue task', 'Blocker'] : ['Open issue', 'Last meeting', 'Recent message'];
  const used = order.flatMap(p => ev.filter(e => e.text.startsWith(p)).slice(0, 2)).slice(0, 5);
  const to = mode === 'overdue' ? 'Project owners' : mode === 'usage' ? 'Support and engineering leads' : (d.client?.[1]?.text || name);
  return { to, subject: `${action}: ${name}`, source: 'template', evidence: used.map(e => e.text),
    body: `Hi,\n\nAhead of our conversation about ${name}, these are the points I want to cover:\n${used.map(e => '- ' + e.text.replace(/^[^:]+: /, '')).join('\n')}\n\nPlease tell me if I should add anything.\n\nThanks` };
}

async function viaLLM(action, mode, name, ev) {
  const system = `You draft a short, professional message for the action the user clicked in a business workspace.
Use ONLY facts from the evidence lines. Plain text, no markdown, under 140 words, written as the account owner.
Reply with ONE JSON object only: {"to":"who it is for (names or roles)","subject":"string","body":"string","used":["E1","E3"]}
"used" lists the evidence ids you relied on.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(12000),
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.LLM_MODEL || 'claude-haiku-5-5', max_tokens: 700, system,
      messages: [{ role: 'user', content: JSON.stringify({ action, goal: mode, client: name, evidence: ev }) }] })
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const out = JSON.parse((await res.json()).content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim());
  const used = (out.used || []).map(id => ev.find(e => e.id === id)?.text).filter(Boolean);
  if (!out.body || !out.subject) throw new Error('draft incomplete');
  return { to: String(out.to || name), subject: String(out.subject), body: String(out.body), evidence: used, source: 'llm' };
}

export async function draftAction({ action, mode, clientId }) {
  const d = await loadData(clientId), name = clientName(d.clientId), ev = evidenceOf(d);
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await viaLLM(action, mode, name, ev); }
    catch (e) { console.warn('Draft via AI failed, using template:', e.message); }
  }
  return template(action, mode, name, d, ev);
}
