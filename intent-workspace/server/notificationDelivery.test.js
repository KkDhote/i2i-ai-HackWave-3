import assert from 'node:assert/strict';
import { reminderChannels } from './customerReminders.js';
import { sendReminder } from './notificationDelivery.js';

// Dummy credentials and mocked responses: these checks never contact a provider.
const env = { TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_API_KEY_SID: `SK${'b'.repeat(32)}`, TWILIO_API_KEY_SECRET: 'dummy-secret', TWILIO_SMS_FROM: '+14155552344', TWILIO_WHATSAPP_FROM: 'whatsapp:+14155552344', TWILIO_WHATSAPP_CONTENT_SID: `HX${'c'.repeat(32)}`, RESEND_API_KEY: 're_dummy', NOTIFICATION_EMAIL_FROM: 'I2I By AI <updates@example.in>' };
const reminder = { customerName: 'Neha Sharma', email: 'neha@example.in', phone: '+919876543210' };
const task = { title: 'GST invoice review', dueAt: '2026-10-13T18:30:00.000Z', blocker: 'INTERNAL SECRET REASON', owner: 'INTERNAL OWNER' };
const alert = { kind: 'due_3d', daysUntilDue: 3, message: 'INTERNAL SECRET REASON' };
let request;
const fetchImpl = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ sid: `SM${'d'.repeat(32)}`, id: 'fake-resend-id' }) }; };
assert.ok(Object.values(reminderChannels(env)).every(channel => channel.configured && !channel.missing.length));
assert.deepEqual(reminderChannels({}).email.missing, ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM']);
assert.ok(reminderChannels({ ...env, TWILIO_API_KEY_SECRET: '' }).sms.missing.includes('TWILIO_API_KEY_SECRET'));
assert.ok(reminderChannels({ ...env, TWILIO_WHATSAPP_CONTENT_SID: 'invalid' }).whatsapp.missing.includes('TWILIO_WHATSAPP_CONTENT_SID'));
assert.ok(reminderChannels({ ...env, NOTIFICATION_EMAIL_FROM: 'invalid' }).email.missing.includes('NOTIFICATION_EMAIL_FROM'));
assert.ok(reminderChannels({ ...env, TWILIO_SMS_FROM: '9876543210' }).sms.missing.includes('TWILIO_SMS_FROM'));

assert.deepEqual(await sendReminder('sms', reminder, task, alert, 'delivery-1', { env, fetchImpl }), { providerId: `SM${'d'.repeat(32)}`, status: 'accepted' });
assert.equal(request.url, `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`);
assert.equal(request.method, 'POST');
assert.equal(request.headers.Authorization, `Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`).toString('base64')}`);
assert.equal(request.headers['Content-Type'], 'application/x-www-form-urlencoded');
assert.equal(request.redirect, 'error');
assert.ok(request.signal instanceof AbortSignal);
let form = new URLSearchParams(request.body);
assert.equal(form.get('To'), reminder.phone);
assert.equal(form.get('From'), env.TWILIO_SMS_FROM);
assert.match(form.get('Body'), /14 Oct 2026/);
assert.match(form.get('Body'), /Due in 3 days/);
assert.ok(!request.body.includes('INTERNAL'));

await sendReminder('whatsapp', reminder, task, { kind: 'due_1d' }, 'delivery-2', { env, fetchImpl });
form = new URLSearchParams(request.body);
assert.equal(form.get('To'), `whatsapp:${reminder.phone}`);
assert.equal(form.get('From'), env.TWILIO_WHATSAPP_FROM);
assert.equal(form.get('ContentSid'), env.TWILIO_WHATSAPP_CONTENT_SID);
assert.equal(form.get('Body'), null);
assert.deepEqual(JSON.parse(form.get('ContentVariables')), { 1: reminder.customerName, 2: task.title, 3: '14 Oct 2026', 4: 'Due tomorrow.' });

assert.deepEqual(await sendReminder('email', reminder, task, alert, 'delivery-email', { env, fetchImpl }), { providerId: 'fake-resend-id', status: 'accepted' });
assert.equal(request.url, 'https://api.resend.com/emails');
assert.equal(request.headers.Authorization, 'Bearer re_dummy');
assert.equal(request.headers['Idempotency-Key'], 'delivery-email');
assert.equal(request.headers['Content-Type'], 'application/json');
const email = JSON.parse(request.body);
assert.equal(email.from, env.NOTIFICATION_EMAIL_FROM);
assert.deepEqual(email.to, [reminder.email]);
assert.match(email.subject, /GST invoice review due 14 Oct 2026/);
assert.match(email.text, /Hello Neha Sharma/);
assert.ok(!email.text.includes('INTERNAL'));

const noCall = async () => { throw new Error('Unexpected provider call'); };
await assert.rejects(sendReminder('sms', reminder, task, alert, 'delivery', { env: {}, fetchImpl: noCall }), /needs provider configuration/);
await assert.rejects(sendReminder('email', reminder, task, alert, '', { env, fetchImpl: noCall }), /delivery reference is invalid/);
await assert.rejects(sendReminder('email', reminder, task, alert, 'x'.repeat(257), { env, fetchImpl: noCall }), /delivery reference is invalid/);
await assert.rejects(sendReminder('whatsapp', { ...reminder, phone: '9876543210' }, task, alert, 'delivery', { env, fetchImpl: noCall }), /contact is invalid/);
await assert.rejects(sendReminder('sms', reminder, { ...task, dueAt: 'bad' }, alert, 'delivery', { env, fetchImpl: noCall }), /due date is invalid/);
const failingFetch = async () => { throw new Error(`Raw details ${env.TWILIO_API_KEY_SECRET}`); };
await assert.rejects(sendReminder('sms', reminder, task, alert, 'delivery', { env, fetchImpl: failingFetch }), error => error.deliveryState === 'unknown' && /outcome is unknown/.test(error.message) && !error.message.includes(env.TWILIO_API_KEY_SECRET));
const rejectedFetch = async () => ({ ok: false, json: async () => ({ message: env.RESEND_API_KEY }) });
await assert.rejects(sendReminder('email', reminder, task, alert, 'delivery', { env, fetchImpl: rejectedFetch }), error => error.deliveryState === 'failed' && /rejected/.test(error.message) && !error.message.includes(env.RESEND_API_KEY));
const invalidFetch = async () => ({ ok: true, json: async () => ({ token: env.RESEND_API_KEY }) });
await assert.rejects(sendReminder('email', reminder, task, alert, 'delivery', { env, fetchImpl: invalidFetch }), /could not be confirmed/);
console.log('Notification delivery configuration and mocked provider checks passed.');
