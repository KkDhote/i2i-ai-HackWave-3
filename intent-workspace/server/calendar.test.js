import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { createCalendarRouter } from './calendarRoutes.js';
import { parseCalendarEntry, googleEvent, eventId, taskEntries, mapUrl, sealTokens, openTokens, calendarConfig, calendarScope } from './calendar.js';
import { taskKey } from './goalsRoutes.js';

const meeting = { id: 'meeting-1', title: 'Pune review', kind: 'meeting', date: '2026-10-15', time: '14:30', endTime: '15:15', meet: true, location: 'Baner, Pune', description: 'Review launch', clientId: 'northwind' };
test('valid dates, India times, locations and unique Meet requests', () => {
  assert.ok(parseCalendarEntry(meeting));
  for (const invalid of [{ ...meeting, date: '2026-02-30' }, { ...meeting, kind: '__proto__' }, { ...meeting, time: '25:00' }, { ...meeting, time: '' }, { ...meeting, endTime: '14:00' }, { ...meeting, location: {} }, { ...meeting, meet: 'true' }, { ...meeting, kind: 'task' }]) assert.equal(parseCalendarEntry(invalid), null);
  const event = googleEvent(meeting);
  assert.equal(event.start.dateTime, '2026-10-15T09:00:00.000Z');
  assert.equal(event.end.dateTime, '2026-10-15T09:45:00.000Z');
  assert.equal(event.location, meeting.location);
  assert.equal(event.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.notEqual(event.conferenceData.createRequest.requestId, googleEvent({ ...meeting, id: 'meeting-2' }).conferenceData.createRequest.requestId);
  assert.deepEqual(googleEvent(meeting, { entryPoints: [] }).conferenceData, { entryPoints: [] });
  assert.match(eventId(meeting), /^[a-v0-9]{5,1024}$/);
  const day = googleEvent({ ...meeting, kind: 'work_done', time: '', endTime: '', meet: false });
  assert.deepEqual(day.start, { date: '2026-10-15' }); assert.deepEqual(day.end, { date: '2026-10-16' }); assert.deepEqual(day.reminders.overrides, []);
  assert.equal(new URL(mapUrl('Pune & Mumbai')).searchParams.get('query'), 'Pune & Mumbai');
  assert.equal(mapUrl(''), null);
});
test('deadline and actual completion dates are separate; tokens are encrypted', () => {
  const task = { title: 'Review', status: 'done', dueAt: '2026-10-15T18:29:59.999Z', priority: 'High' };
  assert.equal(taskEntries(task, 'key').length, 1);
  const entries = taskEntries({ ...task, completedAt: '2026-10-16T20:00:00Z' }, 'key');
  assert.equal(entries[1].date, '2026-10-17'); assert.equal(entries[1].kind, 'work_done');
  const key = randomBytes(32), tokens = { access_token: 'private-access', refresh_token: 'private-refresh' }, encrypted = sealTokens(tokens, key);
  assert.ok(!encrypted.includes('private')); assert.deepEqual(openTokens(encrypted, key), tokens);
  assert.throws(() => openTokens(encrypted, randomBytes(32)));
  assert.equal(calendarConfig({}).configured, false);
  assert.equal(calendarConfig({ GOOGLE_CLIENT_ID: 'fake', GOOGLE_CLIENT_SECRET: 'fake', GOOGLE_CALENDAR_TOKEN_KEY: key.toString('base64'), GOOGLE_CALENDAR_APP_URL: 'https://remote.example/' }).configured, false);
});
test('local OAuth, isolated client entries, idempotent sync and Meet pending/success', async () => {
  const task = { title: 'Invoice review', owner: 'Ravi', dueAt: '2026-10-15T18:29:59.999Z', status: 'open', priority: 'High', clientId: 'northwind', location: 'Pune' };
  const rows = { iw_clients: [{ id: 'northwind' }, { id: 'kestrel' }], iw_tasks: [task], iw_calendar_entries: [], iw_calendar_sync: [], iw_calendar_connection: [] };
  const match = (row, query) => Object.entries(query).every(([key, value]) => row[key] === value);
  const db = { collection(name) { return {
    find(query) { return { toArray: async () => structuredClone(rows[name].filter(row => match(row, query))) }; },
    findOne: async query => structuredClone(rows[name].find(row => match(row, query)) || null),
    insertOne: async row => rows[name].push(structuredClone(row)),
    updateOne: async (query, update, options) => { let row = rows[name].find(row => match(row, query)); if (!row && options?.upsert) { row = { ...query }; rows[name].push(row); } if (row) { Object.assign(row, update.$set || {}); for (const key of Object.keys(update.$unset || {})) delete row[key]; } }
  }; } };
  const env = { GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret', GOOGLE_CALENDAR_TOKEN_KEY: randomBytes(32).toString('base64') };
  const events = new Map(), requests = []; let inserts = 0, pending = true;
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const result = body => ({ ok: true, status: 200, json: async () => body });
    if (url === 'https://oauth2.googleapis.com/token') return result({ access_token: 'fake-access', refresh_token: 'fake-refresh', scope: calendarScope, expires_in: 3600 });
    if (url.endsWith('/calendars')) return result({ id: 'fake-calendar', summary: 'I2I By AI' });
    if (options.method === 'GET') { const id = url.split('/').at(-1); return events.has(id) ? result(events.get(id)) : { ok: false, status: 404, json: async () => ({}) }; }
    const body = JSON.parse(options.body); if (options.method === 'POST') inserts++;
    const event = { ...body, htmlLink: 'https://www.google.com/calendar/event?eid=fake', ...(body.conferenceData ? { conferenceData: pending ? { createRequest: { status: { statusCode: 'pending' } } } : { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }], createRequest: { status: { statusCode: 'success' } } } } : {}) };
    events.set(body.id, event); return result(event);
  };
  const app = express(); app.use(express.json()); app.use(createCalendarRouter({ getDatabase: async () => db, env, fetchImpl }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, body, headers = {}) => fetch(base + '/api/calendar/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
  try {
    assert.equal((await call('connect', {}, { Origin: 'https://untrusted.example' })).status, 403);
    const connect = await call('connect', {}), auth = new URL((await connect.json()).url), state = auth.searchParams.get('state');
    assert.equal(auth.searchParams.get('scope'), calendarScope); assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    assert.equal((await call(`oauth/callback?state=${state}&code=fake`)).status, 400);
    const callback = await call(`oauth/callback?state=${state}&code=fake`, undefined, { Cookie: connect.headers.get('set-cookie').split(';')[0] });
    assert.equal(callback.status, 302); assert.ok(rows.iw_calendar_connection[0].tokens); assert.ok(!rows.iw_calendar_connection[0].tokens.includes('fake-access'));
    assert.equal((await call(`oauth/callback?state=${state}&code=fake`, undefined, { Cookie: connect.headers.get('set-cookie').split(';')[0] })).status, 400);
    const saved = await (await call('entries', { ...meeting, taskKey: taskKey(task) })).json();
    assert.equal((await call('entries', { ...meeting, clientId: 'kestrel', taskKey: taskKey(task) })).status, 400);
    assert.equal((await (await call('entries?clientId=kestrel')).json()).length, 0);
    const sync = await (await call('sync?clientId=northwind', { ids: [saved.id] })).json();
    assert.equal(sync.results[0].meetState, 'pending'); assert.equal(sync.results[0].meetUrl, null);
    pending = false;
    const updated = await (await call('sync?clientId=northwind', { ids: [saved.id] })).json();
    assert.equal(updated.results[0].meetUrl, 'https://meet.google.com/abc-defg-hij'); assert.equal(inserts, 1);
    assert.equal((await call('sync?clientId=kestrel', { ids: [saved.id] })).status, 400);
    assert.ok(requests.some(request => request.url.includes('conferenceDataVersion=1')));
    assert.ok(!JSON.stringify(await (await call('status')).json()).includes('fake-access'));
    await call('disconnect', {}); assert.equal((await (await call('status')).json()).connected, false); assert.equal(events.size, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
