import { useEffect, useRef, useState } from 'react';
import './calendar.css';

const kinds = { urgent: 'Urgent work', meeting: 'Meeting', work_done: 'Work completed', reminder: 'Reminder', task: 'Task deadline' };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const initial = () => ({ title: '', kind: 'meeting', date: today(), time: '', endTime: '', location: '', description: '', taskKey: '', meet: false });
const connectionErrors = {
  api_disabled: 'Google Calendar API is not enabled for the project that created your OAuth client. Enable it in that same Google Cloud project, then connect again.',
  consent_denied: 'Google Calendar permission was not approved. Connect again and review the requested permission.',
  permission_missing: 'Google did not return the Calendar permission and offline access needed by this app. Connect again and approve access to the calendars created by I2I By AI.',
  credentials_invalid: 'Google rejected the client credentials. Check the client ID and secret in the backend settings.',
  authorization_expired: 'The Google authorization expired or was already used. Start a new connection from this workspace.',
  token_failed: 'The backend could not finish authorization with Google. Check its connection to Google and try a new connection.',
  calendar_failed: 'Google authorization finished, but creating or opening the I2I By AI calendar failed. Check Calendar API setup and account permissions, then reconnect.',
  storage_failed: 'Google returned the calendar, but the app could not save the connection. Check MongoDB and the backend encryption key before reconnecting.'
};
async function read(response) { const body = await response.json().catch(() => { throw Error('Calendar is unavailable. Check the backend and refresh.'); }); if (!response.ok) throw Error(body.error || 'Calendar is unavailable.'); return body; }
const post = (path, body) => fetch('/api/calendar/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }).then(read);

export default function CalendarWorkspace({ clientId, clientName, demo = false }) {
  const [entries, setEntries] = useState([]), [connection, setConnection] = useState({}), [form, setForm] = useState(initial), [month, setMonth] = useState(today().slice(0, 7));
  const [day, setDay] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const query = '?clientId=' + encodeURIComponent(clientId || '');
  async function refresh(signal) {
    const [records, status] = await Promise.all([fetch('/api/calendar/entries' + query, { signal: signal || AbortSignal.timeout(15000) }).then(read), fetch('/api/calendar/status', { signal: signal || AbortSignal.timeout(15000) }).then(read)]);
    if (signal?.aborted) return;
    setEntries(records); setConnection(status);
  }
  useEffect(() => {
    const controller = new AbortController();
    const load = () => refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    load(); window.addEventListener('workspace-tasks-changed', load);
    const params = new URLSearchParams(window.location.search), outcome = params.get('calendar');
    if (outcome === 'connected') setNotice('Google Calendar connected. Choose an entry to sync.');
    if (outcome === 'failed') setError(connectionErrors[params.get('calendarReason')] || 'Google connection did not finish. Check credentials, consent and Calendar API setup, then connect again.');
    return () => { controller.abort(); window.removeEventListener('workspace-tasks-changed', load); };
  }, [clientId]);
  async function action(work) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e.name === 'TimeoutError' ? 'The request timed out. Refresh and check Calendar before retrying.' : e.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const change = e => setForm(previous => ({ ...previous, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value, ...(e.target.name === 'kind' && e.target.value !== 'meeting' ? { meet: false } : {}) }));
  async function save(e) {
    e.preventDefault(); await action(async () => {
      await post('entries', { ...form, clientId: clientId || null }); setMonth(form.date.slice(0, 7)); setDay(''); setForm(initial()); await refresh(); setNotice('Saved in your workspace. Select Sync to Google to add it to your calendar.');
    });
  }
  const filtered = entries.filter(entry => entry.date.startsWith(month) && (!day || entry.date === day));
  const linkedTasks = entries.filter(entry => entry.source === 'task' && entry.kind !== 'work_done');
  const count = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const offset = new Date(month + '-01T12:00:00').getDay();
  const showTitle = entry => demo ? 'Workspace entry' : entry.title;
  return <section className="card calendar-workspace" id="workspace-calendar" aria-label="Calendar and meetings">
    <h2>Calendar, meetings & places</h2><p className="sub">Dates for {clientName} · India time. Urgent work, deadlines, meetings and recorded completion dates.</p>
    <div className="calendar-toolbar"><span className="note">{connection.connected ? 'Google Calendar connected · I2I By AI' : connection.configured ? 'Ready to connect Google Calendar' : 'Google Calendar setup needed'}</span>
      {!connection.connected ? <button className="btn" disabled={busy || !connection.configured} onClick={() => action(async () => { if (connection.workspaceUrl && window.location.origin !== new URL(connection.workspaceUrl).origin) { window.location.assign(connection.workspaceUrl + '#workspace-calendar'); return; } const result = await post('connect', {}); window.location.assign(result.url); })}>Connect Google Calendar</button> : <button className="btn ghost" disabled={busy} onClick={() => action(async () => { await post('disconnect', {}); await refresh(); setNotice('Disconnected. Existing Google events are retained.'); })}>Disconnect Google Calendar</button>}
      <button className="btn ghost" disabled={busy} onClick={() => action(() => refresh())}>Refresh calendar</button></div>
    {!connection.configured && <p className="fine">Add your Google OAuth credentials to the backend, then restart it. Setup instructions are in CALENDAR.md.</p>}
    <p className="fine">Connecting permits this shared local workspace to use a separate Google calendar. Each Sync button copies that entry’s title, date, details and location to Google. Meetings can generate a Google Meet link. No guest invitations are sent.</p>
    {error && <p className="clar" role="alert">{error}</p>}{notice && <p className="note" role="status">{notice}</p>}
    <div className="calendar-layout"><div>
      <label htmlFor="calendar-month">Calendar month<input id="calendar-month" type="month" required value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setDay(''); } }} /></label>
      <div className="calendar-grid" aria-label="Month dates">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(name => <b key={name}>{name}</b>)}{Array.from({ length: offset }, (_, i) => <span key={'empty' + i} />)}{Array.from({ length: count }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`, dates = entries.filter(entry => entry.date === date), urgent = dates.some(entry => entry.kind === 'urgent');
        return <button type="button" key={date} className={`${day === date ? 'selected' : ''} ${urgent ? 'urgent' : ''} ${date === today() ? 'today' : ''}`} aria-pressed={day === date} aria-label={`${date}, ${dates.length} entries${urgent ? ', urgent work' : ''}`} onClick={() => setDay(day === date ? '' : date)}>{i + 1}<small>{dates.length ? `${dates.length} ${dates.length === 1 ? 'entry' : 'entries'}` : '—'}</small></button>;
      })}</div><button className="chip" onClick={() => setDay('')}>Show whole month</button>
      <p className="fine">Red: urgent · Blue: meetings · Green: completed. Completion dates are shown only when recorded; a deadline is not proof of completion.</p>
    </div><form onSubmit={save}><fieldset disabled={busy}>
      <h3>Add a dated entry</h3><label htmlFor="calendar-title">Title<input id="calendar-title" name="title" required maxLength={180} value={form.title} onChange={change} placeholder="e.g. Pune client review" /></label>
      <label htmlFor="calendar-kind">Entry type<select id="calendar-kind" name="kind" value={form.kind} onChange={change}>{Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="calendar-time-fields"><label htmlFor="calendar-date">Date<input id="calendar-date" type="date" name="date" required value={form.date} onChange={change} /></label><label htmlFor="calendar-time">Start time (optional)<input id="calendar-time" type="time" name="time" required={form.meet} value={form.time} onChange={change} /></label><label htmlFor="calendar-end">End time (optional)<input id="calendar-end" type="time" name="endTime" value={form.endTime} onChange={change} /></label></div>
      <p className="fine">Without a time, the entry is all day. With a start time, the default duration is 1 hour. End time must be later on the same date.</p>
      <label htmlFor="calendar-location">Place / address (optional)<input id="calendar-location" name="location" maxLength={500} value={form.location} onChange={change} placeholder="e.g. Baner, Pune, Maharashtra" /></label>
      <label htmlFor="calendar-task">Related task (optional)<select id="calendar-task" name="taskKey" value={form.taskKey} onChange={change}><option value="">No linked task</option>{linkedTasks.map(task => <option value={task.taskKey} key={task.id}>{showTitle(task)}</option>)}</select></label>
      <label htmlFor="calendar-details">Details (optional)<textarea id="calendar-details" name="description" rows={2} maxLength={6000} value={form.description} onChange={change} /></label>
      {form.kind === 'meeting' && <label className="calendar-meet"><input type="checkbox" name="meet" checked={form.meet} onChange={change} />Create a Google Meet link when synced</label>}
      <button type="submit" className="btn">{busy ? 'Working…' : 'Save calendar entry'}</button><p className="fine">A completion entry records a date; it does not change the linked task’s status.</p>
    </fieldset></form></div>
    <h3>{day || month} agenda</h3><div className="calendar-agenda">{filtered.slice(0, 100).map(entry => <article key={entry.id} className={`calendar-entry ${entry.kind}`}>
      <div><b>{showTitle(entry)}</b><p>{kinds[entry.kind]} · {entry.date}{entry.time ? ` · ${entry.time}${entry.endTime ? '–' + entry.endTime : ''} IST` : ' · All day'}{entry.completed ? ' · Task completed' : ''}</p>
      {entry.location && <p>{demo ? 'Location hidden' : entry.location} · {!demo && <a href={entry.mapUrl} target="_blank" rel="noopener noreferrer">View location on Google Maps</a>}</p>}
      {entry.description && !demo && <details><summary>Entry details</summary><p className="calendar-description">{entry.description}</p></details>}
      {entry.sync && <p className="fine">Last synced: {new Date(entry.sync.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>}
      {entry.meet && !entry.sync?.meetUrl && <p className="fine">{entry.sync?.meetState === 'failure' ? 'Google Meet creation failed. Review this event in Google Calendar.' : entry.sync ? 'Meet link is not ready. Sync again to check; your account must support Google Meet.' : 'Meet link will be requested when you sync this meeting.'}</p>}
      </div><div className="calendar-entry-actions"><button className="btn ghost" disabled={busy || !connection.connected || demo} onClick={() => action(async () => { const result = await post('sync' + query, { ids: [entry.id] }); await refresh(); const state = result.results[0]; if (state.state !== 'synced') throw Error(state.error); setNotice(state.meetState === 'failure' ? 'Event synced, but Google could not create the Meet link.' : state.meetState === 'pending' ? 'Event synced. Google is preparing the Meet link; sync again to check.' : 'Entry synced to Google Calendar.'); })}>{entry.sync ? 'Update / check Google' : 'Sync to Google'}</button>
        {!demo && entry.sync?.calendarUrl && <a href={entry.sync.calendarUrl} target="_blank" rel="noopener noreferrer">Open Google event</a>}{!demo && entry.sync?.meetUrl && <a className="btn" href={entry.sync.meetUrl} target="_blank" rel="noopener noreferrer">Join Google Meet</a>}</div>
    </article>)}</div>{!filtered.length && <p className="fine">No dated entries for this selection. Choose another month or add an entry.</p>}{filtered.length > 100 && <p className="fine">Showing the first 100 entries. Select a date to narrow the agenda.</p>}
  </section>;
}
