// The agent's "senses": small read-only tools over the workspace data. Each returns { summary, data }.
// `summary` is one evidence sentence (shown in the investigation trace); `data` is what the layout step reads.
import { detectDrop, mean } from '../data/payload.js';
import { isTaskOpen } from '../taskStatus.js';

const DAY = 86400000;
const ms = d => new Date(d).getTime();
const daysAgo = (d, now) => Math.max(0, Math.round((now.getTime() - ms(d)) / DAY));
const daysUntil = (d, now) => Math.round((ms(d) - now.getTime()) / DAY);
const sevRank = s => (s === 'High' ? 0 : s === 'Medium' ? 1 : 2);
const sgn = v => (v > 0 ? '+' : '') + v + '%';
const pct = (c, b) => (b ? Math.round((c / b - 1) * 100) : 0);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function findClient(clients, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  return clients.find(c => c.id === s) || clients.find(c => c.name.toLowerCase() === s)
    || clients.find(c => (c.aliases || []).some(a => s.includes(a))) || clients.find(c => s.includes(c.id)) || null;
}
export const clientInText = (clients, text) => clients.find(c => (c.aliases || []).some(a => String(text).toLowerCase().includes(a))) || null;
const need = (src, q) => { const c = findClient(src.clients, q); if (!c) throw new Error(`unknown client "${q}". Valid ids: ${src.clients.map(x => x.id).join(', ')}`); return c; };

function usageStats(src, id) {
  const rows = src.usage.filter(u => u.clientId === id).sort((a, b) => a.day - b.day);
  const users = rows.map(r => r.users), drop = detectDrop(users), significant = drop.r > 0.12;
  const cut = significant ? drop.i : Math.max(3, users.length - 7);
  const base = rows.slice(0, cut), cur = significant ? rows.slice(drop.i, drop.i + 4) : rows.slice(cut);
  return {
    significant, dropDay: drop.i, users: Math.round(mean(cur.map(r => r.users))), baseUsers: Math.round(mean(base.map(r => r.users))),
    changePct: pct(mean(cur.map(r => r.users)), mean(base.map(r => r.users))),
    exportNow: Math.round(mean(cur.map(r => r.exportOk))), exportBase: Math.round(mean(base.map(r => r.exportOk))),
    sessionsChangePct: pct(mean(cur.map(r => r.spu)), mean(base.map(r => r.spu)))
  };
}
function ticketTrend(src, id, now) {
  const t = src.tickets.filter(x => x.clientId === id);
  const thisWeek = t.filter(x => ms(x.openedAt) > now.getTime() - 7 * DAY).length;
  const prevWeek = t.filter(x => ms(x.openedAt) <= now.getTime() - 7 * DAY && ms(x.openedAt) > now.getTime() - 14 * DAY).length;
  return { thisWeek, prevWeek, changePct: prevWeek ? pct(thisWeek, prevWeek) : null };
}
const openTickets = (src, id, now) => src.tickets.filter(x => x.clientId === id && x.status === 'open')
  .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || ms(b.openedAt) - ms(a.openedAt))
  .map(x => ({ severity: x.severity, title: x.title, openDays: daysAgo(x.openedAt, now) }));

// transparent risk score: every point has a stated reason
export function riskOf(src, c, now) {
  let score = 0; const reasons = [];
  if (c.health < 55) { score += 3; reasons.push(`health ${c.health}/100`); } else if (c.health < 65) { score += 2; reasons.push(`health ${c.health}/100`); }
  const u = usageStats(src, c.id);
  if (u.significant) { score += 3; reasons.push(`active users ${sgn(u.changePct)} since day ${u.dropDay}`); }
  const renew = daysUntil(c.renewal, now);
  if (renew <= 60) { score += 2; reasons.push(`renews in ${renew} days`); }
  const high = openTickets(src, c.id, now).filter(t => t.severity === 'High');
  if (high.length) { score += Math.min(2, high.length); reasons.push(`${high.length} high-priority issue${high.length > 1 ? 's' : ''} open`); }
  const bad = src.comms.filter(m => m.clientId === c.id && m.tone === 'bad' && daysAgo(m.at, now) <= 7).length;
  if (bad) { score += 1; reasons.push('escalation this week'); }
  return { id: c.id, name: c.name, score, reasons, health: c.health, arrLakhINR: c.arr, renewsInDays: renew };
}

