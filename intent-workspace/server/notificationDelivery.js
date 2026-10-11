import { reminderChannels } from './customerReminders.js';

const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const deliveryError = (message, deliveryState) => Object.assign(new Error(message), { deliveryState });

function reminderText(reminder, task, alert) {
  const date = new Date(task.dueAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Reminder due date is invalid.');
  const dueDate = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
  const name = clean(reminder.customerName, 100) || 'Customer';
  const title = clean(task.title, 150) || 'Your task';
  const days = alert?.daysUntilDue;
  const update = alert?.kind === 'overdue' ? 'The due date has passed.'
    : alert?.kind === 'due_today' ? 'Due today.'
    : alert?.kind === 'due_1d' ? 'Due tomorrow.'
    : alert?.kind === 'due_3d' ? `Due in ${Number.isInteger(days) && days > 0 && days <= 3 ? days : 3} days.`
    : 'Upcoming due date reminder.';
  return { name, title, dueDate, update, text: `Hello ${name}, ${title} is due on ${dueDate}. ${update} Please contact your task team for any assistance. - I2I By AI` };
}

export async function sendReminder(channel, reminder, task, alert, deliveryId, { fetchImpl = fetch, env = process.env } = {}) {
  const config = reminderChannels(env)[channel];
  if (!config?.configured) throw new Error('The reminder channel needs provider configuration.');
  if (channel === 'email' ? !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(reminder.email ?? '') : !/^\+[1-9]\d{7,14}$/.test(reminder.phone ?? '')) throw new Error('The reminder customer contact is invalid.');
  const content = reminderText(reminder, task, alert);
  let url, headers, body;
  if (channel === 'email') {
    if (typeof deliveryId !== 'string' || !deliveryId.length || deliveryId.length > 256 || /[\r\n]/.test(deliveryId)) throw new Error('The reminder delivery reference is invalid.');
    url = 'https://api.resend.com/emails';
    headers = { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryId };
    body = JSON.stringify({ from: env.NOTIFICATION_EMAIL_FROM.trim(), to: [reminder.email], subject: `I2I By AI: ${content.title} due ${content.dueDate}`, text: content.text });
  } else {
    url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID.trim()}/Messages.json`;
    headers = { Authorization: `Basic ${Buffer.from(`${env.TWILIO_API_KEY_SID.trim()}:${env.TWILIO_API_KEY_SECRET.trim()}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' };
    const form = new URLSearchParams({ To: channel === 'whatsapp' ? `whatsapp:${reminder.phone}` : reminder.phone, From: (channel === 'whatsapp' ? env.TWILIO_WHATSAPP_FROM : env.TWILIO_SMS_FROM).trim() });
    if (channel === 'whatsapp') {
      form.set('ContentSid', env.TWILIO_WHATSAPP_CONTENT_SID.trim());
      form.set('ContentVariables', JSON.stringify({ 1: content.name, 2: content.title, 3: content.dueDate, 4: content.update }));
    } else form.set('Body', content.text);
    body = form.toString();
  }
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000), redirect: 'error' });
  } catch {
    throw deliveryError(`${config.provider} request outcome is unknown. Check the provider console before retrying.`, 'unknown');
  }
  if (!response.ok) throw deliveryError(`${config.provider} rejected the reminder request. Check the provider console.`, 'failed');
  let result;
  try { result = await response.json(); } catch { throw deliveryError(`${config.provider} response could not be confirmed. Check the provider console before retrying.`, 'unknown'); }
  const providerId = channel === 'email' ? result?.id : result?.sid;
  if (typeof providerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(providerId)) throw deliveryError(`${config.provider} response could not be confirmed. Check the provider console before retrying.`, 'unknown');
  return { providerId, status: 'accepted' };
}
