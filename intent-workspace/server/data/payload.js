// Turns raw collections into the exact JSON shape the frontend already reads from /api/data.
// Pure function (no database), so it is easy to test.
import { isTaskOpen } from '../taskStatus.js';
const DAY = 86400000, HOUR = 3600000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sod = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const time = d => new Date(d).getTime();
const pct = (c, b) => (b ? Math.round((c / b - 1) * 100) : 0);
const signed = v => (v > 0 ? '+' : '') + v + '%';
const healthTone = h => (h >= 75 ? 'ok' : h >= 55 ? 'warn' : 'bad');
const sevTone = s => (s === 'High' ? 'bad' : s === 'Medium' ? 'warn' : 'n');
const sevRank = s => (s === 'High' ? 0 : s === 'Medium' ? 1 : 2);

export function relTag(date, now) {
  const d = Math.round((sod(now) - sod(new Date(date))) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  const w = WD[new Date(date).getUTCDay()];
  return d < 7 ? w : 'Last ' + w;
}

function detectDrop(users) {
  let best = { i: Math.floor(users.length / 2), r: 0 };
  for (let i = 3; i < users.length; i++) {
    const prev = mean(users.slice(i - 3, i)), r = (prev - users[i]) / prev;
    if (r > best.r) best = { i, r };
  }
  return best;
}

function talkFor(client, issues, lastNotes, now) {
  if (client.talk && client.talk.length) return client.talk.map(text => ({ text }));
  const out = [];
  if (issues[0]) out.push('Acknowledge the open issue: ' + issues[0].text);
  (lastNotes || []).filter(n => /^open:/i.test(n)).forEach(n => out.push('Close the loop: ' + n.replace(/^open:\s*/i, '')));
  const days = Math.round((time(client.renewal) - now.getTime()) / DAY);
  if (days <= 60) out.push(`Renewal is ${days} days away: agree on next steps`);
  out.push('Ask what success looks like next quarter');
  return out.map(text => ({ text }));
}

export function buildPayload(src, clientId, now = new Date()) {
  const { clients, tickets, comms, meetings, usage, tasks, releases, feed, insights, sources } = src;
  const client = clients.find(c => c.id === clientId) || clients.find(c => c.id === 'kestrel') || clients[0];
  const cid = client.id;

  // ---- usage (selected client) ----
  const rows = usage.filter(u => u.clientId === cid).sort((a, b) => a.day - b.day);
  const users = rows.map(r => r.users);
  const drop = detectDrop(users);
  const significant = drop.r > 0.12;
  const from = significant ? drop.i : Math.max(3, users.length - 7);
  const to = significant ? Math.min(rows.length, drop.i + 4) : rows.length;
  const baseRows = rows.slice(0, significant ? drop.i : Math.max(3, users.length - 7));
  const nowRows = rows.slice(from, to);
  const uBase = mean(baseRows.map(r => r.users)), uNow = mean(nowRows.map(r => r.users));
  const sBase = mean(baseRows.map(r => r.spu)), sNow = mean(nowRows.map(r => r.spu));
  const eBase = mean(baseRows.map(r => r.exportOk)), eNow = mean(nowRows.map(r => r.exportOk));
  const uD = pct(uNow, uBase), sD = pct(sNow, sBase), eD = Math.round(eNow - eBase);

  const mine = tickets.filter(t => t.clientId === cid);
  const tNow = mine.filter(t => time(t.openedAt) > now.getTime() - 7 * DAY).length;
  const tPrev = mine.filter(t => time(t.openedAt) <= now.getTime() - 7 * DAY && time(t.openedAt) > now.getTime() - 14 * DAY).length;
  const tD = pct(tNow, tPrev);

  // ---- tasks ----
  const open = tasks.filter(isTaskOpen);
  const overdue = open.filter(t => time(t.dueAt) < now.getTime()).map(t => ({ ...t, days: Math.max(1, Math.round((now.getTime() - time(t.dueAt)) / DAY)) })).sort((a, b) => b.days - a.days);
  const dueWeek = open.filter(t => time(t.dueAt) >= now.getTime() && time(t.dueAt) <= now.getTime() + 7 * DAY);
  const owners = [...new Set(tasks.map(t => t.owner))];
  const near = open.filter(t => time(t.dueAt) <= now.getTime() + 7 * DAY);
  const loadCounts = owners.map(o => ({ o, n: near.filter(t => t.owner === o).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  const loadMax = Math.max(8, ...loadCounts.map(x => x.n));
  const blocked = open.filter(t => t.blocker);

  // ---- home numbers ----
  const sumLast = (from7, to7) => clients.reduce((s, c) => {
    const r = usage.filter(u => u.clientId === c.id).sort((a, b) => a.day - b.day).map(u => u.users);
    return s + mean(r.slice(r.length - from7, r.length - to7 || undefined));
  }, 0);
  const homeNow = sumLast(7, 0), homePrev = sumLast(14, 7);
  const homeD = pct(homeNow, homePrev);
  const atRisk = clients.filter(c => c.health < 65).length;

  // ---- client view ----
  const issues = mine.filter(t => t.status === 'open')
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || time(b.openedAt) - time(a.openedAt)).slice(0, 3)
    .map(t => ({ tag: t.severity, tone: sevTone(t.severity), text: t.title }));
  const lastMeeting = meetings.filter(m => m.clientId === cid).sort((a, b) => time(b.at) - time(a.at))[0];
  const renewal = new Date(client.renewal);
  const pick = kind => {
    const own = insights.filter(i => i.clientId === cid && i.kind === kind);
    return (own.length ? own : insights.filter(i => i.clientId === null && i.kind === kind)).sort((a, b) => a.order - b.order);
  };

  const freshness = {};
  sources.forEach(s => { freshness[s.source] = Math.round(((now.getTime() - time(s.updatedAt)) / HOUR) * 10) / 10; });

  return {
    usage: users,
    usageMeta: { dropFrom: drop.i, significant },
    freshness,
    kpis: {
      home: [
        { label: 'Active users', value: Math.round(homeNow).toLocaleString('en-US'), delta: signed(homeD), tone: homeD >= 0 ? 'up' : 'dn' },
        { label: 'Open tasks', value: String(open.length) },
        { label: 'At-risk accounts', value: String(atRisk), delta: `of ${clients.length}`, tone: atRisk ? 'dn' : 'up' },
        { label: 'Clients', value: String(clients.length), delta: 'recorded accounts' }
      ],
      usage: [
        { label: 'Active users', value: String(Math.round(uNow)), delta: signed(uD), tone: uD < 0 ? 'dn' : 'up' },
        { label: 'Sessions per user', value: (Math.round(sNow * 10) / 10).toFixed(1), delta: signed(sD), tone: sD < 0 ? 'dn' : 'up' },
        { label: 'Export success', value: Math.round(eNow) + '%', delta: (eD > 0 ? '+' : '') + eD + '%', tone: eD < 0 ? 'dn' : 'up' },
        { label: 'Support tickets', value: tPrev ? signed(tD) : `${tNow} new`, delta: 'this week', tone: tNow > tPrev ? 'dn' : 'up' }
      ],
      overdue: [
        { label: 'Overdue', value: String(overdue.length), delta: 'tasks', tone: overdue.length ? 'dn' : 'up' },
        { label: 'Avg days late', value: overdue.length ? (Math.round(mean(overdue.map(t => t.days)) * 10) / 10).toFixed(1) : '0', delta: 'days', tone: overdue.length ? 'dn' : 'up' },
        { label: 'Due this week', value: String(dueWeek.length) },
        { label: 'On track', value: Math.round((open.filter(t => !t.blocker && time(t.dueAt) >= now.getTime()).length / Math.max(1, open.length)) * 100) + '%', delta: 'of open tasks', tone: 'up' }
      ]
    },
    actions: {
      home: ['Draft a task brief', 'Draft a teammate invitation'],
      meeting: ['Draft meeting agenda', 'Draft last-meeting recap', 'Draft issue follow-up'],
      usage: ['Draft usage investigation note', 'Draft support follow-up'],
      overdue: ['Draft owner follow-up', 'Draft deadline review', 'Draft blocker follow-up']
    },
    causes: pick('cause').map(i => ({ tag: i.tag, tone: i.tone, text: i.text })),
    releases: releases.sort((a, b) => time(a.at) - time(b.at)).map(r => ({ tag: 'Day ' + (29 - Math.round((now.getTime() - time(r.at)) / DAY)), tone: 'n', text: r.text })),
    segs: pick('seg').map(i => ({ label: i.label, value: i.value, max: 50, display: '-' + i.value + '%', tone: i.value >= 20 ? 'bad' : i.value >= 8 ? 'warn' : 'n' })),
    tasks: overdue.slice(0, 5).map(t => ({ task: t.title, owner: t.owner, days: t.days, priority: t.priority, priorityTone: sevTone(t.priority) })),
    load: loadCounts.map(x => ({ label: x.o, value: x.n, max: loadMax, display: String(x.n) })),
    blockers: blocked.map(t => ({ tag: t.owner, tone: 'warn', text: t.blocker })),
    accts: [...clients].sort((a, b) => a.health - b.health).slice(0, 5).map(c => ({ account: c.name, plan: c.plan, health: c.health, healthTone: healthTone(c.health) })),
    feed: [...feed].sort((a, b) => time(b.at) - time(a.at)).slice(0, 6).map(f => ({ text: f.text })),
    client: [
      { tag: `Health ${client.health}/100`, tone: healthTone(client.health), text: `${client.name}, ${client.plan}, ₹${Number(client.arr).toLocaleString('en-IN')} lakh annual revenue, renews ${renewal.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}` },
      { tag: 'Contacts', tone: 'n', text: client.contacts.map(c => `${c.name} (${c.role})`).join(', ') }
    ],
    comms: comms.filter(c => c.clientId === cid).sort((a, b) => time(b.at) - time(a.at)).slice(0, 4).map(c => ({ tag: relTag(c.at, now), tone: c.tone, text: c.text })),
    issues,
    meeting: (lastMeeting ? lastMeeting.notes : []).map(text => ({ text })),
    talk: talkFor(client, issues, lastMeeting && lastMeeting.notes, now),
    clients: clients.map(c => ({ id: c.id, name: c.name, aliases: c.aliases })),
    clientId: cid
  };
}

export { detectDrop, mean };
