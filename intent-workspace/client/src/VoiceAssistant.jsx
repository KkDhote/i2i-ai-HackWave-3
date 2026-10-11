import { useEffect, useRef, useState } from 'react';
import { answerWorkspace } from './taskAnswers.js';
import { maskText } from './lib.js';
import { api } from './api.js';
import { isTaskRequest, startTaskDialog, advanceTaskDialog, applyTaskIntake } from './taskDialog.js';

const welcome = 'Hi! Ask about this client’s tasks, priorities, blockers or goals. To add work, describe the task and I’ll ask useful questions only when needed. Reopen a saved chat to continue earlier discussions. You can type or use the mic.';
const message = (role, content, extra = {}) => ({ id: crypto.randomUUID(), role, content: content.slice(0, 6000), ...extra });
export default function VoiceAssistant({ demo, clientId = null, clientName = 'Workspace' }) {
  const [open, setOpen] = useState(false);
  const chatVisible = useRef(false), launcher = useRef(null), panel = useRef(null);
  const [question, setQuestion] = useState(''), [messages, setMessages] = useState([]);
  const [lang, setLang] = useState('en-IN'), [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [taskDraft, setTaskDraft] = useState(null);
  const [conversations, setConversations] = useState([]), [conversationId, setConversationId] = useState(null);
  const [loadingChat, setLoadingChat] = useState(true), [saveError, setSaveError] = useState(''), [earlierMessages, setEarlierMessages] = useState(false);
  const [firstMessageId, setFirstMessageId] = useState(null);
  const savedChat = useRef(null), mounted = useRef(true);
  const recognition = useRef(null), request = useRef(null), transcript = useRef(null), inFlight = useRef(false);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const display = value => demo ? maskText(value) : value;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; recognition.current?.abort(); request.current?.abort(); window.speechSynthesis?.cancel(); }; }, []);
  const lastChatKey = `i2i-last-chat:${clientId || 'workspace'}`;
  const remember = id => { try { localStorage.setItem(lastChatKey, id); } catch {} };
  function showConversation(record) {
    savedChat.current = { id: record.id, revision: record.revision, title: record.title };
    setConversationId(record.id); setMessages(record.messages || []); setTaskDraft(record.taskDraft || null);
    setLang(record.language || 'en-IN'); setEarlierMessages(!!record.hasEarlierMessages); setFirstMessageId(record.firstMessageId);
    setQuestion(''); setError(''); setSaveError(''); remember(record.id);
  }
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const list = await api.conversations(clientId, controller.signal);
        if (controller.signal.aborted) return;
        setConversations(list);
        let last; try { last = localStorage.getItem(lastChatKey); } catch {}
        const id = list.find(c => c.id === last)?.id || list[0]?.id;
        if (id) {
          const record = await api.conversation(id, clientId, controller.signal);
          if (!controller.signal.aborted) showConversation(record);
        }
      } catch (e) { if (!controller.signal.aborted) setSaveError('Saved chats could not load: ' + e.message); }
      finally { if (!controller.signal.aborted) setLoadingChat(false); }
    })();
    return () => controller.abort();
  }, [clientId]);
  async function openConversation(id) {
    if (!id || inFlight.current) return;
    setLoadingChat(true); window.speechSynthesis?.cancel();
    try { showConversation(await api.conversation(id, clientId)); }
    catch (e) { setSaveError('Could not open that chat: ' + e.message); }
    finally { setLoadingChat(false); }
  }
  async function newChat() {
    if (inFlight.current) return;
    setLoadingChat(true); window.speechSynthesis?.cancel();
    try {
      const record = await api.newConversation(clientId);
      showConversation(record); setConversations(previous => [record, ...previous]);
    } catch (e) { setSaveError('Could not create a saved chat: ' + e.message); }
    finally { setLoadingChat(false); }
  }
  async function loadEarlier() {
    if (inFlight.current || !conversationId || !firstMessageId) return;
    setLoadingChat(true);
    try {
      const record = await api.conversation(conversationId, clientId, undefined, firstMessageId);
      setMessages(previous => [...record.messages, ...previous]);
      setEarlierMessages(!!record.hasEarlierMessages); setFirstMessageId(record.firstMessageId);
    } catch (e) { setSaveError('Earlier messages could not load: ' + e.message); }
    finally { setLoadingChat(false); }
  }
  async function reloadHistories() {
    if (inFlight.current) return;
    setLoadingChat(true);
    try { setConversations(await api.conversations(clientId)); setSaveError(''); }
    catch (e) { setSaveError('Saved chats could not load: ' + e.message); }
    finally { setLoadingChat(false); }
  }
  async function persist(nextMessages, nextDraft) {
    try {
      let current = savedChat.current;
      if (!current) {
        const record = await api.newConversation(clientId);
        current = { id: record.id, revision: record.revision, title: record.title }; savedChat.current = current;
        if (mounted.current) setConversationId(record.id);
        remember(record.id);
      }
      const record = await api.saveConversation(current.id, { clientId, messages: nextMessages.slice(-400), taskDraft: nextDraft, language: lang, revision: current.revision, title: current.title && current.title !== 'New conversation' ? current.title : nextMessages.find(m => m.role === 'user')?.content.slice(0, 100) || 'New conversation' });
      if (savedChat.current?.id !== current.id) return record.id;
      savedChat.current = { id: record.id, revision: record.revision, title: record.title };
      if (mounted.current) { setSaveError(''); setConversations(previous => [record, ...previous.filter(c => c.id !== record.id)].slice(0, 100)); }
      return record.id;
    } catch (e) {
      if (mounted.current) setSaveError('Chat history could not be saved: ' + e.message + ' Keep this tab open until it is saved.');
      return null;
    }
  }
  async function retrySaving() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await persist(messages, taskDraft); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => { window.speechSynthesis?.cancel(); }, [demo]);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, busy, open]);
  function closeChat() {
    chatVisible.current = false; setOpen(false);
    recognition.current?.abort(); setListening(false); window.speechSynthesis?.cancel();
    launcher.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const input = document.getElementById('voice-question');
    (input && !input.disabled ? input : panel.current)?.focus();
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); closeChat(); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  function speak(text, language = lang) {
    if (!chatVisible.current) return;
    if (!window.speechSynthesis) { setError('Audio output is unavailable here. Your reply is shown in chat.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(display(text));
    utterance.lang = language;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase() === language.toLowerCase());
    if (voice) utterance.voice = voice;
    utterance.onerror = e => { if (!['interrupted', 'canceled'].includes(e.error)) setError('Audio playback failed. Use Read reply to try again.'); };
    window.speechSynthesis.speak(utterance);
  }
  async function ask(value) {
    if (!value.trim() || inFlight.current || loadingChat) return;
    inFlight.current = true; window.speechSynthesis?.cancel();
    const history = messages.filter(m => !m.failed).slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 6000) }));
    let nextMessages = [...messages, message('user', value)];
    setMessages(nextMessages);
    setQuestion(''); setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 40000);
    let activeDraft = taskDraft;
    try {
      let step = taskDraft || isTaskRequest(value) ? (taskDraft ? advanceTaskDialog(taskDraft, value, lang === 'hi-IN') : startTaskDialog(value, lang === 'hi-IN')) : null;
      if (step) {
        step.draft = { ...step.draft, clientId };
        activeDraft = step.cancelled ? null : step.draft;
        if (mounted.current) setTaskDraft(activeDraft);
      }
      // Save the latest answer and resulting draft before requesting task understanding.
      const id = await persist(nextMessages, activeDraft);
      if (controller.signal.aborted) throw new DOMException('Request timed out', 'AbortError');
      if (step) {
        if (step.needsIntake) {
          setTaskDraft(step.draft);
          let context = { history: messages.filter(m => !m.failed).slice(-40).map(({ role, content }) => ({ role, content })), memory: '' };
          if (id) context = await api.conversationContext(id, clientId, value, controller.signal);
          const intake = await api.taskIntake({ draft: step.draft, message: value, language: lang, clientName, history: context.history, memory: context.memory });
          step = applyTaskIntake(step.draft, intake, lang === 'hi-IN');
          activeDraft = step.draft;
        }
        if (controller.signal.aborted) throw new DOMException('Request timed out', 'AbortError');
        let content = step.reply;
        let savedTaskKey;
        let nextDraft = step.cancelled ? null : step.draft;
        if (step.confirm) {
          // Only an explicit confirmation of a completed preview can reach the write API.
          const saved = await api.createTask(step.draft);
          savedTaskKey = saved.taskKey;
          content = lang === 'hi-IN' ? `Task “${saved.title}” save हो गया। अब इसे goal से link कर सकते हो, या इसके बारे में पूछ सकते हो।` : `Task “${saved.title}” was added to your workspace. You can now link it to a goal or ask about its status.`;
          nextDraft = null;
        }
        activeDraft = nextDraft;
        nextMessages = [...nextMessages, message('assistant', content, { source: 'task-draft', language: lang, savedTaskKey })];
        if (mounted.current) { setTaskDraft(nextDraft); setMessages(nextMessages); }
        await persist(nextMessages, nextDraft);
        if (mounted.current && !controller.signal.aborted && autoSpeak) speak(content);
        return;
      }
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: value, history, language: lang, clientId, conversationId: id || undefined }) });
      if (!response.ok) throw Error('Chat could not connect. Check the backend and try again.');
      const reply = await response.json();
      let content = reply.answer;
      if (reply.source === 'rules') {
        if (/how.*(app|workspace)|what.*(app|you).*do|help|features/i.test(value)) {
          content = 'I2I By AI adapts your dashboard for meetings, usage investigation, and overdue work. Use Add task at the bottom to save work with an owner, due date, priority, status, and blocker reason. Create goals and link tasks to track progress and gaps. Notifications warn three days and one day before a due date, plus overdue work and blockers. Enable desktop alerts in that card for alerts while the app is open. Customer email, WhatsApp and SMS settings are available; delivery is waiting for provider setup.';
        } else {
          const records = await Promise.all(['/api/goals/tasks', '/api/goals', '/api/mentor/status'].map(async path => {
            const r = await fetch(path, { signal: controller.signal });
            if (!r.ok) throw Error('Could not load workspace records. Check MongoDB and retry.');
            return r.json();
          }));
          let [tasks, goals, report] = records;
          if (!Array.isArray(tasks) || !Array.isArray(goals)) throw Error('Invalid workspace records.');
          if (clientId) {
            tasks = tasks.filter(t => t.clientId === clientId);
            const keys = new Set(tasks.map(t => t.taskKey));
            goals = goals.filter(g => g.taskKeys?.length && g.taskKeys.every(k => keys.has(k)));
            const goalTitles = new Set(goals.map(g => g.title));
            report = { ...report, recommendations: (report.recommendations || []).filter(r => goalTitles.has(r.title)) };
          }
          content = /\b(it|that|they|them)\b|उसका|उसकी/i.test(value)
            ? 'AI is unavailable, so I cannot reliably resolve that follow-up. Please include the full task or goal name.'
            : answerWorkspace(value, tasks, goals, report, lang === 'hi-IN');
        }
      }
      if (typeof content !== 'string' || !content.trim()) throw Error('No reply received. Please try again.');
      nextMessages = [...nextMessages, message('assistant', content, { source: reply.source, reason: reply.reason, language: lang, partial: reply.partial || reply.historyPartial })];
      if (mounted.current) setMessages(nextMessages);
      await persist(nextMessages, null);
      if (mounted.current && !controller.signal.aborted && autoSpeak) speak(content);
    } catch (e) {
      nextMessages = [...nextMessages, message('assistant', ['AbortError', 'TimeoutError'].includes(e.name) ? (taskDraft ? 'The request timed out. Your draft is available. If you were saving, check the task list before confirming again.' : 'The reply timed out. Please try again.') : e.message, { failed: true })];
      await persist(nextMessages, activeDraft);
      if (mounted.current) { setMessages(nextMessages); setTaskDraft(activeDraft); setQuestion(value); }
    } finally { clearTimeout(timeout); inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    if (!Recognition || inFlight.current) return;
    window.speechSynthesis?.cancel(); setError('');
    const mic = new Recognition(); recognition.current = mic;
    mic.lang = lang; mic.interimResults = false; mic.continuous = false;
    mic.onstart = () => { if (chatVisible.current) setListening(true); else mic.abort(); };
    mic.onend = () => setListening(false);
    mic.onresult = e => { if (chatVisible.current) ask(e.results[0][0].transcript); };
    mic.onerror = e => { if (chatVisible.current) setError(e.error === 'not-allowed' ? 'Allow microphone access in browser settings, or type your message.' : `Voice input failed (${e.error}). You can type instead.`); };
    try { mic.start(); } catch { setError('Could not start the microphone. Try again.'); }
  }
  return <>
    <button type="button" className="chat-launcher" ref={launcher} aria-label={open ? 'Hide I2I Chat' : 'Open I2I Chat'} aria-expanded={open} aria-controls="i2i-chat-panel" title="I2I Chat" onClick={() => { if (open) closeChat(); else { chatVisible.current = true; setOpen(true); } }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 11h8M8 14h5" /></svg>
    </button>
    <section className="card voice-assistant workspace-chat chat-floating-panel" id="i2i-chat-panel" hidden={!open} ref={panel} tabIndex={-1} role="dialog" aria-modal="false" aria-label="I2I Chat">
    <div className="chat-heading"><div><h2>I2I Chat</h2><p className="sub">{display(clientName)} · Type or talk. Continue where you left off.</p></div><div className="chat-heading-actions"><button className="chip" disabled={busy || listening || loadingChat} onClick={newChat}>New chat</button><button type="button" className="chat-close" aria-label="Close I2I Chat" title="Close chat" onClick={closeChat}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></div>
    <div className="chat-history-controls"><label htmlFor="saved-chat">Saved chats for {display(clientName)}<select id="saved-chat" value={conversationId || ''} disabled={busy || listening || loadingChat} onChange={e => openConversation(e.target.value)}><option value="" disabled>Choose a saved chat</option>{conversations.map(c => <option key={c.id} value={c.id}>{display(c.title || 'New chat')}</option>)}</select></label><p className="fine">Choose a previous chat to continue it. Change Client in the sidebar to see that client’s history.</p></div>
    {loadingChat && <p role="status" className="fine">Loading saved conversation…</p>}
    {saveError && <p role="alert" className="clar">{saveError} {saveError.startsWith('Saved chats could not load:') ? <button className="chip" disabled={busy || listening || loadingChat} onClick={reloadHistories}>Reload saved chats</button> : <button className="chip" disabled={busy || listening || loadingChat} onClick={retrySaving}>Retry saving</button>}{conversationId && <button className="chip" disabled={busy || listening || loadingChat} onClick={() => openConversation(conversationId)}>Reload saved chat</button>}</p>}
    {earlierMessages && <p className="fine">Earlier messages remain saved and are searched for relevant context. <button className="chip" disabled={busy || listening || loadingChat} onClick={loadEarlier}>Load earlier messages</button></p>}
    <div className="chat-transcript" ref={transcript} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" tabIndex={0}>
      <article className="chat-message assistant"><b>I2I assistant</b><p>{welcome}</p></article>
      {messages.map((m, i) => <article key={i} className={`chat-message ${m.role}${m.failed ? ' chat-failed' : ''}`}><b>{m.role === 'user' ? 'You' : 'I2I assistant'}</b><p>{display(m.content)}</p>{m.role === 'assistant' && !m.failed && <div className="chat-message-tools"><small>{m.source === 'task-draft' ? 'Task setup' : m.source === 'llm' ? 'AI · workspace records' : 'Rules fallback · workspace records'}</small><button type="button" className="chip" onClick={() => speak(m.content, m.language)}>Read reply</button>{m.savedTaskKey && <a href={`#task-${m.savedTaskKey}`}>View saved task</a>}{m.reason && <small>{m.reason}</small>}{m.partial && <small>Limited snapshot; ask about a specific task or goal.</small>}</div>}</article>)}
      {busy && <p className="fine" role="status">{taskDraft?.field === 'intake' ? 'Understanding your task…' : 'Checking this conversation and client’s records…'}</p>}
    </div>
    {taskDraft && <p className="note" role="status">Task draft for {display(clientName)} · {taskDraft.field === 'review' ? 'Review the details and confirm to add the task.' : taskDraft.field === 'intake' ? 'Reading the task brief.' : `Waiting for ${({ title: 'task details', context: 'a useful task detail (optional)', owner: 'owner', dueDate: 'due date', priority: 'priority', status: 'status', blocker: 'blocker reason' })[taskDraft.field]}.`} The draft is kept with this chat; the task has not been added yet.</p>}
    {taskDraft ? <div className="chips">
      {taskDraft.field === 'priority' && ['High', 'Medium', 'Low'].map(choice => <button key={choice} className="chip" disabled={busy || listening} onClick={() => ask(choice)}>{choice}</button>)}
      {taskDraft.field === 'status' && ['Open', 'In progress', 'Blocked', 'Done'].map(choice => <button key={choice} className="chip" disabled={busy || listening} onClick={() => ask(choice)}>{choice}</button>)}
      {['context', 'intake'].includes(taskDraft.field) && <button className="chip" disabled={busy || listening || loadingChat} onClick={() => ask('skip')}>Skip extra questions</button>}
      {taskDraft.field === 'dueDate' && <><button className="chip" disabled={busy || listening} onClick={() => ask('today')}>Today</button><button className="chip" disabled={busy || listening} onClick={() => ask('tomorrow')}>Tomorrow</button><input className="chat-date" type="date" aria-label="Choose task due date" disabled={busy || listening} onChange={e => { if (e.target.value) ask(e.target.value); }} /></>}
      {taskDraft.field === 'review' && <><button className="btn sm" disabled={busy || listening} onClick={() => ask('Confirm')}>Confirm and add task</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit title')}>Edit title</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit owner')}>Edit owner</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit due date')}>Edit due date</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit priority')}>Edit priority</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit status')}>Edit status</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit blocker')}>Edit reason</button></>}
      <button className="chip" disabled={busy || listening} onClick={() => ask('cancel')}>Cancel task</button>
    </div> : <div className="chips">{['Add a task', 'Priority tasks', 'Blocked tasks', 'Project status report', 'What should we do next?', 'How does this app work?'].map(q => <button key={q} className="chip" disabled={busy || listening || loadingChat} onClick={() => ask(q)}>{q}</button>)}</div>}
    <form onSubmit={e => { e.preventDefault(); ask(question); }}>
      <label htmlFor="voice-question">Message I2I</label>
      <div className="ask voice-input">
        <input id="voice-question" required maxLength={2000} disabled={busy || listening || loadingChat} value={question} onChange={e => setQuestion(e.target.value)} placeholder={taskDraft ? 'Reply with the task details…' : 'e.g. Add a task based on our earlier discussion'} />
        <button type="button" className="btn voice-mic" disabled={!Recognition || busy || loadingChat} onClick={listen} aria-label={listening ? 'Stop microphone' : 'Ask using microphone'} aria-pressed={listening} title={!Recognition ? 'Voice input requires a supported browser, such as Chrome' : 'Voice message'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>{listening ? 'Stop mic' : 'Mic'}
        </button>
        <button className="btn" disabled={busy || listening || loadingChat || !question.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
      </div>
      <div className="chat-controls"><label htmlFor="voice-language">Language <select id="voice-language" value={lang} disabled={listening || busy} onChange={e => setLang(e.target.value)}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi / Hinglish</option></select></label><label className="voice-toggle"><input type="checkbox" checked={autoSpeak} onChange={e => { setAutoSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Speak replies</label><button type="button" className="chip" onClick={() => window.speechSynthesis?.cancel()}>Stop audio</button></div>
    </form>
    {listening && <p role="status">Listening… Speak your question.</p>}
    {error && <p role="alert" className="clar">{error}</p>}
    {!Recognition && <p className="fine">Mic input is unavailable here. Open in Chrome, or type your message.</p>}
    <div className="chat-footer"><p className="fine">Chats and task drafts are saved for the selected client. New tasks are added only after you review and confirm. Long conversations use recent messages and relevant earlier context; ask with a task name if a reference is unclear. Check important AI answers against the records. Voice recognition may use your browser’s online service.</p></div>
  </section></>;
}
