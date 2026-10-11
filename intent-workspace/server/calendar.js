import { createHash, randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export const calendarScope = 'https://www.googleapis.com/auth/calendar.app.created';
export const kinds = { urgent: 'Urgent work', meeting: 'Meeting', work_done: 'Work completed', reminder: 'Reminder', task: 'Task deadline' };
export const indiaDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const mapUrl = place => place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
export function calendarFailureReason(error, stage) {
  if (['accessNotConfigured', 'SERVICE_DISABLED'].includes(error.googleReason)) return 'api_disabled';
  if (stage === 'consent') return 'consent_denied';
  if (stage === 'grant') return 'permission_missing';
  if (stage === 'token') return error.googleReason === 'invalid_client' ? 'credentials_invalid' : error.googleReason === 'invalid_grant' ? 'authorization_expired' : 'token_failed';
  return stage === 'save' ? 'storage_failed' : 'calendar_failed';
}
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
export function parseCalendarEntry(body) {
  if (!body || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 180 || !Object.hasOwn(kinds, body.kind) || !validDate(body.date)) return null;
  const { time = '', endTime = '', location = '', description = '', clientId = null, taskKey = '', meet = false } = body;
  if (![time, endTime, location, description, taskKey].every(x => typeof x === 'string') || location.length > 500 || description.length > 6000 || typeof meet !== 'boolean') return null;
  if (clientId !== null && (typeof clientId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(clientId))) return null;
  if (taskKey && !/^[a-f0-9]{20}$/.test(taskKey)) return null;
  if ((time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || (endTime && (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || endTime <= time))) return null;
  if (meet && (body.kind !== 'meeting' || !time)) return null;
  return { title: body.title.trim(), kind: body.kind, date: body.date, time, endTime, location: location.trim(), description: description.trim(), clientId, taskKey, meet };
}
export function taskEntries(task, key) {
  const done = ['done', 'completed', 'closed'].includes(task.status);
  const entries = [];
  if (Number.isFinite(Date.parse(task.dueAt))) entries.push({ id: `task-${key}`, title: task.title, kind: task.priority === 'High' && !done ? 'urgent' : 'task', date: indiaDay(task.dueAt), time: '', location: task.location || '', description: `Owner: ${task.owner || 'Unassigned'}\nStatus: ${task.status}\nPriority: ${task.priority || 'Medium'}\n${task.description || ''}`, clientId: task.clientId ?? null, taskKey: key, source: 'task', completed: done, meet: false });
  if (done && Number.isFinite(Date.parse(task.completedAt))) entries.push({ id: `done-${key}`, title: task.title, kind: 'work_done', date: indiaDay(task.completedAt), time: '', location: task.location || '', description: 'Recorded completion date.', clientId: task.clientId ?? null, taskKey: key, source: 'task', meet: false });
  return entries;
}
export function eventId(entry) { return 'i2i' + createHash('sha256').update(entry.id).digest('hex'); }
export function googleEvent(entry, existingConference) {
  let start, end;
  if (entry.time) {
    const at = new Date(`${entry.date}T${entry.time}:00+05:30`);
    start = { dateTime: at.toISOString(), timeZone: 'Asia/Kolkata' };
    end = { dateTime: entry.endTime ? new Date(`${entry.date}T${entry.endTime}:00+05:30`).toISOString() : new Date(at.getTime() + 3600000).toISOString(), timeZone: 'Asia/Kolkata' };
  } else {
    start = { date: entry.date }; end = { date: new Date(Date.parse(entry.date) + 86400000).toISOString().slice(0, 10) };
  }
  return { id: eventId(entry), summary: `${kinds[entry.kind]}: ${entry.title}`, description: `${entry.description || ''}\nClient: ${entry.clientId || 'Workspace'}\nCreated by I2I By AI`, location: entry.location || '', start, end,
    colorId: ({ urgent: '11', work_done: '10', meeting: '9', task: '8', reminder: '5' })[entry.kind],
    reminders: { useDefault: false, overrides: entry.kind === 'work_done' || entry.completed ? [] : entry.kind === 'meeting' ? [{ method: 'popup', minutes: 30 }] : [{ method: 'popup', minutes: 4320 }, { method: 'popup', minutes: 1440 }] },
    extendedProperties: { private: { i2iEntryId: entry.id } },
    ...(entry.meet ? { conferenceData: existingConference || { createRequest: { requestId: createHash('sha256').update(entry.id).digest('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}) };
}
export function calendarConfig(env) {
  const key = Buffer.from(env.GOOGLE_CALENDAR_TOKEN_KEY || '', 'base64');
  const redirect = env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://127.0.0.1:5173/api/calendar/oauth/callback';
  const frontend = env.GOOGLE_CALENDAR_APP_URL || 'http://127.0.0.1:5173/';
  let local = false;
  try { local = [new URL(redirect), new URL(frontend)].every(u => u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)); } catch {}
  return { configured: !!env.GOOGLE_CLIENT_ID?.trim() && !!env.GOOGLE_CLIENT_SECRET?.trim() && key.length === 32 && local, key, redirect, frontend };
}
export function sealTokens(tokens, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
export function openTokens(value, key) {
  const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8'));
}
export function newEntry(body) { return { ...body, id: randomUUID(), source: 'calendar', createdAt: new Date().toISOString() }; }
