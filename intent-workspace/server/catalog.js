// Component catalog: the AI can ONLY pick from these ids. type -> React component in client/src/registry.jsx
const il = (title, source, extra = {}) => ({ type: 'ItemList', title, source, ...extra });
export const catalog = {
  kpis: { type: 'StatCards', title: 'Key numbers', source: 'kpis' },
  usage: { type: 'LineChart', title: 'Active users, last 30 days', source: 'usage' },
  client: il('Client overview', 'client', { scoped: true }),
  comms: il('Recent communication', 'comms', { scoped: true }),
  issues: il('Open issues', 'issues', { scoped: true }),
  meeting: il('Last meeting', 'meeting', { scoped: true }),
  talk: il('Suggested talking points', 'talk', { checkbox: true, scoped: true }),
  actions: { type: 'ActionBar', title: 'Next actions', source: 'actions' },
  segs: { type: 'BarList', title: 'Where the drop is concentrated', source: 'segs' },
  causes: il('Likely causes', 'causes'),
  releases: il('Releases and changes', 'releases'),
  overdue: { type: 'DataTable', title: 'Overdue tasks', source: 'tasks', columns: [
    { key: 'task', label: 'Task' }, { key: 'owner', label: 'Owner' }, { key: 'days', label: 'Days late' }, { key: 'priority', label: 'Priority', tag: true }] },
  load: { type: 'BarList', title: 'Overdue by owner', source: 'load' },
  blockers: il('Blockers', 'blockers'),
  accts: { type: 'DataTable', title: 'Accounts', source: 'accts', columns: [
    { key: 'account', label: 'Account' }, { key: 'plan', label: 'Plan' }, { key: 'health', label: 'Health', tag: true }] },
  feed: il('Recent activity', 'feed')
};
// These change content per intent, so the client marks them "Updated" instead of "Unchanged".
export const VARIANT_IDS = ['kpis', 'actions', 'usage'];

export const layouts = {
  home: { name: 'Overview', title: 'Workspace overview', desc: 'A general dashboard. Tell it what you are working on to reshape it.', components: [
    { id: 'kpis', span: 12, reason: 'A general health snapshot when no task is set.' },
    { id: 'usage', span: 7, reason: 'Usage trend is the most common starting question.' },
    { id: 'feed', span: 5, reason: 'Latest events across your work.' },
    { id: 'accts', span: 7, reason: 'All accounts at a glance.' },
    { id: 'actions', span: 5, reason: 'Generic shortcuts.' }] },
  meeting: { name: 'Prepare a client meeting', title: 'Prepare a client meeting: {client}', desc: 'Everything you need to walk in informed, in the order you will use it.',
    keywords: ['prepare', 'prep', 'meeting', 'client', 'tomorrow', 'call', 'customer', 'talking', 'agenda'], components: [
    { id: 'client', span: 7, reason: 'You need context on who the client is before anything else.' },
    { id: 'issues', span: 5, reason: 'Open issues are what the client is most likely to raise.' },
    { id: 'comms', span: 6, reason: 'Recent messages show their current mood and asks.' },
    { id: 'meeting', span: 6, reason: 'Last meeting commitments should be followed up on.' },
    { id: 'talk', span: 7, reason: 'Built from the open issues and last-meeting notes.' },
    { id: 'actions', span: 5, reason: 'Actions you are likely to take before the meeting.' }] },
  usage: { name: 'Review usage and investigate changes', title: 'Usage trends: {client}', desc: 'Track active users, locate changes, and explore possible causes.',
    keywords: ['usage', 'drop', 'decline', 'dip', 'fall', 'investigate', 'churn', 'down', 'engagement', 'why', 'fewer'], components: [
    { id: 'kpis', span: 12, reason: 'Quantifies how big the drop is across related metrics.' },
    { id: 'usage', span: 7, reason: 'The trend shows when the drop started; the band marks it.' },
    { id: 'releases', span: 5, reason: 'Changes shipped near the start date are prime suspects.' },
    { id: 'segs', span: 6, reason: 'Shows which segments explain most of the decline.' },
    { id: 'causes', span: 6, reason: 'Ranks hypotheses using timing and segment overlap.' },
    { id: 'actions', span: 12, reason: 'Moves from diagnosis to response.' }] },
  overdue: { name: 'Review overdue work', title: 'Review overdue project work', desc: 'See what is late, who owns it, and what is blocking it.',
    keywords: ['overdue', 'late', 'project', 'deadline', 'review', 'behind', 'tasks', 'delayed', 'slipped', 'blocked'], components: [
    { id: 'kpis', span: 12, reason: 'Shows how serious the slippage is.' },
    { id: 'overdue', span: 8, reason: 'The core list, most late items first.' },
    { id: 'load', span: 4, reason: 'Reveals if lateness clusters on one person.' },
    { id: 'blockers', span: 7, reason: 'Explains why items are late, so you can unblock them.' },
    { id: 'actions', span: 5, reason: 'Common follow-ups for late work.' }] }
};

export const TASKS = ['meeting', 'usage', 'overdue'];
// Focused quick actions reuse the same client records and existing widgets.
layouts.issues = { name: 'Review client issues', title: 'Open issues: {client}', desc: 'Review reported issues alongside the client context and recent messages.', components: [
  { id: 'issues', span: 7, reason: 'Start with the selected client\'s open issues, highest severity first.' },
  { id: 'client', span: 5, reason: 'Keep the client contacts and account context close to the issues.' },
  { id: 'comms', span: 12, reason: 'Recent client messages provide context for the reported issues.' }] };
layouts.followups = { name: 'Follow up on commitments', title: 'Meeting follow-ups: {client}', desc: 'Revisit recorded meeting notes and prepare the next conversation.', components: [
  { id: 'meeting', span: 7, reason: 'The last meeting records commitments and open follow-ups.' },
  { id: 'talk', span: 5, reason: 'Use the client\'s talking points to prepare the follow-up.' },
  { id: 'comms', span: 12, reason: 'Check what the client has said since the last meeting.' }] };
layouts.updates = { name: 'Read client updates', title: 'Recent messages: {client}', desc: 'Catch up on the selected client\'s latest communication and open concerns.', components: [
  { id: 'comms', span: 7, reason: 'Lead with the selected client\'s most recent messages.' },
  { id: 'client', span: 5, reason: 'Identify the client contacts and account context.' },
  { id: 'issues', span: 12, reason: 'Read open issues alongside the recent conversation.' }] };
// For the fixed-dashboard comparison: every widget, same order, whatever the goal.
layouts.fixed = { name: 'Fixed dashboard (comparison)', title: 'Fixed dashboard', desc: 'Every widget, in the same order for every goal. This is what the adaptive screen replaces.',
  components: Object.keys(catalog).map(id => ({ id, span: id === 'kpis' ? 12 : 6, reason: 'Always shown, whatever your goal.' })) };
