import { useEffect, useRef, useState } from 'react';
import { answerWorkspace } from './taskAnswers.js';
import { maskText } from './lib.js';
import { api } from './api.js';
import { isTaskRequest, startTaskDialog, advanceTaskDialog } from './taskDialog.js';

const welcome = 'Hi! I’m your I2I workspace assistant. Ask about task status, priorities, blockers, goal progress, or how to use this app. Say “Add a task” and I’ll ask for the details. You can type or use the mic.';
export default function VoiceAssistant({ demo }) {
  const [question, setQuestion] = useState(''), [messages, setMessages] = useState([]);
  const [lang, setLang] = useState('en-IN'), [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [taskDraft, setTaskDraft] = useState(null);
  const recognition = useRef(null), request = useRef(null), transcript = useRef(null), inFlight = useRef(false);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const display = value => demo ? maskText(value) : value;
  useEffect(() => () => { recognition.current?.abort(); request.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { window.speechSynthesis?.cancel(); }, [demo]);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, busy]);
  function speak(text, language = lang) {
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
    if (!value.trim() || inFlight.current) return;
    inFlight.current = true; window.speechSynthesis?.cancel();
    const history = messages.filter(m => !m.failed).slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 6000) }));
    setMessages(previous => [...previous, { role: 'user', content: value }]);
    setQuestion(''); setBusy(true); setError('');
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 40000);
    try {
      if (taskDraft || isTaskRequest(value)) {
        const step = taskDraft ? advanceTaskDialog(taskDraft, value, lang === 'hi-IN') : startTaskDialog(value, lang === 'hi-IN');
        let content = step.reply;
        let savedTaskKey;
        if (step.confirm) {
          // Only an explicit confirmation of a completed preview can reach the write API.
          const saved = await api.createTask(step.draft);
          savedTaskKey = saved.taskKey;
          content = lang === 'hi-IN' ? `Task “${saved.title}” save हो गया। अब इसे goal से link कर सकते हो, या इसके बारे में पूछ सकते हो।` : `Task “${saved.title}” was added to your workspace. You can now link it to a goal or ask about its status.`;
          setTaskDraft(null);
        } else setTaskDraft(step.cancelled ? null : step.draft);
        setMessages(previous => [...previous, { role: 'assistant', content, source: 'task-draft', language: lang, savedTaskKey }]);
        if (autoSpeak) speak(content);
        return;
      }
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: value, history, language: lang }) });
      if (!response.ok) throw Error('Chat could not connect. Check the backend and try again.');
      const reply = await response.json();
      let content = reply.answer;
      if (reply.source === 'rules') {
        if (/how.*(app|workspace)|what.*(app|you).*do|help|features/i.test(value)) {
          content = 'I2I By AI adapts your dashboard for meetings, usage investigation, and overdue work. Use Add task at the bottom to save work with an owner, due date, priority, status, and blocker reason. Create goals and link tasks to track progress and gaps. Notifications warn three days and one day before a due date, plus overdue work and blockers. Enable desktop alerts in that card for alerts while the app is open. Customer email, WhatsApp and SMS settings are available; delivery is waiting for provider setup. You can also record decisions, preview approvals, simulate completion, and export a handoff.';
        } else {
          const records = await Promise.all(['/api/goals/tasks', '/api/goals', '/api/mentor/status'].map(async path => {
            const r = await fetch(path, { signal: controller.signal });
            if (!r.ok) throw Error('Could not load workspace records. Check MongoDB and retry.');
            return r.json();
          }));
          const [tasks, goals, report] = records;
          if (!Array.isArray(tasks) || !Array.isArray(goals)) throw Error('Invalid workspace records.');
          content = /\b(it|that|they|them)\b|उसका|उसकी/i.test(value)
            ? 'AI is unavailable, so I cannot reliably resolve that follow-up. Please include the full task or goal name.'
            : answerWorkspace(value, tasks, goals, report, lang === 'hi-IN');
        }
      }
      if (typeof content !== 'string' || !content.trim()) throw Error('No reply received. Please try again.');
      setMessages(previous => [...previous, { role: 'assistant', content, source: reply.source, reason: reply.reason, language: lang, partial: reply.partial }]);
      if (autoSpeak) speak(content);
    } catch (e) {
      setMessages(previous => [...previous, { role: 'assistant', content: ['AbortError', 'TimeoutError'].includes(e.name) ? (taskDraft ? 'Saving timed out. Check the task list before confirming again; the draft is still available.' : 'The reply timed out. Please try again.') : e.message, failed: true }]);
      setQuestion(value);
    } finally { clearTimeout(timeout); inFlight.current = false; setBusy(false); }
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    if (!Recognition || inFlight.current) return;
    window.speechSynthesis?.cancel(); setError('');
    const mic = new Recognition(); recognition.current = mic;
    mic.lang = lang; mic.interimResults = false; mic.continuous = false;
    mic.onstart = () => setListening(true);
    mic.onend = () => setListening(false);
    mic.onresult = e => ask(e.results[0][0].transcript);
    mic.onerror = e => setError(e.error === 'not-allowed' ? 'Allow microphone access in browser settings, or type your message.' : `Voice input failed (${e.error}). You can type instead.`);
    try { mic.start(); } catch { setError('Could not start the microphone. Try again.'); }
  }
  return <section className="card voice-assistant workspace-chat" aria-label="Workspace chatbot">
    <div className="chat-heading"><div><h2>I2I Chat</h2><p className="sub">Your workspace, explained. Type or talk.</p></div><button className="chip" disabled={busy || listening || !messages.length} onClick={() => { setMessages([]); setTaskDraft(null); setQuestion(''); setError(''); window.speechSynthesis?.cancel(); }}>New chat</button></div>
    <div className="chat-transcript" ref={transcript} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" tabIndex={0}>
      <article className="chat-message assistant"><b>I2I assistant</b><p>{welcome}</p></article>
      {messages.map((m, i) => <article key={i} className={`chat-message ${m.role}${m.failed ? ' chat-failed' : ''}`}><b>{m.role === 'user' ? 'You' : 'I2I assistant'}</b><p>{display(m.content)}</p>{m.role === 'assistant' && !m.failed && <div className="chat-message-tools"><small>{m.source === 'task-draft' ? 'Task setup' : m.source === 'llm' ? 'AI · workspace records' : 'Rules fallback · workspace records'}</small><button type="button" className="chip" onClick={() => speak(m.content, m.language)}>Read reply</button>{m.savedTaskKey && <a href={`#task-${m.savedTaskKey}`}>View saved task</a>}{m.reason && <small>{m.reason}</small>}{m.partial && <small>Limited snapshot; ask about a specific task or goal.</small>}</div>}</article>)}
      {busy && <p className="fine" role="status">Checking your workspace…</p>}
    </div>
    {taskDraft && <p className="note" role="status">Task draft · {taskDraft.field === 'review' ? 'Review the details and confirm to save.' : `Waiting for ${({ title: 'task title', owner: 'owner', dueDate: 'due date', priority: 'priority', status: 'status', blocker: 'blocker reason' })[taskDraft.field]}.`} This draft is not saved yet.</p>}
    {taskDraft ? <div className="chips">
      {taskDraft.field === 'priority' && ['High', 'Medium', 'Low'].map(choice => <button key={choice} className="chip" disabled={busy || listening} onClick={() => ask(choice)}>{choice}</button>)}
      {taskDraft.field === 'status' && ['Open', 'In progress', 'Blocked', 'Done'].map(choice => <button key={choice} className="chip" disabled={busy || listening} onClick={() => ask(choice)}>{choice}</button>)}
      {taskDraft.field === 'dueDate' && <><button className="chip" disabled={busy || listening} onClick={() => ask('today')}>Today</button><button className="chip" disabled={busy || listening} onClick={() => ask('tomorrow')}>Tomorrow</button><input className="chat-date" type="date" aria-label="Choose task due date" disabled={busy || listening} onChange={e => { if (e.target.value) ask(e.target.value); }} /></>}
      {taskDraft.field === 'review' && <><button className="btn sm" disabled={busy || listening} onClick={() => ask('Confirm')}>Confirm and add task</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit title')}>Edit title</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit owner')}>Edit owner</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit due date')}>Edit due date</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit priority')}>Edit priority</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit status')}>Edit status</button><button className="chip" disabled={busy || listening} onClick={() => ask('edit blocker')}>Edit reason</button></>}
      <button className="chip" disabled={busy || listening} onClick={() => ask('cancel')}>Cancel task</button>
    </div> : <div className="chips">{['Add a task', 'Priority tasks', 'Blocked tasks', 'Project status report', 'What should we do next?', 'How does this app work?'].map(q => <button key={q} className="chip" disabled={busy || listening} onClick={() => ask(q)}>{q}</button>)}</div>}
    <form onSubmit={e => { e.preventDefault(); ask(question); }}>
      <label htmlFor="voice-question">Message I2I</label>
      <div className="ask voice-input">
        <input id="voice-question" required maxLength={2000} disabled={busy || listening} value={question} onChange={e => setQuestion(e.target.value)} placeholder={taskDraft ? 'Reply with the task details…' : 'e.g. Why is UPI integration blocked?'} />
        <button type="button" className="btn voice-mic" disabled={!Recognition || busy} onClick={listen} aria-label={listening ? 'Stop microphone' : 'Ask using microphone'} aria-pressed={listening} title={!Recognition ? 'Voice input requires a supported browser, such as Chrome' : 'Voice message'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>{listening ? 'Stop mic' : 'Mic'}
        </button>
        <button className="btn" disabled={busy || listening || !question.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
      </div>
      <div className="chat-controls"><label htmlFor="voice-language">Language <select id="voice-language" value={lang} disabled={listening || busy} onChange={e => setLang(e.target.value)}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi / Hinglish</option></select></label><label className="voice-toggle"><input type="checkbox" checked={autoSpeak} onChange={e => { setAutoSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Speak replies</label><button type="button" className="chip" onClick={() => window.speechSynthesis?.cancel()}>Stop audio</button></div>
    </form>
    {listening && <p role="status">Listening… Speak your question.</p>}
    {error && <p role="alert" className="clar">{error}</p>}
    {!Recognition && <p className="fine">Mic input is unavailable here. Open in Chrome, or type your message.</p>}
    <p className="fine">New tasks are saved only after you review and confirm. Chat does not send external actions. Check important AI answers against the records. Unsaved chats and drafts reset on refresh. Voice recognition may use your browser’s online service.</p>
  </section>;
}