export const TOOLS = {
  list_clients: {
    desc: 'All clients with plan, ARR, health score and days to renewal. No args.', args: '{}',
    run: (src, a, now) => {
      const data = src.clients.map(c => ({ id: c.id, name: c.name, plan: c.plan, arrLakhINR: c.arr, health: c.health, renewsInDays: daysUntil(c.renewal, now) }));
      return { summary: `${data.length} clients, ${data.filter(c => c.health < 65).length} with health below 65`, data };
    }
  },
  get_client_snapshot: {
    desc: 'Everything needed to prepare for a client: health, renewal, open issues, recent communication, last meeting, usage trend.', args: '{"client":"id"}',
    run: (src, a, now) => {
      const c = need(src, a.client), tix = openTickets(src, c.id, now), u = usageStats(src, c.id);
      const comms = src.comms.filter(m => m.clientId === c.id).sort((x, y) => ms(y.at) - ms(x.at)).slice(0, 3).map(m => ({ daysAgo: daysAgo(m.at, now), who: m.who, text: m.text, tone: m.tone }));
      const mt = src.meetings.filter(m => m.clientId === c.id).sort((x, y) => ms(y.at) - ms(x.at))[0];
      const high = tix.filter(t => t.severity === 'High').length;
      return {
        summary: `${c.name}: health ${c.health}/100, ${high} high-priority issue${high === 1 ? '' : 's'}, renews in ${daysUntil(c.renewal, now)} days, active users ${sgn(u.changePct)}`,
        data: { client: { id: c.id, name: c.name, plan: c.plan, arrLakhINR: c.arr, health: c.health, renewsInDays: daysUntil(c.renewal, now), contacts: c.contacts }, openTickets: tix, recentComms: comms,
          lastMeeting: mt ? { daysAgo: daysAgo(mt.at, now), notes: mt.notes } : null, usage: { changePct: u.changePct, significantDrop: u.significant } }
      };
    }
  },
  analyze_usage: {
    desc: 'Usage investigation for one client: size of the drop, when it starts, export success, sessions, ticket trend, likely causes, affected segments, nearby releases.', args: '{"client":"id"}',
    run: (src, a, now) => {
      const c = need(src, a.client), u = usageStats(src, c.id), tt = ticketTrend(src, c.id, now);
      const pick = kind => { const own = src.insights.filter(i => i.clientId === c.id && i.kind === kind); return (own.length ? own : src.insights.filter(i => i.clientId === null && i.kind === kind)).sort((x, y) => x.order - y.order); };
      const rel = src.releases.map(r => ({ day: 29 - daysAgo(r.at, now), text: r.text })).filter(r => u.significant && Math.abs(r.day - u.dropDay) <= 6);
      return {
        summary: `${c.name}: active users ${u.baseUsers} to ${u.users} (${sgn(u.changePct)})${u.significant ? `, drop starts day ${u.dropDay}` : ', no significant drop'}; export success ${u.exportBase}% to ${u.exportNow}%; tickets ${tt.changePct == null ? tt.thisWeek + ' new' : sgn(tt.changePct)} week over week`,
        data: { client: c.name, ...u, tickets: tt, causes: pick('cause').map(i => ({ likelihood: i.tag, text: i.text })), segments: pick('seg').map(i => ({ segment: i.label, dropPct: i.value })), releasesNearDrop: rel }
      };
    }
  },
  find_at_risk_clients: {
    desc: 'Ranks all clients by churn risk with the reasons behind every point. No args.', args: '{}',
    run: (src, a, now) => {
      const data = src.clients.map(c => riskOf(src, c, now)).filter(r => r.score > 0).sort((x, y) => y.score - x.score).slice(0, 5);
      return { summary: data.length ? 'Highest risk: ' + data.slice(0, 3).map(r => `${r.name} (${r.score})`).join(', ') : 'No client shows risk signals', data };
    }
  },
  get_overdue_work: {
    desc: 'Overdue project tasks, blockers, and near-term workload per owner. No args.', args: '{}',
    run: (src, a, now) => {
      const open = src.tasks.filter(isTaskOpen);
      const over = open.filter(t => ms(t.dueAt) < now.getTime()).map(t => ({ task: t.title, owner: t.owner, daysLate: Math.max(1, daysAgo(t.dueAt, now)), priority: t.priority, blocker: t.blocker })).sort((x, y) => y.daysLate - x.daysLate);
      const near = open.filter(t => ms(t.dueAt) <= now.getTime() + 7 * DAY);
      const owners = [...new Set(src.tasks.map(t => t.owner))].map(o => ({ owner: o, tasks: near.filter(t => t.owner === o).length })).filter(x => x.tasks).sort((x, y) => y.tasks - x.tasks);
      return {
        summary: `${over.length} overdue task${over.length === 1 ? '' : 's'}${over.length ? `, average ${Math.round(mean(over.map(t => t.daysLate)) * 10) / 10} days late` : ''}, ${over.filter(t => t.blocker).length} blocked`,
        data: { overdueCount: over.length, avgDaysLate: over.length ? Math.round(mean(over.map(t => t.daysLate)) * 10) / 10 : 0, overdue: over, dueThisWeek: near.length - over.length, loadByOwner: owners }
      };
    }
  },
  compare_clients: {
    desc: 'Side-by-side comparison of two clients (health, ARR, renewal, usage change, open high issues, ticket trend).', args: '{"a":"id","b":"id"}',
    run: (src, a, now) => {
      const row = c => ({ name: c.name, health: c.health, arrLakhINR: c.arr, renewsInDays: daysUntil(c.renewal, now), usageChangePct: usageStats(src, c.id, now).changePct, openHighIssues: openTickets(src, c.id, now).filter(t => t.severity === 'High').length, ticketsThisWeek: ticketTrend(src, c.id, now).thisWeek });
      const A = row(need(src, a.a)), B = row(need(src, a.b));
      return { summary: `${A.name} vs ${B.name}: health ${A.health} vs ${B.health}, usage ${sgn(A.usageChangePct)} vs ${sgn(B.usageChangePct)}`, data: { a: A, b: B } };
    }
  },
  search_tickets: {
    desc: 'Find open support issues. Optional filters: client id, severity (High|Medium|Low), text.', args: '{"client":"id?","severity":"High?","text":"words?"}',
    run: (src, a, now) => {
      const c = a.client ? need(src, a.client) : null, q = String(a.text || '').toLowerCase();
      const data = src.tickets.filter(t => t.status === 'open' && (!c || t.clientId === c.id) && (!a.severity || t.severity === a.severity) && (!q || t.title.toLowerCase().includes(q)))
        .sort((x, y) => sevRank(x.severity) - sevRank(y.severity)).slice(0, 8)
        .map(t => ({ client: src.clients.find(k => k.id === t.clientId)?.name, severity: t.severity, title: t.title, openDays: daysAgo(t.openedAt, now) }));
      return { summary: `${data.length} open issue${data.length === 1 ? '' : 's'} matched`, data };
    }
  }
};

