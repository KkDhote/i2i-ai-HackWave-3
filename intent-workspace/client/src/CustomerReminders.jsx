import { useEffect, useRef, useState } from 'react';
import { maskText } from './lib.js';
import './customer-reminders.css';

const labels = { email: 'Email' };
const emptyForm = () => ({ customerName: '', email: '', channels: ['email'], enabled: false });
const indiaDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(date) : 'No due date recorded';
};
async function readResponse(response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || 'Could not load reminder settings.');
  return body;
}

export default function CustomerReminders({ demo = false }) {
  const [tasks, setTasks] = useState([]), [settings, setSettings] = useState({ channels: {}, reminders: [], deliveries: [], deliveryEnabled: false });
  const [taskKey, setTaskKey] = useState(''), [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(''), [saveError, setSaveError] = useState(''), [notice, setNotice] = useState('');
  const selected = useRef(''), inFlight = useRef(false), saveRevision = useRef(0);
  const display = text => demo ? maskText(text) : text;
  const task = tasks.find(item => item.taskKey === taskKey);

  function selectTask(key, reminders = settings.reminders) {
    const record = reminders.find(item => item.taskKey === key);
    selected.current = key; setTaskKey(key);
    setForm(record ? { customerName: record.customerName || '', email: record.email || '', channels: (record.channels || []).filter(channel => channel === 'email'), enabled: record.enabled === true } : emptyForm());
    setSaveError(''); setNotice('');
  }
  useEffect(() => {
    let active = true, refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      const revision = saveRevision.current;
      try {
        const [nextSettings, records] = await Promise.all(['/api/notifications/settings', '/api/goals/tasks'].map(path => fetch(path, { signal: AbortSignal.timeout(15000) }).then(readResponse)));
        if (!Array.isArray(records) || !Array.isArray(nextSettings.reminders) || !Array.isArray(nextSettings.deliveries)) throw Error('Invalid reminder settings received.');
        if (!active) return;
        const unfinished = records.filter(item => !['done', 'completed', 'closed'].includes(String(item.status).toLowerCase()));
        setTasks(unfinished); setLoaded(true); setLoadError('');
        // A read started before or during a save must not replace its result.
        if (revision === saveRevision.current && !inFlight.current) {
          setSettings(nextSettings);
          // Polling preserves contact details being edited for the selected task.
          if (!unfinished.some(item => item.taskKey === selected.current)) selectTask(unfinished[0]?.taskKey || '', nextSettings.reminders);
        }
      } catch (error) {
        if (active) setLoadError(['AbortError', 'TimeoutError'].includes(error.name) ? 'Reminder settings timed out. Check the backend connection.' : error.message);
      } finally { refreshing = false; }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('workspace-tasks-changed', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('workspace-tasks-changed', refresh); };
  }, []);

  function edit(field, value) { setForm(previous => ({ ...previous, [field]: value })); setNotice(''); setSaveError(''); }
  async function save(event) {
    event.preventDefault();
    if (!task || inFlight.current) return;
    if (form.enabled && !form.channels.length) { setSaveError('Choose at least one reminder channel.'); return; }
    inFlight.current = true; saveRevision.current += 1; setSaving(true); setSaveError(''); setNotice('');
    try {
      const record = await fetch(`/api/notifications/settings/${encodeURIComponent(taskKey)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), signal: AbortSignal.timeout(15000) }).then(readResponse);
      setSettings(previous => ({ ...previous, reminders: [...previous.reminders.filter(item => item.taskKey !== taskKey), record] }));
      const pending = form.channels.filter(channel => !settings.channels?.[channel]?.configured).map(channel => labels[channel]);
      setNotice(!form.enabled ? 'Saved. Customer reminders for this task are disabled.' : pending.length ? `Saved. Waiting for ${pending.join(', ')} provider setup${settings.deliveryEnabled ? '.' : ' and delivery activation.'}` : !settings.deliveryEnabled ? 'Saved. Waiting for customer delivery to be enabled.' : 'Saved. Reminders are active for the selected channels.');
    } catch (error) {
      setSaveError(['AbortError', 'TimeoutError'].includes(error.name) ? 'Saving timed out. Your details are still here; try saving again.' : error.message);
    } finally { saveRevision.current += 1; inFlight.current = false; setSaving(false); }
  }

  const needsEmail = form.enabled && form.channels.includes('email');
  const name = form.customerName.trim();
  return <details className="customer-reminders">
    <summary>Customer reminders</summary>
    <p className="sub">Set up email reminders three days and one day before a task is due, on its due date, and once after it becomes overdue.</p>
    <div className="reminder-channel-status" aria-label="Reminder channel connections">
      {Object.entries(labels).map(([channel, label]) => <span key={channel} className={`reminder-channel ${settings.channels?.[channel]?.configured ? 'configured' : ''}`}><b>{label}</b><span>{!loaded ? loadError ? 'Unavailable' : 'Loading…' : settings.channels?.[channel]?.configured ? `Configured · ${settings.channels[channel].provider}` : `Setup needed${settings.channels?.[channel]?.provider && settings.channels[channel].provider !== 'Not connected' ? ` · ${settings.channels[channel].provider}` : ''}`}</span></span>)}
    </div>
    {loaded && !settings.deliveryEnabled && <p className="clar">Customer delivery is off. Finish provider setup and enable delivery before reminders can be sent.</p>}
    {loadError && <p className="clar" role="alert">{loadError}</p>}
    {!loaded && !loadError && <p className="fine" role="status">Loading tasks and reminder settings…</p>}
    {loaded && !tasks.length && <p className="note">No unfinished tasks are available. Add a task to configure a customer reminder.</p>}
    <form onSubmit={save}>
      <fieldset disabled={!loaded || saving || !tasks.length}>
        <label htmlFor="reminder-task">Task</label>
        <select id="reminder-task" required value={taskKey} onChange={event => selectTask(event.target.value)}>
          {!tasks.length && <option value="">No unfinished tasks</option>}
          {tasks.map(item => <option key={item.taskKey} value={item.taskKey}>{display(item.title)} · due {indiaDate(item.dueAt)}</option>)}
        </select>
        <div className="reminder-contact-fields">
          <label htmlFor="reminder-customer">Customer name (optional)<input id="reminder-customer" maxLength={100} autoComplete="name" value={form.customerName} onChange={event => edit('customerName', event.target.value)} /></label>
          <label htmlFor="reminder-email">Customer email<input id="reminder-email" type="email" maxLength={254} autoComplete="email" required={needsEmail} value={form.email} onChange={event => edit('email', event.target.value)} /></label>
        </div>
        <fieldset className="reminder-channel-options"><legend>Reminder channels</legend>
          {Object.entries(labels).map(([channel, label]) => <label key={channel}><input type="checkbox" checked={form.channels.includes(channel)} onChange={event => edit('channels', event.target.checked ? [...form.channels, channel] : form.channels.filter(item => item !== channel))} />{label}</label>)}
        </fieldset>
        <label className="reminder-enabled"><input type="checkbox" checked={form.enabled} onChange={event => edit('enabled', event.target.checked)} />Enable reminders for this task</label>
        {task && <div className="note reminder-preview" aria-label="Reminder preview"><b>Reminder preview</b><p>{display(`Hello${name ? ` ${name}` : ''}, ${task.title} is due ${indiaDate(task.dueAt)}. Please complete pending work.`)}</p><small>Due dates use India time.</small></div>}
        {form.enabled && !form.channels.length && <p className="fine">Choose at least one reminder channel to enable reminders.</p>}
        <button className="btn reminder-save" type="submit" disabled={form.enabled && !form.channels.length}>{saving ? 'Saving…' : 'Save reminder settings'}</button>
      </fieldset>
    </form>
    {saveError && <p className="clar" role="alert">{saveError}</p>}
    {notice && <p className="note" role="status">{notice}</p>}
    <p className="fine">The backend must keep running for scheduled reminders. Selected channels need a configured provider and a valid customer contact, and customer delivery must be enabled. Saving does not send a test message.</p>
    <div className="reminder-deliveries"><h3>Recent deliveries</h3>
      {!settings.deliveries.length ? <p className="fine">No delivery records yet.</p> : <ul>{settings.deliveries.slice(0, 6).map((delivery, index) => <li key={delivery.id || index}><span><b>{labels[delivery.channel] || delivery.channel}</b> · {display(delivery.taskTitle || 'Task reminder')}</span><span>{delivery.state || 'Unknown'} · {indiaDate(delivery.createdAt)}</span>{delivery.error && <small>Delivery issue recorded. Check the channel provider setup.</small>}</li>)}</ul>}
    </div>
  </details>;
}
