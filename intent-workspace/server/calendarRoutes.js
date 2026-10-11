import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { getDb } from './db.js';
import { taskKey } from './goalsRoutes.js';
import { calendarConfig, calendarOrigins, calendarScope, calendarFailureReason, parseCalendarEntry, newEntry, taskEntries, googleEvent, eventId, sealTokens, openTokens, mapUrl } from './calendar.js';

export function createCalendarRouter({ getDatabase = getDb, env = process.env, fetchImpl = fetch } = {}) {
  const router = Router(), states = new Map();
  let syncing = false;
  const config = () => calendarConfig(env);
  const safe = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.status || 503).json({ error: error.publicMessage || 'Calendar request could not be confirmed. Check Google Calendar before retrying.' }); } };
  const failure = (message, status = 400) => Object.assign(new Error(message), { publicMessage: message, status });
  // Shared local demo: no remote calendar access until real user authentication is added.
  router.use('/api/calendar', (req, res, next) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) return res.status(403).json({ error: 'Calendar integration is available only on this computer.' });
    if (req.method !== 'GET' || req.get('origin')) {
      let origin; try { origin = new URL(req.get('origin') || '').origin; } catch {}
      const allowed = calendarOrigins(config());
      if (!origin || !allowed.has(origin)) return res.status(403).json({ error: 'Open the configured workspace address to use Calendar.' });
    }
    res.set('Cache-Control', 'no-store'); next();
  });
  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason || data.error?.details?.find(detail => detail.reason)?.reason || (typeof data.error === 'string' ? data.error : '');
      throw Object.assign(failure(response.status === 401 ? 'Reconnect Google Calendar to renew permission.' : 'Google rejected the calendar request. Check account permissions and Calendar API setup.', 502), { googleStatus: response.status, googleReason: ['accessNotConfigured', 'SERVICE_DISABLED', 'invalid_client', 'invalid_grant'].includes(reason) ? reason : '' });
    }
    return data;
  }
  async function connection(db) {
    if (!config().configured) throw failure('Configure Google Calendar credentials in the backend first.', 409);
    const record = await db.collection('iw_calendar_connection').findOne({ _id: 'workspace' });
    if (!record?.tokens || !record.calendarId) throw failure('Connect Google Calendar first.', 409);
    const tokens = openTokens(record.tokens, config().key);
    if (tokens.expiresAt < Date.now() + 60000) {
      if (!tokens.refresh_token) throw failure('Reconnect Google Calendar to renew permission.', 409);
      const refreshed = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: tokens.refresh_token }).toString() });
      if (!refreshed.access_token) throw failure('Reconnect Google Calendar to renew permission.', 409);
      Object.assign(tokens, refreshed, { expiresAt: Date.now() + (refreshed.expires_in || 3600) * 1000 });
      await db.collection('iw_calendar_connection').updateOne({ _id: 'workspace' }, { $set: { tokens: sealTokens(tokens, config().key) } });
    }
    return { ...record, accessToken: tokens.access_token };
  }
  const google = (record, path, method = 'GET', body) => request(`https://www.googleapis.com/calendar/v3${path}`, { method, headers: { Authorization: `Bearer ${record.accessToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function entries(db, clientId) {
    const [tasks, saved, synced, linked] = await Promise.all([db.collection('iw_tasks').find({ clientId }).toArray(), db.collection('iw_calendar_entries').find({ clientId }).toArray(), db.collection('iw_calendar_sync').find({}).toArray(), db.collection('iw_calendar_connection').findOne({ _id: 'workspace' })]);
    return [...tasks.flatMap(task => taskEntries(task, taskKey(task))), ...saved.map(({ _id, ...entry }) => entry)].map(entry => ({ ...entry, mapUrl: mapUrl(entry.location), sync: synced.find(s => s.entryId === entry.id && s.calendarId === linked?.calendarId)?.public || null })).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
  }
  function client(req) {
    const id = req.query.clientId || null;
    if (id !== null && (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id))) throw failure('Choose a valid client.');
    return id;
  }
  router.get('/api/calendar/status', safe(async (_req, res) => {
    const db = await getDatabase(), record = await db.collection('iw_calendar_connection').findOne({ _id: 'workspace' });
    res.json({ configured: config().configured, connected: config().configured && !!record?.tokens && !!record?.calendarId, calendarName: record?.calendarId ? 'I2I By AI' : null, workspaceUrl: config().configured ? config().frontend : null });
  }));
  router.get('/api/calendar/entries', safe(async (req, res) => res.json(await entries(await getDatabase(), client(req)))));
  router.post('/api/calendar/entries', safe(async (req, res) => {
    const parsed = parseCalendarEntry(req.body); if (!parsed) throw failure('Enter a title, type and valid date. Meeting links need a start time; the end time must be later on the same day.');
    const db = await getDatabase();
    if (parsed.clientId && !await db.collection('iw_clients').findOne({ id: parsed.clientId })) throw failure('Choose an existing client.');
    if (parsed.taskKey) {
      const tasks = await db.collection('iw_tasks').find({ clientId: parsed.clientId }).toArray();
      if (!tasks.some(task => taskKey(task) === parsed.taskKey)) throw failure('Choose a task for this client.');
    }
    const entry = newEntry(parsed); await db.collection('iw_calendar_entries').insertOne({ ...entry });
    res.status(201).json(entry);
  }));
  router.post('/api/calendar/connect', safe(async (req, res) => {
    if (!config().configured) throw failure('Configure Google Calendar credentials in the backend first.', 409);
    if (new URL(req.get('origin')).origin !== new URL(config().frontend).origin) throw failure('Start Google sign-in from the configured workspace address.', 409);
    for (const [key, value] of states) if (value.expires < Date.now()) states.delete(key);
    if (states.size > 20) throw failure('Too many connection attempts. Wait a few minutes.', 429);
    const state = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url');
    states.set(state, { verifier, expires: Date.now() + 600000 });
    res.cookie('i2i_calendar_state', state, { httpOnly: true, sameSite: 'lax', path: '/api/calendar', maxAge: 600000 });
    const query = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: config().redirect, response_type: 'code', scope: calendarScope, access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` });
  }));
  router.get('/api/calendar/oauth/callback', async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    const state = typeof req.query.state === 'string' ? req.query.state : '', pending = states.get(state);
    const cookie = req.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('i2i_calendar_state='))?.slice('i2i_calendar_state='.length);
    if (!state || state !== cookie || !pending || pending.expires < Date.now()) return res.status(400).send('Calendar connection expired or invalid. Return to the workspace and connect again.');
    states.delete(state); res.clearCookie('i2i_calendar_state', { path: '/api/calendar' });
    let stage = 'consent';
    try {
      if (req.query.error || typeof req.query.code !== 'string') throw Error('Consent not granted');
      stage = 'token';
      const tokens = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: req.query.code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: config().redirect, grant_type: 'authorization_code', code_verifier: pending.verifier }).toString() });
      stage = 'grant';
      if (!tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(' ').includes(calendarScope)) throw Error('Incomplete consent');
      stage = 'calendar';
      const db = await getDatabase(), previous = await db.collection('iw_calendar_connection').findOne({ _id: 'workspace' });
      // Never reuse another account's calendar. Check access under the new token first.
      let calendar;
      if (previous?.calendarId) {
        try { calendar = await google({ accessToken: tokens.access_token }, `/calendars/${encodeURIComponent(previous.calendarId)}`); } catch (error) { if (![403, 404].includes(error.googleStatus)) throw error; }
      }
      if (!calendar) calendar = await google({ accessToken: tokens.access_token }, '/calendars', 'POST', { summary: 'I2I By AI', timeZone: 'Asia/Kolkata', description: 'Task deadlines, meetings and completion dates from I2I By AI.' });
      if (!calendar.id) throw Error('Missing calendar');
      stage = 'save';
      tokens.expiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;
      await db.collection('iw_calendar_connection').updateOne({ _id: 'workspace' }, { $set: { calendarId: calendar.id, tokens: sealTokens(tokens, config().key) } }, { upsert: true });
      res.redirect(`${config().frontend}?calendar=connected#workspace-calendar`);
    } catch (error) { res.redirect(`${config().frontend}?calendar=failed&calendarReason=${calendarFailureReason(error, stage)}#workspace-calendar`); }
  });
  router.post('/api/calendar/disconnect', safe(async (_req, res) => {
    if (syncing) throw failure('Wait for the current sync to finish.', 409);
    const db = await getDatabase();
    await db.collection('iw_calendar_connection').updateOne({ _id: 'workspace' }, { $unset: { tokens: 1 } });
    res.json({ disconnected: true });
  }));
  router.post('/api/calendar/sync', safe(async (req, res) => {
    if (!Array.isArray(req.body?.ids) || !req.body.ids.length || req.body.ids.length > 100 || !req.body.ids.every(id => typeof id === 'string' && id.length < 100)) throw failure('Choose up to 100 calendar entries to sync.');
    if (syncing) throw failure('A calendar sync is already running.', 409);
    syncing = true;
    try {
      const db = await getDatabase(), selectedClient = client(req), all = await entries(db, selectedClient);
      const selected = [...new Set(req.body.ids)].map(id => all.find(entry => entry.id === id));
      if (selected.some(entry => !entry)) throw failure('An entry was not found for this client. Refresh the calendar.');
      const record = await connection(db), results = [];
      const base = `/calendars/${encodeURIComponent(record.calendarId)}/events`;
      for (const entry of selected) {
        try {
          let existing;
          try { existing = await google(record, `${base}/${eventId(entry)}`); } catch (error) { if (error.googleStatus !== 404) throw error; }
          if (existing && (existing.status === 'cancelled' || existing.extendedProperties?.private?.i2iEntryId !== entry.id)) throw failure('This event was removed or changed in Google Calendar. Review it there before syncing.');
          const body = googleEvent(entry, existing?.conferenceData);
          const event = await google(record, `${base}${existing ? '/' + eventId(entry) : ''}?conferenceDataVersion=1&sendUpdates=none`, existing ? 'PUT' : 'POST', body);
          if (event.id !== eventId(entry) || event.status === 'cancelled') throw failure('Google did not confirm this event. Review Google Calendar before retrying.');
          const meetUrl = event.conferenceData?.entryPoints?.find(point => point.entryPointType === 'video')?.uri;
          const publicResult = { state: 'synced', updatedAt: new Date().toISOString(), calendarUrl: typeof event.htmlLink === 'string' && /^https:\/\/(?:www\.)?google\.com\/calendar\//.test(event.htmlLink) ? event.htmlLink : null, meetUrl: typeof meetUrl === 'string' && /^https:\/\/meet\.google\.com\/[a-z-]+$/.test(meetUrl) ? meetUrl : null, meetState: entry.meet ? event.conferenceData?.createRequest?.status?.statusCode || (meetUrl ? 'success' : 'pending') : null };
          await db.collection('iw_calendar_sync').updateOne({ _id: `${record.calendarId}:${entry.id}` }, { $set: { entryId: entry.id, calendarId: record.calendarId, public: publicResult } }, { upsert: true });
          results.push({ id: entry.id, ...publicResult });
        } catch (error) { results.push({ id: entry.id, state: 'unconfirmed', error: error.publicMessage || 'Result not confirmed. Check Google Calendar before retrying.' }); }
      }
      res.json({ results });
    } finally { syncing = false; }
  }));
  return router;
}
export default createCalendarRouter();
