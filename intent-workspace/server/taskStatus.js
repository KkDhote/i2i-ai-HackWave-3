export const isTaskOpen = task => !['done', 'completed', 'closed'].includes(String(task.status).toLowerCase());
