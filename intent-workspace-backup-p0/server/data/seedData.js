// Realistic mock business data for the workspace. Pure function: no database here.
// All dates are relative to "now", so the demo always looks current (re-run the seed before a demo).
// Names, companies and numbers are fictional.
const DAY = 86400000, HOUR = 3600000;
const ago = (now, days, hours = 0) => new Date(now.getTime() - days * DAY - hours * HOUR);
const ahead = (now, days) => new Date(now.getTime() + days * DAY);

// small deterministic random generator, so every seed run gives the same numbers
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// scenario: how the client's daily usage behaves over the last 30 days
const CLIENTS = [
  { id: 'northwind', name: 'Northwind Logistics', aliases: ['northwind'], plan: 'Enterprise', arr: 310, health: 62, renewIn: 96, base: 1400, scenario: 'dip',
    contacts: [{ name: 'Marcus Webb', role: 'VP Operations' }, { name: 'Elena Petrova', role: 'IT Director' }],
    talk: ['Confirm the Q4 capacity plan and its timeline', 'Present the fix plan for partner TMS sync delays', 'Scope the route optimizer rollout to two more depots', 'Start the renewal conversation early'] },
  { id: 'bluepeak', name: 'Bluepeak Foods', aliases: ['bluepeak', 'blue peak'], plan: 'Growth', arr: 96, health: 81, renewIn: 150, base: 620, scenario: 'flat',
    contacts: [{ name: 'Sofia Alvarez', role: 'Head of Operations' }, { name: 'Tom Becker', role: 'Finance Lead' }],
    talk: ['Send the seat-based pricing quote', 'Propose the two-warehouse expansion', 'Ask for a case study or a reference call', 'Confirm the Monday report timing fix'] },
  { id: 'kestrel', name: 'Kestrel Health', aliases: ['kestrel'], plan: 'Enterprise', arr: 240, health: 48, renewIn: 50, base: 1000, scenario: 'drop',
    contacts: [{ name: 'Dr. Anita Rao', role: 'COO' }, { name: 'Luis Ferreira', role: 'Security Lead' }],
    talk: ['Open by owning the outages and presenting the root-cause report', 'Walk through the fixes and the new monitoring', 'Hand over the SOC 2 report and the questionnaire', 'Raise service credits before they ask'] },
  { id: 'harborline', name: 'Harborline Retail Group', aliases: ['harborline', 'harbor line'], plan: 'Growth', arr: 128, health: 74, renewIn: 75, base: 880, scenario: 'flat',
    contacts: [{ name: 'Jonas Lindqvist', role: 'E-commerce Director' }, { name: 'Priya Nair', role: 'Data Manager' }] },
  { id: 'quantix', name: 'Quantix Labs', aliases: ['quantix'], plan: 'Starter', arr: 24, health: 69, renewIn: 30, base: 140, scenario: 'growth',
    contacts: [{ name: 'Ben Okafor', role: 'CTO' }] },
  { id: 'meridian', name: 'Meridian Bank', aliases: ['meridian', 'meridian bank'], plan: 'Enterprise', arr: 420, health: 88, renewIn: 200, base: 2100, scenario: 'flat',
    contacts: [{ name: 'Grace Holloway', role: 'CIO' }, { name: 'Rahul Mehta', role: 'Compliance Lead' }] },
  { id: 'solstice', name: 'Solstice Energy', aliases: ['solstice'], plan: 'Growth', arr: 87, health: 55, renewIn: 22, base: 540, scenario: 'dip',
    contacts: [{ name: 'Camila Ortiz', role: 'Operations Manager' }, { name: 'Hiro Tanaka', role: 'Plant IT Lead' }] },
  { id: 'tandem', name: 'Tandem Education', aliases: ['tandem'], plan: 'Starter', arr: 18, health: 91, renewIn: 120, base: 260, scenario: 'growth',
    contacts: [{ name: 'Maya Chen', role: 'Program Director' }] }
];

