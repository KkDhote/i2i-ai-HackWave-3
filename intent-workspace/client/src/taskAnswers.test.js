import assert from 'node:assert/strict';
import { answerTasks, answerWorkspace } from './taskAnswers.js';
const tasks = [
  { title: 'Fix login', status: 'open', priority: 'High', blocker: 'Waiting for access', dueAt: '2026-01-01' },
  { title: 'Write docs', status: 'open', priority: 'Low' },
  { title: 'Old critical task', status: 'done', priority: 'Critical' }
];
const now = Date.parse('2026-10-11');
const top = answerTasks('priority tasks', tasks, false, now);
assert.ok(top.indexOf('Fix login') < top.indexOf('Write docs'));
assert.ok(!top.includes('Old critical task'));
assert.match(answerTasks('why is Fix login pending', tasks, false, now), /Waiting for access/);
assert.match(answerTasks('Write docs', tasks), /No reason.*recorded/);
assert.ok(!answerTasks('blocked tasks', tasks).includes('Write docs'));
assert.match(answerTasks('unknown task name', tasks), /No matching tasks/);
assert.match(answerTasks('priority tasks', []), /No task records/);
assert.match(answerTasks('priority tasks', tasks, true, now), /Recorded priority/);
assert.match(answerTasks('why is login blocked', tasks), /Waiting for access/);
assert.match(answerTasks('why is unknown task blocked', tasks), /No matching tasks/);
assert.match(answerWorkspace('What should we do next?', tasks, [], { recommendations: [{ title: 'Unblock login', recommendation: 'Get access', evidence: [{ task: 'Fix login', blocker: 'Waiting for access' }] }] }), /Get access.*Waiting for access/s);
assert.match(answerWorkspace('Why is my goal only 25% complete?', tasks, [{ title: 'Recovery', taskKeys: [], status: 'active', progress: 25, completedTasks: 1, totalTasks: 4 }], {}), /25% complete; 1 of 4/);
assert.match(answerWorkspace('why is this goal pending', tasks, [{ title: 'A' }, { title: 'B' }], {}), /Which goal/);
console.log('Task answers: all checks passed.');
