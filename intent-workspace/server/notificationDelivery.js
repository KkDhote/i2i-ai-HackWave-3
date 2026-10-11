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
  if (channel !== 'email') throw new Error('Only email reminders are supported.');
  const config = reminderChannels(env).email;
  if (!config?.configured) throw new Error('The reminder channel needs provider configuration.');
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(reminder.email ?? '')) throw new Error('The reminder customer contact is invalid.');
  const content = reminderText(reminder, task, alert);
  if (typeof deliveryId !== 'string' || !deliveryId.length || deliveryId.length > 256 || /[\r\n]/.test(deliveryId)) throw new Error('The reminder delivery reference is invalid.');
  const url = 'https://api.resend.com/emails';
  const headers = { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': deliveryId };
  const body = JSON.stringify({ from: env.NOTIFICATION_EMAIL_FROM.trim(), to: [reminder.email], subject: `I2I By AI: ${content.title} due ${content.dueDate}`, text: content.text });
  let response;
  try {
    response = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000), redirect: 'error' });
  } catch {
    throw deliveryError(`${config.provider} request outcome is unknown. Check the provider console before retrying.`, 'unknown');
  }
  if (!response.ok) throw deliveryError(`${config.provider} rejected the reminder request. Check the provider console.`, 'failed');
  let result;
  try { result = await response.json(); } catch { throw deliveryError(`${config.provider} response could not be confirmed. Check the provider console before retrying.`, 'unknown'); }
  const providerId = result?.id;
  if (typeof providerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(providerId)) throw deliveryError(`${config.provider} response could not be confirmed. Check the provider console before retrying.`, 'unknown');
  return { providerId, status: 'accepted' };
}