export const toolMenu = () => Object.entries(TOOLS).map(([n, t]) => `- ${n} ${t.args}: ${t.desc}`).join('\n');

export async function runTool(src, call, now = new Date()) {
  const t0 = Date.now(), tool = TOOLS[call.tool], args = call.args && typeof call.args === 'object' ? call.args : {};
  if (!tool) return { tool: call.tool, args, ok: false, summary: 'unknown tool', data: null, ms: 0 };
  try { const r = await tool.run(src, args, now); return { tool: call.tool, args, ok: true, summary: r.summary, data: r.data, ms: Date.now() - t0 }; }
  catch (e) { return { tool: call.tool, args, ok: false, summary: 'failed: ' + e.message, data: null, ms: Date.now() - t0 }; }
}

// Proactive briefing: no prompt needed. Deterministic and instant (no LLM), every item carries a goal the user can click.
export function buildBriefing(src, now = new Date()) {
  const items = [], short = c => cap(c.aliases[0]);
  const risks = src.clients.map(c => riskOf(src, c, now)).filter(r => r.score >= 3).sort((a, b) => b.score - a.score).slice(0, 3);
  risks.forEach(r => items.push({ kind: 'risk', tone: r.score >= 6 ? 'bad' : 'warn', title: `${r.name} needs attention`, detail: r.reasons.join(', '), goal: `Prepare the ${short(src.clients.find(c => c.id === r.id))} meeting`, score: r.score }));
  src.clients.forEach(c => { const u = usageStats(src, c.id); if (u.significant) items.push({ kind: 'usage', tone: 'bad', title: `${c.name}: active users ${sgn(u.changePct)}`, detail: `drop starts on day ${u.dropDay}, export success ${u.exportBase}% to ${u.exportNow}%`, goal: `Investigate why ${short(c)} usage dropped`, score: 5 }); });
  const w = TOOLS.get_overdue_work.run(src, {}, now).data;
  if (w.overdueCount) items.push({ kind: 'work', tone: w.overdue.some(t => t.blocker) ? 'warn' : 'n', title: `${w.overdueCount} overdue tasks`, detail: `average ${w.avgDaysLate} days late, ${w.overdue.filter(t => t.blocker).length} blocked`, goal: 'Review overdue project work', score: 3 });
  src.clients.filter(c => daysUntil(c.renewal, now) <= 45 && !risks.some(r => r.id === c.id)).forEach(c => items.push({ kind: 'renewal', tone: 'warn', title: `${c.name} renews in ${daysUntil(c.renewal, now)} days`, detail: `${c.plan}, ₹${Number(c.arr).toLocaleString('en-IN')} lakh annual revenue, health ${c.health}/100`, goal: `Prepare the ${short(c)} meeting`, score: 2 }));
  items.sort((a, b) => b.score - a.score);
  return { generatedAt: now.toISOString(), items: items.slice(0, 6) };
}
