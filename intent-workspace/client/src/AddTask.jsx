import { useState } from 'react';
import { api } from './api.js';
const initial = { title: '', owner: '', dueDate: '', priority: 'Medium', status: 'open', blocker: '' };
export default function AddTask() {
  const [task, setTask] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const change = e => { setSaved(false); setTask(t => ({ ...t, [e.target.name]: e.target.value })); };
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setSaved(false);
    try {
      await api.createTask(task);
      setTask(initial); setSaved(true);
    } catch (e) { setError(e.name === 'TimeoutError' ? 'Saving timed out. Check the task list before retrying.' : e.message); }
    finally { setBusy(false); }
  }
  return <section className="card add-task" aria-label="Add task">
    <h2>Add task</h2><p className="sub">Add work to your workspace, then link it to a goal or ask I2I Chat about it.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><div className="add-task-fields">
      <label htmlFor="new-task-title">Task title<input id="new-task-title" name="title" required maxLength={180} value={task.title} onChange={change} placeholder="e.g. Reconcile GST invoices" /></label>
      <label htmlFor="new-task-owner">Owner<input id="new-task-owner" name="owner" required maxLength={100} value={task.owner} onChange={change} placeholder="e.g. Asha, Ravi, or Meera" /></label>
      <label htmlFor="new-task-due">Due date<input id="new-task-due" name="dueDate" type="date" required value={task.dueDate} onChange={change} /></label>
      <label htmlFor="new-task-priority">Priority<select id="new-task-priority" name="priority" value={task.priority} onChange={change}>{['High', 'Medium', 'Low'].map(p => <option key={p}>{p}</option>)}</select></label>
      <label htmlFor="new-task-status">Status<select id="new-task-status" name="status" value={task.status} onChange={change}><option value="open">Pending / Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Completed</option></select></label>
      <label htmlFor="new-task-blocker">Blocker / pending reason{task.status !== 'blocked' && ' (optional)'}<input id="new-task-blocker" name="blocker" required={task.status === 'blocked'} maxLength={500} value={task.blocker} onChange={change} placeholder="e.g. Waiting for partner API keys" /></label>
    </div><button className="btn" type="submit">{busy ? 'Saving…' : 'Add task'}</button></fieldset></form>
    {error && <p className="clar" role="alert">{error}</p>}{saved && <p className="note" role="status">Task added. It is available in goal task selection and new chat questions.</p>}
  </section>;
}
