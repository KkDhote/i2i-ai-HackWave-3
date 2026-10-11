import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { maskText } from './lib.js';

// Action preview + approval: the AI drafts, you read it, edit it, and only YOU approve.
export default function ActionModal({ action, mode, clientId, masked, onClose, onApproved }) {
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement; box.current?.focus();
    api.action({ action, mode, clientId }).then(d => { setDraft(d); setSubject(d.subject); setBody(d.body); })
      .catch(e => setErr(e.name === 'TimeoutError' ? 'Drafting took too long. Please try again.' : e.message));
    return () => prev?.focus?.();
  }, []);
  const show = (s) => masked ? maskText(s) : s;
  const approve = () => {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    onApproved(action); onClose();
  };
  const copy = async () => { await navigator.clipboard?.writeText(subject + '\n\n' + body); setCopied(true); };
  return (
    <div className="overlay" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="am-t" tabIndex={-1} ref={box}>
        <h2 id="am-t">Action preview: {action}</h2>
        <p className="sub">Nothing happens until you approve. You can edit the message first.</p>
        {!draft && !err && <p role="status">Drafting from your workspace data...</p>}
        {err && <p className="clar" role="alert">{err}</p>}
        {draft && <>
          <label>To</label><div>{show(draft.to)}</div>
          <label htmlFor="am-s">Subject</label>
          <input id="am-s" value={show(subject)} readOnly={masked} onChange={e => setSubject(e.target.value)} />
          <label htmlFor="am-b">Message</label>
          <textarea id="am-b" rows="10" value={show(body)} readOnly={masked} onChange={e => setBody(e.target.value)} />
          <details open><summary>Based on {draft.evidence.length} facts from your workspace</summary>
            <ul>{draft.evidence.map((e, i) => <li key={i}>{show(e)}</li>)}</ul></details>
          <p className="fine">Drafted by {draft.source === 'llm' ? 'AI' : 'a built-in template (AI unavailable)'}. Approve opens your email app with this text. The recipient is chosen there.</p>
          {masked && <p className="fine"><b>Demo mode is on: approving is disabled.</b></p>}
        </>}
        <div className="row-btns">
          <button className="btn" onClick={approve} disabled={!draft || masked}>Approve and open in email app</button>
          <button className="btn ghost" onClick={copy} disabled={!draft || masked}>{copied ? 'Copied' : 'Copy'}</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
