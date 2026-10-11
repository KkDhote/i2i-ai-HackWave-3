import { useEffect, useState } from 'react';
import './goal-workspace.css';
const ROOT = 'http://localhost:5001';
export default function GoalWorkspace() {
  const [goals, setGoals] = useState([]), [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState(''), [selected, setSelected] = useState([]), [error, setError] = useState('');
  async function api(path, options) {
    const r = await fetch(ROOT + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const json = await r.json(); if (!r.ok) throw Error(json.error || 'Request failed'); return json;
  }
  async function refresh() {
    try { const [gs, ts] = await Promise.all([api('/api/goals'), api('/api/goals/tasks')]); setGoals(gs); setTasks(ts); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 30000); window.addEventListener('workspace-tasks-changed', refresh); return () => { clearInterval(timer); window.removeEventListener('workspace-tasks-changed', refresh); }; }, []);
  async function create(e) {
    e.preventDefault();
    try { await api('/api/goals', { method: 'POST', body: JSON.stringify({ title, taskKeys: selected }) }); setTitle(''); setSelected([]); window.dispatchEvent(new Event('workspace-goals-changed')); await refresh(); }
    catch (e) { setError(e.message); }
  }
  async function mark(goal, status) {
    try { await api(`/api/goals/${encodeURIComponent(goal.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); window.dispatchEvent(new Event('workspace-goals-changed')); await refresh(); }
    catch (e) { setError(e.message); }
  }
  return <section className="goal-workspace" id="workspace-goals" aria-label="Live goal workspace">
    <h2>Live Goal Graph & Gap Radar</h2>
    <p>Goals persist in MongoDB. Progress and risks are derived from existing project tasks (refreshes every 30 seconds).</p>
    {error && <p role="alert" className="goal-error">{error}</p>}
    <form onSubmit={create} className="goal-create">
      <input required maxLength={180} aria-label="Goal title" placeholder="New goal: Complete Diwali sale readiness" value={title} onChange={e => setTitle(e.target.value)} />
      <label>Link existing tasks <select aria-label="Link existing tasks" multiple size={Math.min(6, Math.max(tasks.length, 2))} value={selected} onChange={e => setSelected([...e.target.selectedOptions].map(o => o.value))}>
        {tasks.map(t => <option key={t.taskKey} value={t.taskKey}>{t.title} — {t.owner}</option>)}
      </select></label>
      <button type="submit">Save goal plan</button>
    </form>
    <div className="goal-list">{goals.map(g => <article key={g.id} className="goal-card" id={`goal-${g.id}`}>
      <header><h3>{g.title}</h3><span>{g.status} · {g.progress}% complete</span></header>
      <progress max="100" value={g.progress} aria-label={`${g.title} progress`} />
      <p>{g.completedTasks} of {g.totalTasks} tasks completed</p>
      <div className="goal-graph" role="group" aria-label="Goal task dependency graph">
        <div className="goal-root">🎯 {g.title}</div>
        <div className="goal-branches">{g.graph.nodes.filter(n => n.type === 'task').map(n =>
          <div key={n.id} className="goal-node">↳ {n.label} <small>({n.status}, {n.owner || 'unassigned'})</small></div>
        )}</div>
      </div>
      <h4>Proactive Gap Radar · {g.alerts.length} alerts</h4>
      {g.alerts.length ? <ul>{g.alerts.map((a, i) => <li key={i}><strong>{a.severity.toUpperCase()}</strong>: {a.message}</li>)}</ul> : <p>No detected gaps in linked tasks.</p>}
      <div className="goal-buttons"><button onClick={() => mark(g, 'active')}>Resume</button><button onClick={() => mark(g, 'paused')}>Pause</button><button onClick={() => mark(g, 'completed')}>Mark goal complete</button></div>
    </article>)}</div>
  </section>;
}
