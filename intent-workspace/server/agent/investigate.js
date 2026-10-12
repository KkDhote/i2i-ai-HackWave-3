// Step 1 of the agent: decide which tools to call, run them in parallel, return the evidence + a trace.
import { loadSource } from '../data/service.js';
import { TOOLS, runTool, clientInText, toolMenu } from './tools.js';
import { chat as nvidiaChat, parseJson } from './nvidia.js';

// used when the planner call fails, so the demo still investigates
function ruleCalls(text, hint, src) {
  const t = text.toLowerCase(), c = hint?.id, calls = [];
  if (/overdue|late|task|blocked|deadline|project/.test(t)) calls.push({ tool: 'get_overdue_work', args: {} });
  if (c && /usage|drop|active users|decline|engagement|activity/.test(t)) calls.push({ tool: 'analyze_usage', args: { client: c } });
  if (/risk|churn|renew|health|attention|worried/.test(t)) calls.push({ tool: 'find_at_risk_clients', args: {} });
  if (c && /meeting|prepare|prep|call|client|account|issue|message|follow/.test(t) && !calls.length) calls.push({ tool: 'get_client_snapshot', args: { client: c } });
  return calls.length ? calls : [{ tool: 'find_at_risk_clients', args: {} }, { tool: 'get_overdue_work', args: {} }];
}

async function pickCalls(text, current, src, hint, chat) {
  const ids = src.clients.map(c => c.id).join(', ');
  const system = `You are the investigation step of an adaptive business workspace agent. Decide which data tools to call, so the screen can be built from real evidence instead of guesses.
Tools:
${toolMenu()}
Reply with ONE JSON object only: {"calls":[{"tool":"name","args":{}}]} with 0 to 4 calls.
- Client ids: ${ids}.${hint ? ` Selected client: ${hint.id}. All single-client checks must use this id, including when the request does not name a client.` : 'No client is selected. Do not guess a client.'}
- Prefer the calls that reveal what matters most (risk, anomalies, overdue work).
- Use an empty list only for a small refinement of the current screen (also show X, remove Y).
${current && current.mode !== 'home' ? `Current screen: task "${current.mode}".` : 'No current task.'}`;
  const out = parseJson(
  await chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: text }
    ],
    {
      max_tokens: 1500,
      timeout: 60000,
      temperature: 0.1
    }
  )
);

  if (!Array.isArray(out.calls) || out.calls.length > 4 || out.calls.some(c => !c || !Object.hasOwn(TOOLS,c.tool) || (c.args !== undefined && (!c.args || typeof c.args !== 'object' || Array.isArray(c.args))))) throw new Error('Invalid data-tool selection.');
  const seen = new Set();
  return out.calls.filter(c => { const k = c.tool + JSON.stringify(c.args || {}); return seen.has(k) ? false : seen.add(k); });
}

export function scopeCalls(calls, clientId, clients, text) {
  const valid = new Set(clients.map(c => c.id));
  const comparing = /\b(compare|versus|vs)\b|तुलना/i.test(text);
  const named = clients.filter(c => [c.name,c.id,...(c.aliases || [])].filter(Boolean).some(alias => new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b','i').test(text))).map(c => c.id);
  return calls.map(call => {
    const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? { ...call.args } : {};
    if (['get_client_snapshot', 'analyze_usage', 'search_tickets'].includes(call.tool)) {
      if (!clientId) throw Error('Choose a client before checking client records.');
      if (args.client && args.client !== clientId) throw Error('The check targeted another client.');
      args.client = clientId;
    }
    if (call.tool === 'compare_clients' && (!comparing || !valid.has(args.a) || !valid.has(args.b))) throw Error('Choose valid clients for an explicit comparison.');
    if (call.tool === 'compare_clients' && (named.length !== 2 || !named.includes(args.a) || !named.includes(args.b) || args.a === args.b)) throw Error('Name the two clients you want to compare.');
    return { tool: call.tool, args };
  });
}

// opts.src / opts.chat exist so this can be tested without a database or an LLM
export async function investigate(text, current, opts = {}) {
  const src = opts.src || await loadSource(), chat = opts.chat || nvidiaChat, now = new Date();
  const hint = opts.clientId ? src.clients.find(c => c.id === opts.clientId) : clientInText(src.clients, text);
  if (opts.clientId && !hint) throw Error('Unknown selected client.');
  let calls, planner = 'llm';
  try { calls = scopeCalls(await pickCalls(text, current, src, hint, chat), hint?.id, src.clients, text); }
  catch (e) { console.warn('tool planner failed, using rules:', e.message); calls = ruleCalls(text, hint, src); planner = 'rules'; }
  const trace = await Promise.all(calls.map(c => runTool(src, c, now)));
  return { trace, planner };
}
