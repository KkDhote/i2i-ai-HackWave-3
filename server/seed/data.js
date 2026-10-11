const usage = Array.from({ length: 30 }, (_, i) => {
  let b = 1000 + Math.round(Math.sin(i / 1.1) * 40);
  if (i >= 18) b = Math.round(b * (i < 22 ? 0.72 : 0.8));
  return b;
});
export default {
  usage,
  usageMeta: { dropFrom: 18 },
  freshness: { CRM: 2, Analytics: 0.2, 'Support desk': 30, Email: 1, 'Project tool': 5, 'Meeting notes': 72 },  // hours since last sync
  kpis: {
    home: [
      { label: 'Active users', value: '998', delta: '+2%', tone: 'up' },
      { label: 'Open tasks', value: '43' },
      { label: 'At-risk accounts', value: '2', delta: 'of 3', tone: 'dn' },
      { label: 'Uptime', value: '99.9%', delta: '30d', tone: 'up' }],
    usage: [
      { label: 'Active users', value: '710', delta: '-29%', tone: 'dn' },
      { label: 'Sessions per user', value: '3.1', delta: '-18%', tone: 'dn' },
      { label: 'Export success', value: '71%', delta: '-24%', tone: 'dn' },
      { label: 'Support tickets', value: '+37%', delta: 'this week', tone: 'dn' }],
    overdue: [
      { label: 'Overdue', value: '5', delta: 'tasks', tone: 'dn' },
      { label: 'Avg days late', value: '4.4', delta: 'days', tone: 'dn' },
      { label: 'Due this week', value: '8' },
      { label: 'On track', value: '74%', delta: 'of project', tone: 'up' }]
  },
  actions: {
    home: ['Start a task', 'Invite teammate'],
    meeting: ['Draft agenda email', 'Share last-meeting recap', 'Escalate export bug'],
    usage: ['Open Safari login report', 'Notify support lead', 'Start incident review'],
    overdue: ['Nudge owners', 'Reschedule 3 tasks', 'Request partner keys']
  },
  clients: [
    { id: 'northwind', name: 'Northwind Logistics', aliases: ['northwind'] },
    { id: 'bluepeak', name: 'Bluepeak Foods', aliases: ['bluepeak', 'blue peak'] },
    { id: 'kestrel', name: 'Kestrel Health', aliases: ['kestrel'] }],
  byClient: {
    northwind: {
      client: [
        { tag: 'Health 62/100', tone: 'warn', text: 'Northwind Logistics, Enterprise, $184k ARR, renews Mar 14' },
        { tag: 'Contacts', tone: 'n', text: 'Priya Nair (VP Ops), Tom Becker (IT Lead)' }],
      comms: [
        { tag: 'Today', tone: 'n', text: 'Priya asked if the export bug is fixed before the board review' },
        { tag: 'Mon', tone: 'warn', text: 'Tom reported slow report loading (ticket #4821)' },
        { tag: 'Last Thu', tone: 'ok', text: 'Invoice questions resolved by finance' }],
      issues: [
        { tag: 'High', tone: 'bad', text: 'Report export fails over 50k rows' },
        { tag: 'Medium', tone: 'warn', text: 'SSO login loops on Safari' },
        { tag: 'Low', tone: 'n', text: 'Request: scheduled digests' }],
      meeting: [
        { text: 'Agreed to pilot route optimiser with 2 depots' },
        { text: 'Priya worried about onboarding time' },
        { text: 'Open: pricing for extra seats' }],
      talk: [
        { text: 'Open with the export fix: ETA and workaround' },
        { text: 'Show the pilot results from the 2 depots' },
        { text: 'Offer a guided onboarding for new teams' },
        { text: 'Park seat pricing; promise a quote by Friday' }]
    },
    bluepeak: {
      client: [
        { tag: 'Health 81/100', tone: 'ok', text: 'Bluepeak Foods, Growth plan, $96k ARR, renews Jun 2' },
        { tag: 'Contacts', tone: 'n', text: 'Meera Kapoor (Head of Supply), Dan Ortiz (Finance)' }],
      comms: [
        { tag: 'Today', tone: 'ok', text: 'Meera asked for pricing on 3 extra depots' },
        { tag: 'Tue', tone: 'n', text: 'Dan requested the Q3 usage summary' },
        { tag: 'Last Fri', tone: 'ok', text: 'Positive feedback on the new route planner' }],
      issues: [
        { tag: 'Low', tone: 'n', text: 'Request: custom delivery windows' },
        { tag: 'Low', tone: 'n', text: 'Dashboard colours hard to read on a projector' }],
      meeting: [
        { text: 'Pilot at 1 depot went well: 12% fewer late deliveries' },
        { text: 'Meera wants to expand to 3 more depots' },
        { text: 'Open: multi-depot pricing' }],
      talk: [
        { text: 'Share the 12% on-time improvement from the pilot' },
        { text: 'Present the 3-depot expansion plan and timeline' },
        { text: 'Bring a draft multi-depot quote' },
        { text: 'Ask for a case-study reference' }]
    },
    kestrel: {
      client: [
        { tag: 'Health 48/100', tone: 'bad', text: 'Kestrel Health, Enterprise, $240k ARR, renews Nov 30' },
        { tag: 'Contacts', tone: 'n', text: 'Dr. Anita Rao (COO), Luis Ferreira (Security Lead)' }],
      comms: [
        { tag: 'Today', tone: 'bad', text: 'Anita escalated: two outages in a week' },
        { tag: 'Wed', tone: 'warn', text: 'Luis asked for the SOC 2 report' },
        { tag: 'Last Mon', tone: 'warn', text: 'Renewal talks paused until stability improves' }],
      issues: [
        { tag: 'High', tone: 'bad', text: 'Two outages in 7 days on the scheduling module' },
        { tag: 'High', tone: 'bad', text: 'Security questionnaire overdue by 6 days' },
        { tag: 'Medium', tone: 'warn', text: 'Slow patient-list loading' }],
      meeting: [
        { text: 'Promised a root-cause report within a week' },
        { text: 'Agreed weekly status calls until renewal' },
        { text: 'Open: service credit request' }],
      talk: [
        { text: 'Open by owning the outages and presenting the root-cause report' },
        { text: 'Walk through the fixes and the new monitoring' },
        { text: 'Hand over the SOC 2 report and the questionnaire' },
        { text: 'Raise service credits before they ask' }]
    }
  },
  causes: [
    { tag: '82%', tone: 'bad', text: 'Release 4.12 moved export to a new queue' },
    { tag: '61%', tone: 'warn', text: 'SSO change blocked 14% of Safari logins' },
    { tag: '24%', tone: 'n', text: 'Seasonal dip in two large accounts' }],
  releases: [
    { tag: 'Day 17', tone: 'n', text: 'Release 4.12 shipped' },
    { tag: 'Day 18', tone: 'n', text: 'SSO policy update' },
    { tag: 'Day 22', tone: 'n', text: 'Hotfix 4.12.1' }],
  segs: [
    { label: 'Safari users', value: 41, max: 50, display: '-41%', tone: 'bad' },
    { label: 'Enterprise plan', value: 32, max: 50, display: '-32%', tone: 'bad' },
    { label: 'Mobile app', value: 9, max: 50, display: '-9%', tone: 'bad' },
    { label: 'Chrome users', value: 3, max: 50, display: '-3%', tone: 'bad' }],
  tasks: [
    { task: 'Migrate billing webhooks', owner: 'Asha', days: 9, priority: 'High', priorityTone: 'bad' },
    { task: 'Vendor security review', owner: 'Ravi', days: 6, priority: 'High', priorityTone: 'bad' },
    { task: 'Update onboarding docs', owner: 'Mei', days: 4, priority: 'Medium', priorityTone: 'warn' },
    { task: 'QA sign-off: mobile', owner: 'Sam', days: 2, priority: 'Medium', priorityTone: 'warn' },
    { task: 'Archive Q2 reports', owner: 'Ravi', days: 1, priority: 'Low', priorityTone: 'n' }],
  load: [
    { label: 'Ravi', value: 7, max: 8, display: '7' },
    { label: 'Asha', value: 5, max: 8, display: '5' },
    { label: 'Mei', value: 3, max: 8, display: '3' },
    { label: 'Sam', value: 2, max: 8, display: '2' }],
  blockers: [
    { tag: 'Asha', tone: 'warn', text: 'Billing webhooks waiting on partner API keys' },
    { tag: 'Ravi', tone: 'warn', text: 'Security review waiting on pen-test report' }],
  accts: [
    { account: 'Northwind Logistics', plan: 'Enterprise', health: 62, healthTone: 'warn' },
    { account: 'Bluepeak Foods', plan: 'Growth', health: 81, healthTone: 'ok' },
    { account: 'Kestrel Health', plan: 'Enterprise', health: 48, healthTone: 'bad' }],
  feed: [
    { text: 'Priya replied to thread' }, { text: 'Ticket #4821 escalated' },
    { text: 'Hotfix 4.12.1 deployed' }, { text: 'Sprint 31 review scheduled' }]
};
