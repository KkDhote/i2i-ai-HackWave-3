import { decide } from './intent.js';
import { planWithLLM } from './llm.js';
import { layouts, catalog, TASKS } from './catalog.js';

// 30 labelled prompts: what a correct system should do. 'none' = must NOT force a plan (ask or decline).
export const CASES = [
  ["Prepare tomorrow's client meeting", 'meeting'], ['I have a call with Kestrel tomorrow', 'meeting'], ['Get me ready for the Bluepeak meeting', 'meeting'],
  ['Agenda for my customer call', 'meeting'], ['Talking points for the client meeting', 'meeting'], ['What should I discuss with Northwind?', 'meeting'],
  ['Prep me for my meeting with the client', 'meeting'], ['Customer call coming up, help me get ready', 'meeting'],
  ['Investigate why active users dropped', 'usage'], ['Usage went down, why?', 'usage'], ['Why did engagement fall last week', 'usage'],
  ['Fewer people are logging in than before', 'usage'], ['Figure out the dip in daily active users', 'usage'], ['What caused the decline in usage', 'usage'],
  ['Our numbers are falling, investigate', 'usage'], ['Something is wrong with user activity', 'usage'],
  ['Review overdue project work', 'overdue'], ['Which tasks are behind schedule?', 'overdue'], ['What is late on the project', 'overdue'],
  ['Show me slipped deadlines', 'overdue'], ['Who is blocked and why?', 'overdue'], ['Tasks that missed their deadline', 'overdue'],
  ["Check what's delayed this sprint", 'overdue'], ['Are we on track to ship?', 'overdue'],
  ['client usage', 'none'], ['show me stuff', 'none'], ['help', 'none'], ["What's the weather in Delhi?", 'none'], ['Write me a poem', 'none'], ['hello', 'none']
];

// Fixed-step counts are an ASSUMPTION (clicks to gather the same info in a typical fixed dashboard). Replace with your own stopwatch numbers.
const FIXED_STEPS = { meeting: 7, usage: 6, overdue: 5 };

async function one([text, expected], useLLM) {
  let got = 'error';
  try {
    if (useLLM) { const r = await planWithLLM(text, null); got = r.status === 'plan' ? r.intent.key : 'none'; }
    else { const d = decide(text); got = d.type === 'intent' ? d.key : 'none'; }
  } catch { got = 'error'; }
  return { text, expected, got, ok: got === expected };
}

export async function runEval(useLLM) {
  const rows = [];
  for (let i = 0; i < CASES.length; i += 5) rows.push(...await Promise.all(CASES.slice(i, i + 5).map(c => one(c, useLLM))));
  const correct = rows.filter(r => r.ok).length;
  const byIntent = {};
  rows.forEach(r => { const b = byIntent[r.expected] ||= { n: 0, ok: 0 }; b.n++; if (r.ok) b.ok++; });
  const total = Object.keys(catalog).length;
  return { mode: useLLM ? 'AI planner' : 'Built-in rules', total: rows.length, correct, accuracy: Math.round(100 * correct / rows.length), byIntent, rows,
    comparison: TASKS.map(k => ({ task: layouts[k].name, adaptiveSteps: 1, fixedSteps: FIXED_STEPS[k], shown: layouts[k].components.length, total })) };
}
