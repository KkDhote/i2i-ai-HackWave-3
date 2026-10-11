import { useEffect, useRef, useState } from 'react';
import { api } from './api';

export default function EvalPanel({ onClose, onFixed }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const box = useRef(null);
  const run = async (mode) => { setBusy(mode); setErr(''); try { setRes(await api.eval(mode)); } catch (e) { setErr(e.message); } setBusy(''); };
  useEffect(() => { const prev = document.activeElement; box.current?.focus(); run('rules'); return () => prev?.focus?.(); }, []);
  return (
    <div className="overlay" onKeyDown={e => e.key === 'Escape' && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="ev-t" tabIndex={-1} ref={box}>
        <h2 id="ev-t">Evaluation and comparison</h2>
        <div className="row-btns" style={{ marginTop: 6 }}>
          <button className="btn ghost sm" onClick={() => run('rules')} disabled={!!busy}>Run with built-in rules (instant)</button>
          <button className="btn ghost sm" onClick={() => run('llm')} disabled={!!busy}>Run with AI (about 15 s)</button>
        </div>
        {busy && <p role="status">Running 30 test prompts{busy === 'llm' ? ' through the AI' : ''}...</p>}
        {err && <p className="clar" role="alert">{err}</p>}
        {res && <>
          <h3 className="mt">1. Intent accuracy: {res.mode}</h3>
          <p><span className="acc">{res.accuracy}%</span> correct ({res.correct} of {res.total} test prompts)</p>
          <p className="fine">Each prompt has a correct answer: a task, or "none" when the system should ask or decline instead of guessing.
            By task: {Object.entries(res.byIntent).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(', ')}.</p>
          <details><summary>See every prompt</summary><div className="tw"><table><thead><tr><th scope="col">Prompt</th><th scope="col">Expected</th><th scope="col">Got</th><th scope="col">Result</th></tr></thead>
            <tbody>{res.rows.map((r, i) => <tr key={i}><td>{r.text}</td><td>{r.expected}</td><td>{r.got}</td><td><span className={'tag ' + (r.ok ? 't-ok' : 't-bad')}>{r.ok ? 'Right' : 'Wrong'}</span></td></tr>)}</tbody></table></div></details>
          <h3 className="mt">2. Adaptive screen vs fixed dashboard</h3>
          <div className="tw"><table><thead><tr><th scope="col">Goal</th><th scope="col">Widgets to scan</th><th scope="col">Steps to get there</th></tr></thead>
            <tbody>{res.comparison.map(c => <tr key={c.task}><td>{c.task}</td>
              <td>{c.shown} of {c.total} ({Math.round(100 * (1 - c.shown / c.total))}% fewer)</td>
              <td>Adaptive {c.adaptiveSteps} vs fixed about {c.fixedSteps}*</td></tr>)}</tbody></table></div>
          <p className="fine">Widget counts are measured from the real layouts. *Fixed-dashboard step counts are our assumption, not a measurement. Replace them with a stopwatch test on your teammates before you present.</p>
          <div className="row-btns"><button className="btn ghost sm" onClick={onFixed}>Show the fixed dashboard</button></div>
        </>}
        <div className="row-btns"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
