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

export async function draftAction({ action, mode, clientId }) {
  const d = await loadData(clientId), name = clientName(d.clientId), ev = evidenceOf(d);
  return template(action, mode, name, d, ev);
}
