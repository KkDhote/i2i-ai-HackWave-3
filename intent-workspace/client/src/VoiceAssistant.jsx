import { useEffect, useRef, useState } from 'react';
import { answerWorkspace } from './taskAnswers.js';
import { maskText } from './lib.js';

export default function VoiceAssistant({ demo }) {
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState('');
  const [lang, setLang] = useState('en-IN'), [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const recognition = useRef(null), request = useRef(null);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const displayed = demo ? maskText(answer) : answer;
  useEffect(() => () => { recognition.current?.abort(); request.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { window.speechSynthesis?.cancel(); }, [demo]);
  function speak(text) {
    if (!window.speechSynthesis) { setError('Audio output is unavailable in this browser. Your answer is shown below.'); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.toLowerCase() === lang.toLowerCase());
    if (voice) utterance.voice = voice;
    utterance.onerror = e => { if (!['interrupted', 'canceled'].includes(e.error)) setError('Audio playback failed. Use Read answer to try again.'); };
    window.speechSynthesis.speak(utterance);
  }
  async function ask(value) {
    if (!value.trim()) return;
    setQuestion(value); setBusy(true); setError(''); setAnswer('');
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const needsGoals = /goal|progress|complete|project|next|recommend|प्रगति|गोल|परियोजना|अगला|आगे/i.test(value);
      const paths = needsGoals ? ['/api/goals/tasks', '/api/goals', '/api/mentor/status'] : ['/api/goals/tasks'];
      const records = await Promise.all(paths.map(async path => {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw Error('Could not load workspace records. Check the backend and MongoDB.');
        return response.json();
      }));
      const [tasks, goals = [], report = {}] = records;
      if (!Array.isArray(tasks)) throw Error('The server returned an invalid task list.');
      const result = answerWorkspace(value, tasks, goals, report, lang === 'hi-IN');
      setAnswer(result); if (autoSpeak) speak(demo ? maskText(result) : result);
    } catch (e) { setError(e.name === 'AbortError' ? 'Task lookup timed out. Try again.' : e.message); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  function listen() {
    if (listening) { recognition.current?.stop(); return; }
    window.speechSynthesis?.cancel(); setError('');
    const mic = new Recognition(); recognition.current = mic;
    mic.lang = lang; mic.interimResults = false; mic.continuous = false;
    mic.onstart = () => setListening(true);
    mic.onend = () => setListening(false);
    mic.onresult = e => ask(e.results[0][0].transcript);
    mic.onerror = e => setError(e.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in browser settings, or type your question.' : `Voice input failed (${e.error}). You can type your question instead.`);
    try { mic.start(); } catch { setError('Could not start the microphone. Try again.'); }
  }
  return <section className="card voice-assistant" aria-label="Voice task assistant">
    <h2>Ask Your Workspace · Voice Assistant</h2>
    <p className="sub">Ask for status, priorities, and recorded hurdles across workspace tasks.</p>
    <form onSubmit={e => { e.preventDefault(); ask(question); }}>
      <label htmlFor="voice-language">Voice language</label>
      <select id="voice-language" value={lang} disabled={listening || busy} onChange={e => setLang(e.target.value)}><option value="en-IN">English (India)</option><option value="hi-IN">Hindi / Hinglish</option></select>
      <label htmlFor="voice-question">Your task question</label>
      <div className="ask voice-input">
        <input id="voice-question" required value={question} onChange={e => setQuestion(e.target.value)} placeholder="Which tasks are highest priority?" />
        <button type="button" className="btn voice-mic" disabled={!Recognition || busy} onClick={listen} aria-label={listening ? 'Stop microphone' : 'Ask using microphone'} aria-pressed={listening} title={!Recognition ? 'Voice input requires a supported browser, such as Chrome' : listening ? 'Stop listening' : 'Start voice input'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
          {listening ? 'Stop mic' : 'Mic'}
        </button>
        <button className="btn" disabled={busy || listening}>{busy ? 'Checking…' : 'Ask'}</button>
      </div>
      <div className="chips"><button type="button" className="chip" disabled={!answer} onClick={() => speak(displayed)}>Read answer</button><button type="button" className="chip" onClick={() => window.speechSynthesis?.cancel()}>Stop audio</button></div>
      <label className="voice-toggle"><input type="checkbox" checked={autoSpeak} onChange={e => { setAutoSpeak(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Speak answers automatically</label>
    </form>
    {!Recognition && <p className="fine">Voice input is unavailable here. Open this app in Chrome, or type your question.</p>}
    <div className="chips">{['Priority tasks', 'Pending tasks', 'Blocked tasks', 'Project status report', 'What should we do next?'].map(q => <button key={q} className="chip" disabled={busy || listening} onClick={() => ask(q)}>{q}</button>)}</div>
    {listening && <p role="status">Listening…</p>}
    {error && <p role="alert" className="clar">{error}</p>}
    {answer && <p className="note voice-answer" role="status">{displayed}</p>}
    <p className="fine">Answers use task records and goal-linked rules, not AI-generated guesses. Voice questions do not create or change tasks. Speech recognition may use your browser’s online service.</p>
  </section>;
}
