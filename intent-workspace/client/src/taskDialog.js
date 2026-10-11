const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const command = value => clean(value).toLowerCase().replace(/[.!?।]+$/, '');
const defaults = /^(skip|default|normal|chhodo|छोड़ो)$/;
const cancelled = /^(cancel(?: task)?|stop|never mind|nevermind|cancel karo|रद्द(?: करो)?|बंद करो)$/;
const confirmed = /^(yes|yes please|confirm|confirmed|save|save task|add it|add task|haan|han|ha|हाँ|हां|जी हाँ|कर दो|save karo)$/;
const englishRequest = /^(?:(?:hey|hi|bhai|please)[,!\s]+)*(?:(?:can|could|would|will) you\s+|i (?:want|need|would like) to\s+|let'?s\s+)?(?:add|create|make)\s+(?:(?:a|an|new)\s+)*task\b/i;

export function isTaskRequest(text) {
  const value = clean(text);
  return englishRequest.test(value) || /^new task(?:\s*[:\-]|\s*$)/i.test(value)
    || /^(?:bhai\s+|mujhe\s+)?(?:ek\s+)?(?:naya\s+task(?:\s+(?:banao|banana|add|create))?|task\s+(?:add|create|banao|banana))\b/i.test(value)
    || /^(?:मुझे\s+)?(?:एक\s+)?(?:नया\s+(?:टास्क|कार्य)|(?:टास्क|कार्य)\s+(?:बनाओ|जोड़ो))/u.test(value);
}

function question(field, hindi, status) {
  if (field === 'blocker' && status !== 'blocked') return hindi ? 'Koi pending reason hai? Reason batao ya skip bolo.' : 'Is there a pending reason? Enter it or say skip.';
  const prompts = {
    title: ['What is the task title?', 'Task ka title kya hai?'],
    owner: ['Who will own this task?', 'Is task ka owner kaun hoga?'],
    dueDate: ['When is it due? Use YYYY-MM-DD, today, or tomorrow.', 'Due date kya hai? YYYY-MM-DD, aaj ya kal batao.'],
    priority: ['What is the priority: High, Medium, or Low? Say skip for Medium.', 'Priority High, Medium ya Low? Skip bolne par Medium hogi.'],
    status: ['What is the status: open, in progress, blocked, or done? Say skip for open.', 'Status open, in progress, blocked ya done? Skip bolne par open hoga.'],
    blocker: ['Why is the task blocked? A reason is required.', 'Task blocked kyun hai? Reason zaroori hai.']
  };
  return prompts[field][hindi ? 1 : 0];
}

function review(draft, hindi) {
  return `${hindi ? 'Task details check karo:' : 'Review the task:'}\nTitle: ${draft.title}\nOwner: ${draft.owner}\nDue date: ${draft.dueDate}\nPriority: ${draft.priority}\nStatus: ${draft.status.replace('_', ' ')}${draft.blocker ? `\nReason: ${draft.blocker}` : ''}\n${hindi ? 'Save karne ke liye Confirm bolo. Edit owner/title/due date/priority/status/reason ya Cancel bhi bol sakte ho.' : 'Say Confirm to save, edit a field (e.g. change owner to Ravi), or Cancel.'}`;
}

function response(draft, hindi) {
  const field = ['title', 'owner', 'dueDate', 'priority', 'status'].find(key => !draft[key])
    || (draft.status === 'blocked' && !draft.blocker ? 'blocker' : 'review');
  const next = { ...draft, field };
  return { draft: next, reply: field === 'review' ? review(next, hindi) : question(field, hindi, next.status), ready: field === 'review' };
}

function dateValue(text, now) {
  const value = command(text).replace(/^(due(?: date)?(?: is)?|deadline(?: is)?)\s*[:=]?\s*/, '');
  if (/^(today|tomorrow|aaj|kal|आज|कल)$/.test(value)) {
    const date = new Date(now);
    if (/^(tomorrow|kal|कल)$/.test(value)) date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1000 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? value : null;
}

function collect(draft, text, hindi, now) {
  const { field } = draft;
  let value = clean(text), error;
  const token = command(value);
  if (field === 'title' || field === 'owner' || field === 'blocker') {
    if (field === 'owner') value = value.replace(/^(?:owner(?: is)?|assign(?:ed)? to|responsible person(?: is)?)\b\s*[:=]?\s*/i, '').trim();
    const optionalReason = field === 'blocker' && draft.status !== 'blocked';
    if (optionalReason && (defaults.test(token) || /^(none|no|नहीं)$/.test(token))) value = '';
    const max = { title: 180, owner: 100, blocker: 500 }[field];
    if (!optionalReason && (!value || defaults.test(token))) error = hindi ? 'Yeh detail zaroori hai.' : 'This detail is required.';
    else if (confirmed.test(token) || (!optionalReason && /^(no|nope|nahi|नहीं)$/.test(token))) error = hindi ? 'Pehle yeh detail batao, phir task confirm karenge.' : 'Provide this detail before confirming the task.';
    else if (value.length > max) error = hindi ? `Maximum ${max} characters mein batao.` : `Use at most ${max} characters.`;
  } else if (field === 'dueDate') {
    value = dateValue(value, now);
    if (!value) error = hindi ? 'Valid date batao, jaise 2026-10-31, aaj ya kal.' : 'Enter a valid date, e.g. 2026-10-31, today, or tomorrow.';
  } else if (field === 'priority') {
    const priority = token.replace(/^priority(?: is)?\s*[:=]?\s*/, '').replace(/\s+priority$/, '');
    value = defaults.test(token) ? 'Medium' : /^(high|urgent|critical|ऊँची|उच्च)$/.test(priority) ? 'High' : /^(medium|मध्यम)$/.test(priority) ? 'Medium' : /^(low|कम|निम्न)$/.test(priority) ? 'Low' : null;
    if (!value) error = hindi ? 'High, Medium ya Low batao.' : 'Choose High, Medium, or Low.';
  } else if (field === 'status') {
    const status = token.replace(/^status(?: is)?\s*[:=]?\s*/, '');
    value = defaults.test(token) || /^(open|pending|todo|to do|लंबित)$/.test(status) ? 'open'
      : /^(in progress|in_progress|working|started|chal raha hai|चल रहा है)$/.test(status) ? 'in_progress'
        : /^(blocked|stopped|paused|on hold|ruka|रुका|रुका हुआ)$/.test(status) ? 'blocked'
          : /^(done|complete|completed|finished|ho gaya|हो गया|पूरा)$/.test(status) ? 'done' : null;
    if (!value) error = hindi ? 'Open, in progress, blocked ya done batao.' : 'Choose open, in progress, blocked, or done.';
  }
  if (error) return { draft, reply: `${error} ${question(field, hindi, draft.status)}`, ready: false };
  const next = { ...draft, [field]: value };
  if (field === 'status' && value !== 'blocked') next.blocker = '';
  return response(next, hindi);
}

export function startTaskDialog(text, hindi = false, now = new Date()) {
  const draft = { title: '', owner: '', dueDate: '', priority: '', status: '', blocker: '', field: 'title' };
  const quoted = /["“]([^"”]+)["”]|'([^']+)'/.exec(text);
  const afterColon = isTaskRequest(text) && /[:：]\s*(.+)$/.exec(text);
  const title = quoted ? quoted[1] || quoted[2] : afterColon?.[1];
  return title ? collect(draft, title, hindi, now) : response(draft, hindi);
}

export function advanceTaskDialog(draft, text, hindi = false, now = new Date()) {
  const token = command(text);
  if (cancelled.test(token)) return { draft, reply: hindi ? 'Task cancel ho gaya. Koi task save nahi hua.' : 'Task cancelled. Nothing was saved.', ready: false, cancelled: true };
  if (draft.field !== 'review') return collect(draft, text, hindi, now);
  if (confirmed.test(token)) {
    const next = response(draft, hindi);
    return next.ready ? { ...next, reply: hindi ? 'Task save kar raha hoon…' : 'Saving the task…', confirm: true } : next;
  }
  const edit = /^(?:change|edit|update)\s+(?:the\s+)?(title|owner|due date|duedate|deadline|priority|status|blocker|reason)(?:\s+(?:to|as|is)\s+(.+))?$/i.exec(clean(text));
  if (edit) {
    const field = /^(due date|duedate|deadline)$/i.test(edit[1]) ? 'dueDate' : edit[1].toLowerCase() === 'reason' ? 'blocker' : edit[1].toLowerCase();
    const next = { ...draft, [field]: '', field };
    return edit[2] ? collect(next, edit[2], hindi, now) : { draft: next, reply: question(field, hindi, next.status), ready: false };
  }
  return { draft, reply: review(draft, hindi), ready: true };
}
