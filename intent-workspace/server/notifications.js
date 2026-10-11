import { createHash } from 'node:crypto';
import { taskKey } from './goalsRoutes.js';
import { isTaskOpen } from './taskStatus.js';

export const notificationSchedule = { daysBefore: [3, 1], timezone: 'Asia/Kolkata' };
const dayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: notificationSchedule.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
const hash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const time = value => {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const parsed = Date.parse(value), calendarDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  // Date.parse normalizes dates such as 30 February; do not turn those into a due reminder.
  if (calendarDate && (!Number.isFinite(parsed) || new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate)) return NaN;
  return parsed;
};
const day = timestamp => {
  const parts = Object.fromEntries(dayFormat.formatToParts(timestamp).map(part => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000;
};

export function buildNotifications(tasks = [], goals = [], now = Date.now()) {
  const current = new Date(now).getTime();
  if (!Number.isFinite(current)) throw new TypeError('A valid current time is required.');
  const today = day(current), notifications = [], tasksByKey = new Map(tasks.map(task => [taskKey(task), task]));
  for (const task of tasks) {
    if (!isTaskOpen(task)) continue;
    const key = taskKey(task), title = task.title || 'Untitled task', due = time(task.dueAt);
    const base = { taskKey: key, owner: task.owner || null, href: `#task-${key}` };
    if (task.blocker || String(task.status).toLowerCase() === 'blocked') {
      const reason = typeof task.blocker === 'string' ? task.blocker.trim() : '';
      notifications.push({ ...base, id: `task:${key}:blocked:${hash(reason)}`, kind: 'blocked', severity: 'high', title: `Blocked: ${title}`,
        message: reason || 'This task is marked blocked. No blocker reason has been recorded.' });
    }
    if (!Number.isFinite(due)) {
      const missing = task.dueAt == null || task.dueAt === '';
      notifications.push({ ...base, id: `task:${key}:schedule:${hash(task.dueAt ?? '')}`, kind: missing ? 'missing_due_date' : 'invalid_due_date', severity: 'medium',
        title: `Check due date: ${title}`, message: missing ? 'No due date is recorded. Add one to receive advance reminders.' : 'The recorded due date is invalid. Correct it to receive advance reminders.' });
      continue;
    }
    const daysUntilDue = day(due) - today, dueAt = new Date(due).toISOString();
    let kind, severity, label, message;
    if (due < current) {
      kind = 'overdue'; severity = 'high'; label = 'Overdue'; message = `This task was due on ${dayFormat.format(due)} and is still unfinished.`;
    } else if (daysUntilDue === 0) {
      kind = 'due_today'; severity = 'high'; label = 'Due today'; message = 'This task is due today. Check its progress and any pending work.';
    } else if (daysUntilDue === 1) {
      kind = 'due_1d'; severity = 'high'; label = 'Due tomorrow'; message = 'One-day reminder: this task is due tomorrow.';
    } else if (daysUntilDue === 2 || daysUntilDue === 3) {
      kind = 'due_3d'; severity = String(task.priority).toLowerCase() === 'high' ? 'high' : 'medium'; label = `Due in ${daysUntilDue} days`;
      message = daysUntilDue === 3 ? 'Three-day reminder: prepare for this task’s due date.' : 'Advance reminder: this task is due in two days.';
    } else continue;
    notifications.push({ ...base, id: `task:${key}:${kind}:${dueAt}`, kind, severity, title: `${label}: ${title}`, message, dueAt, daysUntilDue });
  }

  for (const goal of goals) {
    if (goal.status !== 'active' || !goal.id) continue;
    const keys = [...new Set(Array.isArray(goal.taskKeys) ? goal.taskKeys : [])];
    const missing = keys.filter(key => !tasksByKey.has(key)), linked = keys.map(key => tasksByKey.get(key)).filter(Boolean);
    const base = { goalId: goal.id, href: `#goal-${goal.id}`, severity: 'medium' };
    if (missing.length) notifications.push({ ...base, id: `goal:${goal.id}:missing:${hash(missing.sort().join(','))}`, kind: 'goal_missing_tasks',
      title: `Missing tasks: ${goal.title}`, message: `${missing.length} linked task(s) could not be found. Review this goal’s task links.` });
    const updated = time(goal.updatedAt);
    if (Number.isFinite(updated) && updated <= current - 7 * 86400000 && linked.some(isTaskOpen)) notifications.push({ ...base,
      id: `goal:${goal.id}:stalled:${new Date(updated).toISOString()}`, kind: 'goal_stalled', title: `Goal needs an update: ${goal.title}`,
      message: 'This active goal has not been updated in 7 days and still has unfinished tasks.' });
  }
  const severityOrder = { high: 0, medium: 1, low: 2 }, kindOrder = { overdue: 0, blocked: 1, due_today: 2, due_1d: 3, due_3d: 4 };
  return notifications.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    || (kindOrder[a.kind] ?? 5) - (kindOrder[b.kind] ?? 5)
    || (a.dueAt ? time(a.dueAt) : Infinity) - (b.dueAt ? time(b.dueAt) : Infinity)
    || a.id.localeCompare(b.id));
}
