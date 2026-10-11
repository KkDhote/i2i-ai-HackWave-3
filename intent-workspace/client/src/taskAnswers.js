const done = t => ['done', 'completed', 'closed'].includes(String(t.status).toLowerCase());
const late = (t, now) => !done(t) && Number.isFinite(Date.parse(t.dueAt)) && Date.parse(t.dueAt) < now;
const priority = t => ({ critical: 4, urgent: 4, high: 3, medium: 2, low: 1 }[String(t.priority).toLowerCase()] || 0);

export function answerTasks(question, tasks, hindi = false, now = Date.now()) {
  const q = question.toLowerCase().trim();
  if (!q) return hindi ? 'कृपया अपना सवाल बोलें या लिखें।' : 'Please ask a task question.';
  if (!tasks.length) return hindi ? 'अभी कोई task record उपलब्ध नहीं है।' : 'No task records are available yet.';
  let matches, intro;
  const ignored = new Set(['what','is','the','task','tasks','status','of','why','this','show','me','tell','about','reason','pending','blocked','stopped','hurdle','blocker','migration','who','responsible','for','delayed','which','my','project','ka','ki','hai','kya','batao','का','की','है','क्या','बताओ']);
  const terms = (q.match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2 && !ignored.has(w));
  const named = tasks.filter(t => q.includes(t.title.toLowerCase()) || (terms.length && terms.every(w => t.title.toLowerCase().includes(w))));
  if (/priority|urgent|important|प्राथमिक|जरूरी|ज़रूरी/.test(q)) {
    matches = tasks.filter(t => !done(t)).sort((a, b) => priority(b) - priority(a) || Number(late(b, now)) - Number(late(a, now)) || Number(!!b.blocker) - Number(!!a.blocker));
    intro = hindi ? 'Recorded priority के अनुसार top tasks। समान priority में overdue और blocked tasks पहले हैं।' : 'Top tasks by recorded priority, with overdue and blocked tasks first within the same priority.';
  } else if (named.length) {
    matches = named; intro = hindi ? 'Matching tasks का status।' : 'Matching task status.';
  } else if (/blocked|stopped|hurdle|blocker|रुके|रुका|रुक|बाधा/.test(q) && !terms.length) {
    matches = tasks.filter(t => !done(t) && (t.blocker || /blocked|stopped|paused/.test(String(t.status).toLowerCase())));
    intro = hindi ? 'रुके हुए tasks और recorded hurdles।' : 'Blocked or stopped tasks and their recorded hurdles.';
  } else if (/pending|overdue|delayed|पेंडिंग|बाकी|लंबित/.test(q) && terms.every(t => ['overdue','पेंडिंग','बाकी','लंबित'].includes(t))) {
    matches = tasks.filter(t => !done(t) && (!/overdue/.test(q) || late(t, now)));
    intro = hindi ? 'Pending tasks का status।' : 'Pending task status.';
  } else {
    matches = [];
    intro = hindi ? 'Matching tasks का status।' : 'Matching task status.';
  }
  if (!matches.length) return hindi ? 'Matching task नहीं मिला। Task का नाम लिखें, या priority tasks, pending tasks, blocked tasks पूछें।' : 'No matching tasks found. Use a task title, or ask for priority tasks, pending tasks, or blocked tasks.';
  const lines = matches.slice(0, 3).map(t => {
    const reason = t.blocker || (done(t) ? (hindi ? 'Task complete है।' : 'Task is complete.') : (hindi ? 'Pending या stopped होने की reason record में नहीं दी गई है।' : 'No reason for being pending or stopped is recorded.'));
    return hindi
      ? `${t.title}। Status: ${t.status || 'recorded नहीं'}। Priority: ${t.priority || 'recorded नहीं'}। Owner: ${t.owner || 'assigned नहीं'}। ${late(t, now) ? 'Due date निकल चुकी है। ' : ''}Major hurdle या reason: ${reason}`
      : `${t.title}. Status: ${t.status || 'not recorded'}. Priority: ${t.priority || 'not recorded'}. Owner: ${t.owner || 'unassigned'}. ${late(t, now) ? 'Past its due date. ' : ''}Major hurdle or reason: ${reason}`;
  });
  return [intro, ...lines, matches.length > 3 ? (hindi ? `${matches.length} matching tasks में से 3 बताए गए हैं।` : `Showing 3 of ${matches.length} matching tasks.`) : ''].filter(Boolean).join('\n\n');
}

export function answerWorkspace(question, tasks, goals, report, hindi = false, now = Date.now()) {
  const q = question.toLowerCase();
  if (/next|recommend|अगला|आगे/.test(q)) {
    const recs = report.recommendations || [];
    if (!recs.length) return hindi ? 'Linked goals के लिए अभी कोई recommendation नहीं है। पहले goal से tasks link करें।' : 'No goal-linked recommendations are available. Link tasks to a goal first.';
    return recs.slice(0, 3).map(r => `${r.title}. ${r.recommendation}. ${hindi ? 'Recorded evidence' : 'Recorded evidence'}: ${(r.evidence || []).map(e => `${e.task}${e.blocker ? ': ' + e.blocker : ''}${e.dueAt ? ', due ' + e.dueAt.slice(0, 10) : ''}`).join('; ')}. ${hindi ? 'Action लेने से पहले verify करें।' : 'Verify with the owner before acting.'}`).join('\n\n');
  }
  if (/goal|progress|complete|project.*(status|report|delay)|प्रगति|गोल|परियोजना/.test(q)) {
    const named = goals.filter(g => q === g.title.toLowerCase() || (g.title.length > 2 && q.includes(g.title.toLowerCase())));
    if (/this goal|my goal|इस गोल|इस goal/.test(q) && !named.length && goals.length > 1) return hindi ? 'कौन सा goal? कृपया goal का पूरा नाम बताएं।' : 'Which goal? Please include its full title.';
    const selected = named.length ? named : goals;
    const lines = selected.slice(0, 3).map(g => {
      const linked = tasks.filter(t => (g.taskKeys || []).includes(t.taskKey));
      const reasons = linked.filter(t => !done(t) && t.blocker).map(t => `${t.title}: ${t.blocker}`);
      return `${g.title}. ${hindi ? 'Status' : 'Status'}: ${g.status}. ${g.progress}% complete; ${g.completedTasks} of ${g.totalTasks} linked tasks completed. ${linked.filter(t => late(t, now)).length} overdue tasks. ${reasons.length ? 'Recorded hurdles: ' + reasons.join('; ') : 'No blocker reason recorded for remaining tasks.'} ${g.status === 'paused' ? 'The reason for pausing this goal is not recorded.' : ''}`;
    });
    if (!lines.length) lines.push(hindi ? 'अभी कोई saved goal नहीं है।' : 'No saved goals are available.');
    if (/project|परियोजना/.test(q)) lines.push(answerTasks('priority tasks', tasks, hindi, now));
    if (selected.length > 3) lines.push(`Showing 3 of ${selected.length} goals. Ask using a full goal title for details.`);
    return lines.join('\n\n');
  }
  return answerTasks(question, tasks, hindi, now);
}
