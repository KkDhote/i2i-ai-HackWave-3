import { useEffect, useState } from 'react';

// "Needs your attention now": built from the database before the user says anything. One click runs the goal.
const URLS = ['/api/briefing', 'http://localhost:5001/api/briefing'];
async function load() {
  for (const u of URLS) {
    try {
      const r = await fetch(u);
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return await r.json();
    } catch { /* try the next address */ }
  }
  return null;
}
const WORD = { bad: 'Urgent', warn: 'Watch', n: 'Info' };

export default function Briefing({ onGo, mk = s => s }) {
  const [b, setB] = useState(null);
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = async () => { const current = ++revision; const next = await load(); if (active && current === revision) setB(next); };
    refresh(); window.addEventListener('workspace-tasks-changed', refresh);
    return () => { active = false; window.removeEventListener('workspace-tasks-changed', refresh); };
  }, []);
  if (!b?.items?.length) return null;
  return (
    <section className="brief" aria-labelledby="brief-h">
      <h3 id="brief-h" className="small">Needs your attention now. Pick one and the workspace builds itself around it.</h3>
      <div className="brief-grid">
        {b.items.map((it, i) => (
          <button key={i} className="brief-card" onClick={() => onGo(it.goal)}>
            <span className={'tag t-' + it.tone}>{WORD[it.tone] || 'Info'}</span>
            <b>{mk(it.title)}</b>
            <span className="fine">{mk(it.detail)}</span>
            <span className="go">{mk(it.goal)} &rarr;</span>
          </button>))}
      </div>
    </section>
  );
}
