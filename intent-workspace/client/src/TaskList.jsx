import { useEffect, useState } from 'react';

const statusLabel = status => ({ open: 'Pending', in_progress: 'In progress', blocked: 'Blocked', done: 'Completed', completed: 'Completed', closed: 'Completed' }[status] || status || 'Not recorded');
export default function TaskList({ mk }) {
  const [tasks, setTasks] = useState([]), [query, setQuery] = useState(''), [busy, setBusy] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let controller;
    async function refresh(event) {
      if (event?.type === 'workspace-tasks-changed') setQuery('');
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      setBusy(true);
      try {
        const response = await fetch('/api/goals/tasks', { signal });
        if (!response.ok) throw Error('Could not load tasks. Check the backend and try again.');
        const records = await response.json();
        if (!Array.isArray(records)) throw Error('Invalid task list received.');
        if (!signal.aborted) { setTasks(records); setError(''); }
      } catch (e) { if (!signal.aborted) setError(e.message); }
      finally { if (!signal.aborted) setBusy(false); }
    }
    refresh();
    window.addEventListener('workspace-tasks-changed', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { controller?.abort(); clearInterval(timer); window.removeEventListener('workspace-tasks-changed', refresh); };
  }, []);
  const matches = tasks.filter(t => mk(`${t.title} ${t.owner || ''} ${statusLabel(t.status)}`).toLowerCase().includes(query.toLowerCase().trim()));
  return <section className="card workspace-tasks" id="workspace-task-list" aria-label="Task list" aria-busy={busy}>
    <h2>Task list</h2><p className="sub">All saved tasks, including upcoming, in-progress, blocked, and completed work. Newly added tasks appear first.</p>
    <label htmlFor="task-search">Find a task</label><input id="task-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, owner, or status" />
    {error && <p role="alert" className="clar">{error}</p>}
    {busy && <p className="fine" role="status">Updating task list…</p>}
    {!busy && !error && <p className="fine">{matches.length} of {tasks.length} tasks</p>}
    <div className="task-list-table" tabIndex={0} aria-label="Saved tasks"><table><thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due date</th><th>Blocker / reason</th></tr></thead><tbody>{matches.map(t => <tr key={t.taskKey} id={`task-${t.taskKey}`}><td>{mk(t.title)}</td><td>{mk(t.owner || 'Unassigned')}</td><td>{statusLabel(t.status)}</td><td>{t.priority || 'Not recorded'}</td><td>{t.dueAt && Number.isFinite(Date.parse(t.dueAt)) ? new Date(t.dueAt).toLocaleDateString('en-IN') : 'Not recorded'}</td><td>{mk(t.blocker || 'Not recorded')}</td></tr>)}</tbody></table></div>
    {!busy && !error && !matches.length && <p>{tasks.length ? 'No matching tasks. Try another search.' : 'No tasks yet. Add one through chat or the Add task card.'}</p>}
  </section>;
}
