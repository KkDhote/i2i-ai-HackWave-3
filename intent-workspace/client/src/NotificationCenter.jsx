import { useEffect, useRef, useState } from 'react';
import { maskText } from './lib.js';
import CustomerReminders from './CustomerReminders.jsx';

const READ_KEY = 'i2i-notifications-read-v1', SENT_KEY = 'i2i-notifications-desktop-v1', ENABLED_KEY = 'i2i-notifications-enabled-v1';
function loadIds(key, fallback = []) {
  try { const ids = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []); }
  catch { return new Set(fallback); }
}
function saveIds(key, ids) {
  // ponytail: retain the last 1000 alert receipts per browser; use accounts for shared read state.
  try { localStorage.setItem(key, JSON.stringify([...ids].slice(-1000))); return true; } catch { return false; }
}
function isEnabled() { try { return localStorage.getItem(ENABLED_KEY) === 'true'; } catch { return false; } }
const dueKinds = new Set(['due_3d', 'due_1d', 'due_today', 'overdue']);
const supportsDesktop = () => 'Notification' in window && window.isSecureContext;

export default function NotificationCenter({ demo }) {
  const [items, setItems] = useState([]), [read, setRead] = useState(() => loadIds(READ_KEY));
  const [open, setOpen] = useState(false), [filter, setFilter] = useState('unread');
  const [enabled, setEnabled] = useState(() => isEnabled() && supportsDesktop() && Notification.permission === 'granted');
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState(''), [permissionBusy, setPermissionBusy] = useState(false);
  const prefs = useRef({ enabled, read });
  prefs.current = { enabled, read };
  const display = value => demo ? maskText(value) : value;

  function deliverDesktop(alerts) {
    if (!prefs.current.enabled || !supportsDesktop() || Notification.permission !== 'granted') return;
    const sent = loadIds(SENT_KEY);
    const fresh = alerts.filter(alert => !sent.has(alert.id) && !prefs.current.read.has(alert.id));
    if (!fresh.length) return;
    try {
      const due = fresh.filter(alert => dueKinds.has(alert.kind)).length;
      const desktop = new Notification(`I2I By AI · ${fresh.length} new alert${fresh.length === 1 ? '' : 's'}`, {
        body: `${due} due-date reminder${due === 1 ? '' : 's'} and ${fresh.length - due} blocker or risk alert${fresh.length - due === 1 ? '' : 's'}. Open your workspace to review.`,
        tag: 'i2i-workspace-alerts'
      });
      desktop.onclick = () => { window.focus(); setOpen(true); setFilter('unread'); window.location.hash = 'workspace-notifications'; desktop.close(); };
      fresh.forEach(alert => sent.add(alert.id));
      if (!saveIds(SENT_KEY, sent)) setNotice('Browser storage is unavailable. Desktop alerts may repeat after a reload.');
    } catch {
      setEnabled(false); prefs.current.enabled = false;
      setNotice('This browser could not show a desktop alert. Your reminders are available here.');
    }
  }

  useEffect(() => {
    let controller, disposed = false;
    async function refresh() {
      controller?.abort(); const current = new AbortController(); controller = current;
      let timedOut = false;
      const signal = current.signal, timeout = setTimeout(() => { timedOut = true; current.abort(); }, 15000);
      try {
        const response = await fetch('/api/notifications', { signal });
        if (!response.ok) throw Error('Could not load notifications. Check the backend and try again.');
        const result = await response.json();
        if (!Array.isArray(result.notifications)) throw Error('Invalid notifications received.');
        if (!signal.aborted) { setItems(result.notifications); setUpdatedAt(result.generatedAt); setError(''); deliverDesktop(result.notifications); }
      } catch (e) { if (!disposed && controller === current && (!signal.aborted || timedOut)) setError(timedOut ? 'Notification check timed out. We’ll retry shortly.' : e.message); }
      finally { clearTimeout(timeout); if (!disposed && controller === current) setBusy(false); }
    }
    function sync(event) {
      if (event.key === READ_KEY) setRead(loadIds(READ_KEY));
      if (event.key === ENABLED_KEY) setEnabled(isEnabled() && supportsDesktop() && Notification.permission === 'granted');
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('workspace-tasks-changed', refresh);
    window.addEventListener('workspace-goals-changed', refresh);
    window.addEventListener('storage', sync);
    return () => { disposed = true; controller?.abort(); clearInterval(timer); window.removeEventListener('workspace-tasks-changed', refresh); window.removeEventListener('workspace-goals-changed', refresh); window.removeEventListener('storage', sync); };
  }, []);

  function mark(ids, readValue = true) {
    const next = loadIds(READ_KEY, read);
    ids.forEach(id => readValue ? next.add(id) : next.delete(id));
    setRead(next); prefs.current.read = next;
    if (!saveIds(READ_KEY, next)) setNotice('Browser storage is unavailable. Read status will reset after a reload.');
  }
  async function toggleDesktop() {
    setNotice('');
    if (enabled) {
      setEnabled(false); prefs.current.enabled = false;
      try { localStorage.setItem(ENABLED_KEY, 'false'); } catch { /* Session preference still applies. */ }
      return;
    }
    if (!supportsDesktop()) { setNotice('Desktop alerts are unavailable in this browser. Use a supported browser on localhost or HTTPS.'); return; }
    setPermissionBusy(true);
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') { setNotice(permission === 'denied' ? 'Notifications are blocked. Allow them in your browser’s site settings to enable desktop alerts.' : 'Permission was not granted. You can enable desktop alerts later.'); return; }
      setEnabled(true); prefs.current.enabled = true;
      try { localStorage.setItem(ENABLED_KEY, 'true'); } catch { setNotice('Desktop alerts are enabled for this session. Browser storage is unavailable.'); }
      deliverDesktop(items);
    } catch { setNotice('Desktop permission could not be requested. Your reminders are available in the app.'); }
    finally { setPermissionBusy(false); }
  }
  const unread = items.filter(item => !read.has(item.id));
  const visible = items.filter(item => filter === 'unread' ? !read.has(item.id) : filter === 'due' ? dueKinds.has(item.kind) : filter === 'risks' ? !dueKinds.has(item.kind) : true);
  const count = kind => items.filter(item => item.kind === kind).length;

  return <section className="card notification-center" id="workspace-notifications" aria-label="Notifications">
    <div className="notification-heading">
      <div><h2><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg> Notifications <span className="tag t-n">{unread.length} unread</span></h2><p className="sub">Reminders 3 days and 1 day before the due date · India time</p></div>
      <div className="acts"><button className="btn ghost sm" disabled={permissionBusy} aria-pressed={enabled} onClick={toggleDesktop}>{permissionBusy ? 'Waiting for permission…' : enabled ? 'Disable desktop alerts' : 'Enable desktop alerts'}</button><button className="btn sm" aria-expanded={open} aria-controls="notification-list" onClick={() => setOpen(value => !value)}>{open ? 'Hide alerts' : 'Show alerts'}</button></div>
    </div>
    <div className="notification-summary" aria-live="polite"><span>{count('due_3d')} due in 2–3 days</span><span>{count('due_1d')} due tomorrow</span><span>{count('due_today')} due today</span><span className="dn">{count('overdue')} overdue</span><span>{count('blocked')} blocked</span></div>
    {busy && <p className="fine" role="status">Checking reminders…</p>}
    {error && <p className="clar" role="alert">{error}{updatedAt ? ' Showing the last successful check.' : ''}</p>}
    {notice && <p className="note" role="status">{notice}</p>}
    <div id="notification-list" hidden={!open}>
      <div className="notification-filters"><div className="chips">{[['unread', 'Unread'], ['all', 'All'], ['due', 'Due dates'], ['risks', 'Blockers & risks']].map(([value, label]) => <button key={value} className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><button className="btn ghost sm" disabled={!unread.length} onClick={() => mark(items.map(item => item.id))}>Mark all as read</button></div>
      <ul className="notification-list">{visible.map(item => <li key={item.id} className={`notification-item${read.has(item.id) ? ' is-read' : ''}`}>
        <div><span className={`tag ${item.severity === 'high' ? 't-bad' : 't-warn'}`}>{item.severity === 'high' ? 'Important' : 'Reminder'}</span><h3>{display(item.title)}</h3><p>{display(item.message)}</p>{item.owner && <small>Owner: {display(item.owner)}</small>}
          <div className="notification-actions"><a href={item.href} onClick={() => mark([item.id])}>{item.taskKey ? 'View task' : 'View goal'}</a><button className="chip" onClick={() => mark([item.id], !read.has(item.id))}>{read.has(item.id) ? 'Mark unread' : 'Mark read'}</button></div>
        </div>
      </li>)}</ul>
      {!busy && !error && !visible.length && <p className="fine">{filter === 'unread' ? 'You’re all caught up. Check All to see active alerts.' : 'No active alerts in this category.'}</p>}
    </div>
    <p className="fine">In-app alerts update every minute. Desktop alerts work while this app is open. {updatedAt && `Last checked ${new Date(updatedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST.`}</p>
    <CustomerReminders demo={demo} />
  </section>;
}