// open tickets: [severity, title, days ago opened]; comms: [days ago, who, text, tone]; meeting: [days ago, notes]
const STORY = {
  kestrel: {
    tickets: [['High', 'Two outages in 7 days on the scheduling module', 2], ['High', 'Security questionnaire overdue by 6 days', 20], ['Medium', 'Slow patient-list loading', 9], ['Medium', 'Export queue delays after release 4.12', 8]],
    comms: [[0, 'Anita Rao', 'Anita escalated: two outages in a week', 'bad'], [4, 'Luis Ferreira', 'Luis asked for the SOC 2 report', 'warn'], [13, 'Anita Rao', 'Renewal talks paused until stability improves', 'warn']],
    meeting: [9, ['Promised a root-cause report within a week', 'Agreed weekly status calls until renewal', 'Open: service credit request']]
  },
  northwind: {
    tickets: [['High', 'Delayed shipment sync with partner TMS', 3], ['Medium', 'Mobile app crashes on the route view', 6], ['Low', 'Report export column order', 12]],
    comms: [[1, 'Marcus Webb', 'Marcus asked for a Q4 capacity plan', 'warn'], [5, 'Elena Petrova', 'Elena approved the SSO rollout', 'n'], [11, 'Marcus Webb', 'Positive feedback on the new route optimizer', 'n']],
    meeting: [16, ['Reviewed Q3 delivery metrics', 'Marcus wants the route optimizer in two more depots', 'Open: pricing for additional depots']]
  },
  bluepeak: {
    tickets: [['Medium', 'Scheduled reports arrive late on Mondays', 7], ['Low', 'Add a user role for auditors', 15]],
    comms: [[2, 'Sofia Alvarez', 'Sofia shared positive feedback on onboarding', 'n'], [8, 'Tom Becker', 'Tom asked for a seat-based pricing quote', 'warn']],
    meeting: [20, ['Happy with the rollout of the inventory module', 'Interested in adding two more warehouses', 'Open: seat pricing quote']]
  },
  harborline: {
    tickets: [['Medium', 'Checkout analytics lag by several hours', 4], ['Low', 'Wrong timezone on the weekly digest', 10]],
    comms: [[3, 'Jonas Lindqvist', 'Jonas asked about holiday-season capacity', 'warn'], [9, 'Priya Nair', 'Priya requested a data retention overview', 'n']],
    meeting: [14, ['Black Friday readiness review', 'Agreed to run a load test in late October', 'Open: dedicated support contact for peak weeks']]
  },
  quantix: {
    tickets: [['Medium', 'Webhook retries failing intermittently', 3], ['Low', 'API rate limit docs unclear', 5]],
    comms: [[6, 'Ben Okafor', 'Ben asked about upgrading to the Growth plan', 'n']],
    meeting: [25, ['Trial converted to the Starter plan', 'Needs higher API limits soon', 'Open: Growth plan quote']]
  },
  meridian: {
    tickets: [['Low', 'Audit log export timestamps', 11]],
    comms: [[2, 'Grace Holloway', 'Grace invited us to the Q1 planning session', 'n'], [7, 'Rahul Mehta', 'Rahul sent the annual compliance checklist', 'n']],
    meeting: [30, ['Reviewed the audit-readiness roadmap', 'Bank is expanding to two new regions', 'Open: data residency options for the new regions']]
  },
  solstice: {
    tickets: [['High', 'Sensor data ingestion delayed up to 4 hours', 2], ['Medium', 'Plant dashboard shows stale readings', 5], ['Medium', 'User provisioning request pending', 12]],
    comms: [[1, 'Camila Ortiz', 'Camila said the dashboard delays affect shift handover', 'bad'], [6, 'Hiro Tanaka', 'Hiro asked for the ingestion fix timeline', 'warn']],
    meeting: [11, ['Flagged ingestion delays at two plants', 'Promised a fix plan within two weeks', 'Open: renewal decision is coming up soon']]
  },
  tandem: {
    tickets: [['Low', 'Request: dark mode for the instructor app', 8]],
    comms: [[4, 'Maya Chen', 'Maya shared strong semester sign-up numbers', 'n']],
    meeting: [18, ['Enrollment is up for the new semester', 'Wants parent-facing progress reports', 'Open: report template examples']]
  }
};

const BG_TITLES = ['Password reset request', 'Question about an invoice', 'Export timing out', 'Seat count change', 'How to configure alerts', 'Login error on mobile'];

