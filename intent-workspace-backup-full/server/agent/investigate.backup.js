// Step 1 of the agent: decide which tools to call, run them in parallel, return the evidence + a trace.
import { loadSource } from '../data/service.js';
import { TOOLS, runTool, clientInText, toolMenu } from './tools.js';
import { chat as nvidiaChat, parseJson } from './nvidia.js';

const worst = src => [...src.clients].sort((a, b) => a.health - b.health)[0];

// used when the planner call fails, so the demo still investigates
function ruleCalls(text, hint, src) {
  const t = text.toLowerCase(), c = (hint || worst(src)).id, calls = [];
  if (/overdue|late|task|blocked|deadline|project/.test(t)) calls.push({ tool: 'get_overdue_work', args: {} });
  if (/usage|drop|active users|decline|engagement|activity/.test(t)) calls.push({ tool: 'analyze_usage', args: { client: c } });
  if (/risk|churn|renew|health|attention|worried/.test(t)) calls.push({ tool: 'find_at_risk_clients', args: {} });
  if (/meeting|prepare|prep|call|client|account/.test(t) && !calls.length) calls.push({ tool: 'get_client_snapshot', args: { client: c } });
  return calls.length ? calls : [{ tool: 'find_at_risk_clients', args: {} }, { tool: 'get_overdue_work', args: {} }];
}

async function pickCalls(text, current, src, hint, chat) {
  const ids = src.clients.map(c => c.id).join(', ');
  const system = `You are the investigation step of an adaptive business workspace agent. Decide which data tools to call, so the screen can be built from real evidence instead of guesses.
Tools:
${toolMenu()}
Reply with ONE JSON object only: {"calls":[{"tool":"name","args":{}}]} with 0 to 4 calls.
- Client ids: ${ids}. If the user names a client, use its id.${hint ? ` The user mentioned: ${hint.id}.` : ''}
- Prefer the calls that reveal what matters most (risk, anomalies, overdue work).
- Use an empty list only for a small refinement of the current screen (also show X, remove Y).
${current && current.mode !== 'home' ? `Current screen: task "${current.mode}".` : 'No current task.'}`;
  const out = parseJson(await chat([{ role: 'system', content: system }, { role: 'user', content: text }], { max_tokens: 220, timeout: 8000, temperature: 0.1 }));
  if (!Array.isArray(out.calls)) throw new Error('planner returned no calls array');
  const seen = new Set();
  return out.calls.filter(c => TOOLS[c.tool]).filter(c => { const k = c.tool + JSON.stringify(c.args || {}); return seen.has(k) ? false : seen.add(k); }).slice(0, 4);
}

// opts.src / opts.chat exist so this can be tested without a database or an LLM
export async function investigate(text, current, opts = {}) {
  const src = opts.src || await loadSource(), chat = opts.chat || nvidiaChat, now = new Date();
  const hint = clientInText(src.clients, text);
  let calls, planner = 'llm';
  try { calls = await pickCalls(text, current, src, hint, chat); }
  catch (e) { console.warn('tool planner failed, using rules:', e.message); calls = ruleCalls(text, hint, src); planner = 'rules'; }
  const trace = await Promise.all(calls.map(c => runTool(src, c, now)));
  return { trace, planner };
}
