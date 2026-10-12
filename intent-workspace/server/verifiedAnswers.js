const INTENTS = new Set(['task_status','task_details','priority','pending','blocked','overdue','tasks','goals','next_steps','help','clarify','unsupported']);
const done = t => ['done','completed','closed'].includes(String(t.status).toLowerCase());
const late = (t, now) => !done(t) && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < now;
const rank = t => ({ critical:4, urgent:4, high:3, medium:2, low:1 }[String(t.priority).toLowerCase()] || 0);
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium' }) + ' (India time)' : 'Not recorded';
export const APP_HELP = 'I2I By AI helps with client tasks, priorities, blockers, goals and dashboard views. Describe new work to start task setup; review and confirm before saving. Ask “show open issues” or “show usage” to change the dashboard. Email reminders use Resend and need configured sending. Calendar entries are saved in the Calendar card; Google sync and Meet links require its explicit controls. I cannot execute work, send messages or sync events through chat.';

export function ambiguousTaskReference(message,evidence,history=[]) {
  const q=message.toLowerCase(), matches=text=>evidence.tasks.filter(t=>t.title && text.toLowerCase().includes(t.title.toLowerCase()));
  if (/\bunknown task\b/.test(q)) return true;
  const quoted=[...message.matchAll(/[“"]([^”"]+)[”"]/g)].map(m=>m[1]);
  if (quoted.length && /task|status|owner|priority|blocker|reason/i.test(q) && quoted.some(title=>!evidence.tasks.some(t=>t.title.toLowerCase()===title.toLowerCase()))) return true;
  if (matches(message).length > 1) return true;
  if (/\b(?:it|its|this task|that task)\b|उसका|उसकी/.test(q)) {
    const previous=[...history].reverse().find(m=>m.role==='user' && matches(m.content).length);
    return !previous || matches(previous.content).length !== 1;
  }
  return false;
}

export function validateAnswerSelection(value, evidence) {
  if (!value || typeof value !== 'object' || !INTENTS.has(value.intent) || typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) || value.confidence < 0.65 || value.confidence > 1) return null;
  const taskKeys = value.taskKeys ?? [], goalIds = value.goalIds ?? [];
  if (![taskKeys,goalIds].every(a => Array.isArray(a) && a.length <= 3 && a.every(v => typeof v === 'string') && new Set(a).size === a.length)) return null;
  if (taskKeys.some(key => !evidence.tasks.some(t => t.taskKey === key)) || goalIds.some(id => !evidence.goals.some(g => g.id === id))) return null;
  if (['task_status','task_details'].includes(value.intent) && taskKeys.length !== 1) return null;
  return { intent:value.intent, taskKeys, goalIds };
}

export function renderVerifiedAnswer(selection, evidence, { hindi = false, now = Date.now() } = {}) {
  const ask = hindi ? 'कौन सा task या goal? उसका पूरा नाम बताएं, या priority, pending, blocked tasks पूछें।' : 'Which task or goal do you mean? Give its full title, or ask for priority, pending or blocked tasks.';
  if (!selection || selection.intent === 'clarify') return ask;
  if (selection.intent === 'unsupported') return hindi ? 'मैं इस workspace के client tasks, goals और schedules में मदद करता हूं। इस अनुरोध को task के रूप में दर्ज करना चाहेंगे?' : 'I help with this workspace’s client tasks, goals and schedules. You can describe this as a task for a person to complete.';
  if (selection.intent === 'help') return APP_HELP;
  let answer;
  if (selection.intent === 'goals') {
    const goals = selection.goalIds.length ? evidence.goals.filter(g => selection.goalIds.includes(g.id)) : evidence.goals;
    answer = goals.length ? goals.slice(0,3).map(g => `${g.title}. Recorded status: ${g.status || 'Not recorded'}. ${g.progress}% complete; ${g.completedTasks} of ${g.totalTasks} linked tasks completed.${g.status === 'paused' ? ' Pause reason: Not recorded.' : ''}`).join('\n\n') : 'No matching goals are recorded in this client snapshot.';
  } else {
    let tasks = evidence.tasks;
    if (selection.taskKeys.length && ['task_status','task_details','next_steps'].includes(selection.intent)) tasks = tasks.filter(t => selection.taskKeys.includes(t.taskKey));
    else if (selection.intent === 'priority' || selection.intent === 'pending' || selection.intent === 'next_steps') tasks = tasks.filter(t => !done(t));
    else if (selection.intent === 'overdue') tasks = tasks.filter(t => late(t, now));
    else if (selection.intent === 'blocked') tasks = tasks.filter(t => !done(t) && (t.blocker || /blocked|stopped|paused/.test(String(t.status))));
    if (['priority','next_steps'].includes(selection.intent)) tasks = [...tasks].sort((a,b) => rank(b)-rank(a) || Number(late(b,now))-Number(late(a,now)) || Number(!!b.blocker)-Number(!!a.blocker) || Date.parse(a.dueAt)-Date.parse(b.dueAt) || a.title.localeCompare(b.title));
    answer = tasks.length ? tasks.slice(0,3).map(t => {
      const fields = hindi ? `${t.title}। Recorded status: ${t.status || 'Not recorded'}। Priority: ${t.priority || 'Not recorded'}। Owner: ${t.owner || 'Not recorded'}। Due date: ${date(t.dueAt)}।` : `${t.title}. Recorded status: ${t.status || 'Not recorded'}. Priority: ${t.priority || 'Not recorded'}. Owner: ${t.owner || 'Not recorded'}. Due date: ${date(t.dueAt)}.`;
      const reason = ` ${late(t,now) ? 'Past its due date. ' : ''}Recorded blocker/reason: ${t.blocker || 'Not recorded'}.`;
      const detail = selection.intent === 'task_details' ? ` Recorded details: ${t.description || 'Not recorded'}${t.descriptionTruncated ? ' (Details truncated.)' : ''}` : '';
      const suggestion = selection.intent === 'next_steps' ? ` Suggested next step: ${t.blocker ? 'ask the recorded owner to resolve or clarify this blocker.' : 'confirm the next step and due date with the recorded owner.'} This action has not been performed.` : '';
      return fields + reason + detail + suggestion;
    }).join('\n\n') : 'No matching tasks are recorded in this client snapshot.';
    if (tasks.length > 3) answer += `\n\nShowing 3 of ${tasks.length} matching records in this snapshot.`;
    if (selection.intent === 'priority') answer = 'Ranked by recorded priority, then overdue and blocked status.\n\n' + answer;
  }
  if (evidence.partial || evidence.descriptionsPartial) answer += '\n\nThis is a limited snapshot; these results do not establish full-project totals.';
  return answer;
}

export function selectAnswerByRules(message, evidence, history = []) {
  const q = message.trim().toLowerCase();
  if (/how.*(?:app|workspace)|what.*(?:app|you).*do|\b(?:help|features)\b/.test(q)) return { intent:'help', taskKeys:[], goalIds:[] };
  if (/\b(?:weather|poem|recipe|flight|transfer money|buy stocks|book a flight)\b|^(?:please\s+)?(?:delete|remove|send|sync|deploy|transfer|book|purchase|pay)\b|मौसम|कविता/.test(q)) return { intent:'unsupported', taskKeys:[], goalIds:[] };
  const named = evidence.tasks.filter(t => q.includes(t.title.toLowerCase()));
  let matched = named;
  if (!matched.length && /\b(?:it|its|this task|that task)\b|उसका|उसकी/.test(q)) {
    const prior = [...history].reverse().find(m => m.role === 'user' && evidence.tasks.some(t => m.content.toLowerCase().includes(t.title.toLowerCase())));
    if (prior) matched = evidence.tasks.filter(t => prior.content.toLowerCase().includes(t.title.toLowerCase()));
  }
  if (matched.length === 1) return { intent:/\b(?:details|brief|description|explain)\b|विवरण/.test(q) ? 'task_details' : /\b(?:next|recommend)\b/.test(q) ? 'next_steps' : 'task_status', taskKeys:[matched[0].taskKey], goalIds:[] };
  if (matched.length > 1) return null;
  const goals = evidence.goals.filter(g => q.includes(g.title.toLowerCase()));
  if (goals.length === 1) return { intent:'goals', taskKeys:[], goalIds:[goals[0].id] };
  if (goals.length > 1 || /\b(?:it|its|this task|that task)\b|उसका|उसकी/.test(q)) return null;
  // Only generic list requests can use broad filters; an unknown named task asks for clarification.
  const normalized = q.replace(/[?!.,]/g,'').replace(/\b(?:show|list|tell|me|the|my|all|what|are|is|tasks?|work|please|top|three|3|ka|ki|hai|kya|batao|dikhao)\b/g,'').replace(/\s+/g,' ').trim();
  const filters = { priority:/^(?:priority|urgent|important|high priority|प्राथमिक|जरूरी)$/, overdue:/^(?:overdue|late|delayed|देरी|लेट)$/, blocked:/^(?:blocked|stopped|blockers|hurdles|रुके|बाधा)$/, pending:/^(?:pending|open|पेंडिंग|बाकी|लंबित)$/, tasks:/^$/, goals:/^(?:goals?|progress|गोल|प्रगति)$/, next_steps:/^(?:next|next steps|recommendations|अगला)$/ };
  const intent = Object.keys(filters).find(key => filters[key].test(normalized));
  return intent ? { intent, taskKeys:[], goalIds:[] } : null;
}
