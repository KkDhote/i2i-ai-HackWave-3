export function workspaceRequest(text) {
  const q = String(text || '').trim().toLowerCase();
  if (/\b(?:don't|dont|do not|not|never|add a task|create a task|new task|send|delete|save|sync|book|deploy|transfer)\b|मत|नया\s*(?:task|टास्क)|भेज|हटाओ.*task/.test(q)) return null;
  const refine = /^(?:also\s+show|include|add\s+(?:the\s+)?(?:chart|widget)|remove\s+(?:the\s+)?(?:next actions|chart|widget)|hide\s+(?:the\s+)?(?:next actions|chart|widget))/i.test(q);
  if (refine) return { type:'refine',text };
  if (!/^(?:please\s+)?(?:show|open|display|switch|change|arrange|prepare|investigate|review|view)\b|\b(?:dikhao|dikhado|kholo)\b|दिखाओ|खोलो/.test(q)) return null;
  if (/calendar|कैलेंडर/.test(q)) return { type:'calendar' };
  const matches = [
    ['followups',/follow[ -]?up|commitments/], ['updates',/recent messages|communication|client updates/],
    ['issues',/issues?|tickets?|bugs?|outages?/], ['meeting',/meeting|agenda|बैठक|मीटिंग/],
    ['usage',/usage|active users?|engagement|activity|उपयोग/], ['overdue',/overdue|late work|project work|blocked work|देरी/],
    ['home',/dashboard|overview/]
  ].filter(([,pattern]) => pattern.test(q));
  const targets = matches.filter(([pick]) => pick !== 'home');
  if (targets.length === 1) return { type:'layout',pick:targets[0][0] };
  if (!targets.length && matches.length) return { type:'layout',pick:'home' };
  return null;
}
