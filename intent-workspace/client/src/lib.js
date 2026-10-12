// Evidence: every "Why this?" points at real values in the data, with its source and how fresh it is.
const SRC = { client: 'CRM', comms: 'Email', issues: 'Support desk', meeting: 'Meeting notes', talk: 'Meeting notes', usage: 'Analytics', kpis: 'Analytics',
  segs: 'Analytics', causes: 'Analytics', releases: 'Project tool', overdue: 'Project tool', load: 'Project tool', blockers: 'Project tool', accts: 'CRM', feed: 'Project tool' };
const E = {
  client: d => `${d.client[0].tag}, ${d.client[0].text}`,
  comms: d => d.comms.length ? `${d.comms.length} recent messages. Latest (${d.comms[0].tag}): ${d.comms[0].text}` : 'No recent messages recorded',
  issues: d => `${d.issues.length} open issues, ${d.issues.filter(i => i.tag === 'High').length} high priority`,
  meeting: d => `${d.meeting.length} notes from the last meeting`,
  talk: d => `Built from ${d.issues.length} open issues and ${d.meeting.length} meeting notes`,
  usage: d => d.usage.length ? `Daily active users: ${d.usage[0]} at the start, ${d.usage[d.usage.length - 1]} in the latest record. ${d.usageMeta.significant ? 'A significant drop was detected.' : 'No significant drop was detected.'}` : 'No usage records available',
  kpis: (d, c) => { const k = (d.kpis[c.variant] || d.kpis.home)[0]; return `${k.label}: ${k.value} ${k.delta || ''}`; },
  segs: d => d.segs.length ? `Recorded segment: ${d.segs[0].label} (${d.segs[0].display})` : 'No segment breakdown recorded',
  causes: d => d.causes.length ? `Recorded hypothesis, not a confirmed cause: ${d.causes[0].text} (${d.causes[0].tag})` : 'No cause recorded',
  releases: d => `${d.releases.length} recorded releases and changes`,
  overdue: d => d.tasks.length ? `${d.tasks.length} overdue tasks shown, longest ${Math.max(...d.tasks.map(t => t.days))} days late` : 'No overdue tasks recorded',
  load: d => d.load.length ? `${d.load[0].label} has ${d.load[0].display} overdue or upcoming items` : 'No near-term workload recorded',
  blockers: d => d.blockers.length ? `${d.blockers.length} recorded blockers: ${d.blockers[0].text}` : 'No blocker recorded',
  accts: d => { const w = [...d.accts].sort((a, b) => a.health - b.health)[0]; return w ? `Lowest health among shown accounts: ${w.account} (${w.health})` : 'No accounts recorded'; },
  feed: d => `${d.feed.length} recent events`
};
export function evidenceFor(c, d) {
  try { const f = E[c.id]; return f ? { source: SRC[c.id], text: f(d, c), hours: d.freshness?.[SRC[c.id]] } : null; } catch { return null; }
}
export const age = (h) => h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;

// Demo mode: hide client names, people and amounts.
const MAP = { 'Northwind Logistics': 'Client A', Northwind: 'Client A', 'Bluepeak Foods': 'Client B', Bluepeak: 'Client B', 'Kestrel Health': 'Client C', Kestrel: 'Client C', 'Bharat Logistics': 'Client A', Bharat: 'Client A', 'Annapurna Foods': 'Client B', Annapurna: 'Client B', 'Aarogya Healthcare': 'Client C', Aarogya: 'Client C', 'Utsav Retail': 'Client D', Utsav: 'Client D', 'Pragati Tech Labs': 'Client E', Pragati: 'Client E', 'Narmada Finance': 'Client F', Narmada: 'Client F', 'Surya Energy': 'Client G', Surya: 'Client G', 'Vidya Education': 'Client H', Vidya: 'Client H' };
const NAMES = [...Object.keys(MAP), 'Priya Nair', 'Tom Becker', 'Meera Kapoor', 'Dan Ortiz', 'Dr. Anita Rao', 'Luis Ferreira', 'Vikram Sharma', 'Neha Deshmukh', 'Kavya Iyer', 'Rohan Gupta', 'Arjun Menon', 'Sanjay Kulkarni', 'Aditya Verma', 'Sneha Joshi', 'Rahul Mehta', 'Pooja Patel', 'Nikhil Reddy', 'Divya Nair', 'Deepak Singh', 'Priya', 'Tom', 'Meera', 'Dan', 'Anita', 'Luis', 'Vikram', 'Neha', 'Kavya', 'Rohan', 'Arjun', 'Sanjay', 'Aditya', 'Sneha', 'Rahul', 'Pooja', 'Nikhil', 'Divya', 'Deepak', 'Asha', 'Ravi', 'Sameer', 'Dev', 'Ankit'];
const RE = new RegExp('\\b(' + NAMES.sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi');
const maskedNames = Object.fromEntries(Object.entries(MAP).map(([name, value]) => [name.toLowerCase(), value]));
export const maskText = (s) => String(s).replace(RE, m => maskedNames[m.toLowerCase()] || 'Contact').replace(/\$\d[\d.,]*k/gi, '$•••k').replace(/₹\s*\d[\d.,]*(?:\s*lakh)?/gi, '₹•••').replace(/#\d+/g, '#•••');
export const maskDeep = (o) => JSON.parse(JSON.stringify(o), (k, v) => typeof v === 'string' ? maskText(v) : v);
