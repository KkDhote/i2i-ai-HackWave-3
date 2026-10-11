const clean = value => String(value || '').trim().replace(/\s+/g, ' ');
const command = value => clean(value).toLowerCase().replace(/[.!?।]+$/, '');
const defaults = /^(skip|default|normal|chhodo|छोड़ो)$/;
const cancelled = /^(cancel(?: task)?|stop|never mind|nevermind|cancel karo|रद्द(?: करो)?|बंद करो)$/;
const confirmed = /^(yes|yes please|confirm|confirmed|save|save task|add it|add task|haan|han|ha|हाँ|हां|जी हाँ|कर दो|save karo)$/;
const skipContext = /^(skip|just add|justadd|no extra questions|noextraquestions|skip questions|no more questions|bas add karo|सीधा जोड़ो)$/;
const englishRequest = /^(?:(?:hey|hi|bhai|please)[,!\s]+)*(?:(?:can|could|would|will) you\s+|i (?:want|need|would like) to\s+|let'?s\s+)?(?:add|create|make)\s+(?:(?:a|an|new)\s+)*task\b/i;
const hinglishRequest = /^(?:bhai\s+|mujhe\s+)?(?:ek\s+)?(?:naya\s+task(?:\s+(?:banao|banana(?:\s+hai)?|add|create)(?:\s+karo)?)?|task\s+(?:add|create|banao|banana)(?:\s+karo)?)\b/i;
const hindiRequest = /^(?:मुझे\s+)?(?:एक\s+)?(?:नया\s+(?:टास्क|कार्य)(?:\s+(?:बनाओ|जोड़ो))?|(?:टास्क|कार्य)\s+(?:बनाओ|जोड़ो))/u;
const newRequest = /^new task\b/i;

export function isTaskRequest(text) {
  const value = clean(text);
  return [englishRequest, newRequest, hinglishRequest, hindiRequest].some(pattern => pattern.test(value));
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
  return `${hindi ? 'Task details check karo:' : 'Review the task:'}\nTitle: ${draft.title}\nOwner: ${draft.owner}\nDue date: ${draft.dueDate}\nPriority: ${draft.priority}\nStatus: ${draft.status.replace('_', ' ')}${draft.blocker ? `\nReason: ${draft.blocker}` : ''}${draft.description ? `\nTask brief and your answers:\n${draft.description}` : ''}\n${hindi ? 'Save karne ke liye Confirm bolo. Edit owner/title/due date/priority/status/reason ya Cancel bhi bol sakte ho.' : 'Say Confirm to save, edit a field (e.g. change owner to Ravi), or Cancel.'}`;
}

function response(draft, hindi) {
  if (draft.title && !draft.intakeComplete) return { draft: { ...draft, field: 'intake' }, reply: hindi ? 'Task ka context samajh raha hoon…' : 'Understanding the task brief…', ready: false, needsIntake: true };
  const field = ['title', 'owner', 'dueDate', 'priority', 'status'].find(key => !draft[key])
    || (draft.status === 'blocked' && !draft.blocker ? 'blocker' : 'review');
  const next = { ...draft, field };
  return { draft: next, reply: field === 'review' ? review(next, hindi) : question(field, hindi, next.status), ready: field === 'review' };
}

function description(draft) {
  return [draft.originalBrief || draft.title, ...(draft.contextAnswers || []).map(item => `Question: ${item.question}\nAnswer: ${item.answer}`)].join('\n\n').slice(0, 6000);
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
  if (field === 'title') {
    const brief = String(text || '').trim();
    if (!value || defaults.test(token) || confirmed.test(token) || /^(no|nope|nahi|नहीं)$/.test(token)) error = hindi ? 'Task ki detail batao, phir confirm karenge.' : 'Describe the task before confirming it.';
    else if (brief.length > 2000) error = hindi ? 'Task brief maximum 2000 characters mein batao.' : 'Use at most 2000 characters for the task brief.';
    if (error) return { draft, reply: `${error} ${question(field, hindi)}`, ready: false };
    const quoted = /["“]([^"”]+)["”]|'([^']+)'/.exec(brief);
    const title = clean(quoted ? quoted[1] || quoted[2] : brief.split(/[;\n]|\.(?:\s|$)/)[0]).replace(/^title\s*[:=]\s*/i, '').slice(0, 180);
    const next = { ...draft, title, originalBrief: brief, contextAnswers: [], contextQuestion: '', understanding: '', intakeComplete: false, contextSkipped: false };
    next.description = description(next);
    return response(next, hindi);
  }
  if (field === 'owner' || field === 'blocker') {
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
  const draft = { title: '', owner: '', dueDate: '', priority: 'Medium', status: 'open', blocker: '', description: '', originalBrief: '', contextAnswers: [], contextQuestion: '', intakeComplete: false, clientId: null, field: 'title' };
  const input = String(text || '').trim();
  const request = [englishRequest, newRequest, hinglishRequest, hindiRequest].find(pattern => pattern.test(input));
  const brief = (request ? input.replace(request, '') : input).trim().replace(/^[:：\-]+\s*/, '');
  return brief && !/^(please|karo|banao|बनाओ|जोड़ो|कृपया)$/i.test(brief) ? collect(draft, brief, hindi, now) : response(draft, hindi);
}

export function applyTaskIntake(draft, result, hindi = false) {
  const next = { ...draft };
  const updates = result?.updates || {};
  for (const [field, max] of [['title', 180], ['owner', 100], ['blocker', 500]]) {
    if (typeof updates[field] === 'string' && updates[field].length <= max && (clean(updates[field]) || field === 'blocker')) next[field] = clean(updates[field]);
  }
  if (typeof updates.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updates.dueDate) && dateValue(updates.dueDate, new Date())) next.dueDate = updates.dueDate;
  if (['High', 'Medium', 'Low'].includes(updates.priority)) next.priority = updates.priority;
  if (['open', 'in_progress', 'blocked', 'done'].includes(updates.status)) next.status = updates.status;
  const contextBrief = typeof result?.contextBrief === 'string' && result.contextBrief.length <= 2000 ? result.contextBrief.trim() : '';
  if (contextBrief && !(next.originalBrief || '').includes(contextBrief)) next.originalBrief = `Earlier client discussion:\n${contextBrief}\n\nCurrent request:\n${next.originalBrief || next.title}`.slice(0, 2000);
  next.understanding = typeof result?.understanding === 'string' ? clean(result.understanding).slice(0, 600) : '';
  next.source = result?.source === 'llm' ? 'llm' : 'rules';
  next.description = description(next);
  const contextQuestion = typeof result?.question === 'string' ? clean(result.question).slice(0, 240) : '';
  if (contextQuestion && (next.contextAnswers || []).length < 2 && !next.contextSkipped) {
    next.contextQuestion = contextQuestion; next.field = 'context'; next.intakeComplete = false;
    return { draft: next, reply: [next.understanding, contextQuestion].filter(Boolean).join('\n\n'), ready: false };
  }
  next.contextQuestion = ''; next.intakeComplete = true;
  const state = response(next, hindi);
  return { ...state, reply: [next.understanding, state.reply].filter(Boolean).join('\n\n') };
}

export function advanceTaskDialog(draft, text, hindi = false, now = new Date()) {
  const token = command(text);
  if (cancelled.test(token)) return { draft, reply: hindi ? 'Task cancel ho gaya. Koi task save nahi hua.' : 'Task cancelled. Nothing was saved.', ready: false, cancelled: true };
  if ((['context', 'intake'].includes(draft.field) && skipContext.test(token)) || /^(just add|justadd|no extra questions|noextraquestions)$/.test(token)) return response({ ...draft, contextQuestion: '', intakeComplete: true, contextSkipped: true }, hindi);
  if (draft.field === 'context') {
    const answer = String(text || '').trim();
    if (!answer || confirmed.test(token)) return { draft, reply: `${hindi ? 'Is question ka answer do ya skip bolo.' : 'Answer this question or say skip.'} ${draft.contextQuestion}`, ready: false };
    if (answer.length > 1500) return { draft, reply: hindi ? 'Answer maximum 1500 characters mein batao.' : 'Use at most 1500 characters for this answer.', ready: false };
    const contextAnswers = [...(draft.contextAnswers || []), { question: draft.contextQuestion, answer }].slice(0, 2);
    const next = { ...draft, contextAnswers, contextQuestion: '', intakeComplete: false };
    next.description = description(next);
    return response(next, hindi);
  }
  if (draft.field === 'intake') return response(draft, hindi);
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