function usageFor(c, seedNo) {
  const r = rng(seedNo), out = [];
  for (let i = 0; i < 30; i++) {
    const wave = 1 + 0.02 * Math.sin(i / 2.2);          // gentle weekly rhythm
    const noise = 1 + (r() - 0.5) * 0.05;               // +-2.5% daily noise
    let f = wave * noise, exportOk = 95 + (r() - 0.5) * 2, spu = 3.8 + (r() - 0.5) * 0.15;
    if (c.scenario === 'drop') {                        // release 4.12 on day 17, drop from day 18, partial recovery after hotfix on day 22
      if (i >= 18) { f *= i >= 22 ? 0.82 : 0.70; exportOk = (i >= 22 ? 78 : 70) + (r() - 0.5) * 3; spu *= 0.82; }
    } else if (c.scenario === 'dip') { if (i >= 22) { f *= 0.93; exportOk -= 3; } }
    else if (c.scenario === 'growth') f *= 1 + i * 0.004;
    out.push({ users: Math.round(c.base * f), spu: Math.round(spu * 100) / 100, exportOk: Math.round(exportOk * 10) / 10 });
  }
  return out;
}

export function generateSeed(now = new Date()) {
  const clients = CLIENTS.map(c => ({
    id: c.id, name: c.name, aliases: c.aliases, plan: c.plan, arr: c.arr, health: c.health,
    renewal: ahead(now, c.renewIn), contacts: c.contacts, talk: c.talk || null
  }));

  const tickets = [], comms = [], meetings = [], usage = [];
  CLIENTS.forEach((c, idx) => {
    const s = STORY[c.id];
    s.tickets.forEach(([severity, title, d]) => tickets.push({ clientId: c.id, title, severity, status: 'open', openedAt: ago(now, d, 3), source: 'Support desk' }));
    s.comms.forEach(([d, who, text, tone]) => comms.push({ clientId: c.id, at: ago(now, d, 2), who, text, tone }));
    meetings.push({ clientId: c.id, at: ago(now, s.meeting[0]), notes: s.meeting[1] });
    usageFor(c, 1000 + idx).forEach((u, i) => usage.push({ clientId: c.id, day: i, date: ago(now, 29 - i), ...u }));

    // routine closed tickets over the last 14 days, so the "support tickets" trend is real
    const r = rng(2000 + idx);
    for (let d = 13; d >= 0; d--) {
      let n = r() < (c.id === 'kestrel' ? 1 : 0.4) ? 1 : 0;
      if (c.id === 'kestrel') n = d > 6 ? (d % 2 ? 2 : 1) : 2 + (d % 2 === 0 ? 1 : 0);   // rising volume this week
      for (let k = 0; k < n; k++) tickets.push({ clientId: c.id, title: BG_TITLES[Math.floor(r() * BG_TITLES.length)], severity: 'Low', status: 'closed', openedAt: ago(now, d, 5 + k * 3), source: 'Support desk' });
    }
  });

  // workspace-wide project tasks: [title, owner, days late, priority, blocker]
  const OWNERS = ['Asha', 'Ravi', 'Mei', 'Sam', 'Dev'];
  const tasks = [];
  [['Migrate billing webhooks', 'Asha', 9, 'High', 'Billing webhooks waiting on partner API keys'], ['Vendor security review', 'Ravi', 6, 'High', 'Security review waiting on pen-test report'],
   ['Update onboarding docs', 'Mei', 4, 'Medium'], ['QA sign-off: mobile', 'Sam', 2, 'Medium'], ['Archive Q2 reports', 'Ravi', 1, 'Low']]
    .forEach(([title, owner, late, priority, blocker]) => tasks.push({ title, owner, dueAt: ago(now, late), priority, status: 'open', blocker: blocker || null }));
  [['Prepare QBR deck for Meridian', 'Ravi', 1], ['Rotate API credentials', 'Dev', 2], ['Sprint 31 review notes', 'Asha', 2], ['Fix flaky export test', 'Ravi', 3],
   ['Publish release notes 4.12.1', 'Mei', 4], ['Patient-list query tuning', 'Asha', 5], ['Load test for Black Friday', 'Ravi', 5], ['Customer survey analysis', 'Sam', 6]]
    .forEach(([title, owner, inDays]) => tasks.push({ title, owner, dueAt: ahead(now, inDays), priority: inDays < 3 ? 'High' : 'Medium', status: 'open', blocker: null }));
  const later = ['Migrate logging to new stack', 'Design data residency options', 'Draft SOC 2 evidence index', 'Refactor notification service', 'Add audit roles', 'Improve onboarding checklist', 'Evaluate new CDN',
    'Write incident runbook', 'Upgrade database minor version', 'Create partner API guide', 'Redesign billing page', 'Set up synthetic monitoring', 'Review pricing tiers', 'Clean up unused feature flags',
    'Translate help center articles', 'Benchmark export service', 'Plan Q1 roadmap workshop', 'Update security policy', 'Automate invoice reminders', 'Improve search relevance', 'Mobile offline mode spike',
    'Add SSO test matrix', 'Document support escalation path', 'Customer advisory board agenda', 'Tune alert thresholds', 'Plan DR failover test', 'Review vendor contracts', 'Dashboard accessibility audit',
    'Migrate legacy reports', 'Prepare hiring plan for support'];
  const rt = rng(3000);
  later.forEach((title, i) => tasks.push({ title, owner: OWNERS[i % OWNERS.length], dueAt: ahead(now, 8 + Math.floor(rt() * 32)), priority: ['Low', 'Medium', 'High'][Math.floor(rt() * 3)], status: 'open', blocker: null }));
  ['Launch SSO policy update', 'Hotfix 4.12.1 rollout', 'Renew TLS certificates', 'Onboard Tandem Education', 'Q2 invoice audit', 'Retire v1 API'].forEach((title, i) =>
    tasks.push({ title, owner: OWNERS[i % OWNERS.length], dueAt: ago(now, 3 + i), priority: 'Medium', status: 'done', blocker: null }));

  const releases = [
    { at: ago(now, 12), text: 'Release 4.12 shipped' },
    { at: ago(now, 11), text: 'SSO policy update' },
    { at: ago(now, 7), text: 'Hotfix 4.12.1' }
  ];

  const feed = [
    [0.3, 'Priya replied to thread'], [1, 'Ticket #4821 escalated'], [3, 'Hotfix 4.12.1 deployed'], [5, 'Sprint 31 review scheduled'],
    [8, 'New SOC 2 evidence uploaded'], [20, 'Renewal quote sent to Bluepeak Foods']
  ].map(([h, text]) => ({ at: new Date(now.getTime() - h * HOUR), text }));

  // analysis notes (in a real build these come from an analytics job)
  const insights = [
    { clientId: 'kestrel', kind: 'cause', order: 1, tag: '82%', tone: 'bad', text: 'Release 4.12 moved export to a new queue' },
    { clientId: 'kestrel', kind: 'cause', order: 2, tag: '61%', tone: 'warn', text: 'SSO change blocked 14% of Safari logins' },
    { clientId: 'kestrel', kind: 'cause', order: 3, tag: '24%', tone: 'n', text: 'Seasonal dip in two large accounts' },
    { clientId: 'kestrel', kind: 'seg', order: 1, label: 'Safari users', value: 41 }, { clientId: 'kestrel', kind: 'seg', order: 2, label: 'Enterprise plan', value: 32 },
    { clientId: 'kestrel', kind: 'seg', order: 3, label: 'Mobile app', value: 9 }, { clientId: 'kestrel', kind: 'seg', order: 4, label: 'Chrome users', value: 3 },
    { clientId: 'solstice', kind: 'cause', order: 1, tag: '70%', tone: 'warn', text: 'Sensor ingestion delays make dashboards look empty' },
    { clientId: 'solstice', kind: 'cause', order: 2, tag: '30%', tone: 'n', text: 'Plant maintenance week in the north region' },
    { clientId: 'solstice', kind: 'seg', order: 1, label: 'Plant operators', value: 14 }, { clientId: 'solstice', kind: 'seg', order: 2, label: 'Mobile app', value: 6 }, { clientId: 'solstice', kind: 'seg', order: 3, label: 'Office users', value: 2 },
    { clientId: null, kind: 'cause', order: 1, tag: '35%', tone: 'n', text: 'Normal week-to-week variation, no release linked' },
    { clientId: null, kind: 'seg', order: 1, label: 'Desktop users', value: 5 }, { clientId: null, kind: 'seg', order: 2, label: 'Mobile app', value: 3 }
  ];

  // when each connected source was last refreshed (hours ago)
  const sources = Object.entries({ CRM: 2, Analytics: 0.2, 'Support desk': 30, Email: 1, 'Project tool': 5, 'Meeting notes': 72 })
    .map(([source, h]) => ({ source, updatedAt: new Date(now.getTime() - h * HOUR) }));

  return { clients, tickets, comms, meetings, usage, tasks, releases, feed, insights, sources };
}

// Light client list for intent detection (no database needed)
export const CLIENT_INDEX = CLIENTS.map(({ id, name, aliases }) => ({ id, name, aliases }));
