import assert from 'node:assert/strict';
import test from 'node:test';
import { isTaskRequest, startTaskDialog, advanceTaskDialog, applyTaskIntake } from './taskDialog.js';

const now = new Date(2026, 9, 11, 12);
const advance = (state, value, hindi = false) => advanceTaskDialog(state.draft, value, hindi, now);
const intake = (state, result = {}, hindi = false) => applyTaskIntake(state.draft, { updates: {}, understanding: '', question: null, source: 'rules', ...result }, hindi);
const complete = () => ['Ravi', 'tomorrow'].reduce((state, value) => advance(state, value), intake(startTaskDialog('Add a task: Fix login', false, now)));

test('recognizes creation requests without matching questions about existing tasks', () => {
  for (const value of ['add a task', 'Can you create a new task', 'new task Fix login', 'bhai naya task banao', 'task add karo', 'नया टास्क बनाओ']) assert.equal(isTaskRequest(value), true, value);
  for (const value of ['What is the status of my new task?', 'Show high priority tasks', 'Why did Ravi add a task?', 'How do I add a task?']) assert.equal(isTaskRequest(value), false, value);
});

test('simple tasks collect only missing owner and date, then require confirmation', () => {
  let state = startTaskDialog('create a task', false, now);
  assert.equal(state.draft.field, 'title');
  state = advance(state, 'Fix login');
  assert.equal(state.draft.field, 'intake');
  assert.equal(state.needsIntake, true);
  assert.equal(state.ready, false);
  state = intake(state);
  assert.equal(state.draft.field, 'owner');
  state = advance(state, 'Owner is Ravi');
  assert.equal(state.draft.owner, 'Ravi');
  assert.equal(state.draft.field, 'dueDate');
  state = advance(state, 'tomorrow');
  assert.equal(state.draft.dueDate, '2026-10-12');
  assert.equal(state.draft.priority, 'Medium');
  assert.equal(state.draft.status, 'open');
  assert.equal(state.draft.field, 'review');
  assert.equal(state.ready, true);
  assert.equal(state.confirm, undefined);
  assert.match(state.reply, /Fix login.*Ravi.*2026-10-12.*Medium.*open/s);
  assert.equal(advance(state, 'confirm').confirm, true);
});

test('a full initial brief is preserved and intake can supply all basic fields at once', () => {
  const brief = 'Fix checkout; owner Ravi; due 2026-10-20; high priority; in progress; use the staging UPI account';
  let state = startTaskDialog(`Add task ${brief}`, false, now);
  assert.equal(state.draft.title, 'Fix checkout');
  assert.equal(state.draft.description, brief);
  assert.equal(state.needsIntake, true);
  state = intake(state, { updates: { title: 'Fix UPI checkout', owner: 'Ravi', dueDate: '2026-10-20', priority: 'High', status: 'in_progress' }, understanding: 'Use the supplied staging account.', source: 'llm' });
  assert.equal(state.ready, true);
  assert.equal(state.draft.field, 'review');
  assert.equal(state.draft.source, 'llm');
  assert.equal(state.draft.title, 'Fix UPI checkout');
  assert.equal(state.draft.description, brief);
});

test('adaptive contextual answers trigger intake and preserve actual answers', () => {
  let state = intake(startTaskDialog('Add a task: Create a chatbot'), { question: 'Who will use the chatbot?', understanding: 'Clarify the audience.', source: 'llm' });
  assert.equal(state.draft.field, 'context');
  assert.equal(state.ready, false);
  assert.match(state.reply, /Who will use/);
  state = advance(state, 'Internal support agents; show task status and hurdles.');
  assert.equal(state.needsIntake, true);
  assert.equal(state.draft.field, 'intake');
  assert.deepEqual(state.draft.contextAnswers, [{ question: 'Who will use the chatbot?', answer: 'Internal support agents; show task status and hurdles.' }]);
  assert.match(state.draft.description, /Create a chatbot.*Who will use.*Internal support agents/s);
  state = intake(state, { updates: { owner: 'Asha', dueDate: '2026-10-25' }, understanding: 'Model interpretation is not a user fact.' });
  assert.equal(state.ready, true);
  assert.ok(!state.draft.description.includes('Model interpretation'));
});

test('at most two optional questions are collected', () => {
  let state = startTaskDialog('Add task Create a chatbot');
  for (let number = 1; number <= 2; number++) {
    state = intake(state, { question: `Context question ${number}?` });
    assert.equal(state.draft.field, 'context');
    state = advance(state, `Context answer ${number}`);
    assert.equal(state.needsIntake, true);
  }
  state = intake(state, { updates: { owner: 'Ravi', dueDate: '2026-10-25' }, question: 'A third optional question?' });
  assert.equal(state.draft.contextAnswers.length, 2);
  assert.equal(state.draft.field, 'review');
  assert.equal(state.ready, true);
});

test('optional questions can be skipped without bypassing required details', () => {
  for (const skip of ['skip', 'just add', 'noextraquestions']) {
    let state = intake(startTaskDialog('Add task Create a chatbot'), { question: 'What should the chatbot do?' });
    state = advance(state, skip);
    assert.equal(state.draft.field, 'owner');
    assert.equal(state.draft.intakeComplete, true);
    assert.equal(state.draft.contextAnswers.length, 0);
    assert.equal(state.confirm, undefined);
    state = advance(state, 'Confirm');
    assert.equal(state.draft.owner, '');
    assert.equal(state.draft.field, 'owner');
  }
});

test('invalid dates stay on the due date question and never silently roll over', () => {
  let state = advance(intake(startTaskDialog('add task Fix login')), 'Ravi');
  for (const date of ['2026-02-30', '2026-13-01', '2026-10-00', 'next week', 'skip']) {
    state = advance(state, date);
    assert.equal(state.draft.field, 'dueDate');
    assert.equal(state.draft.dueDate, '');
    assert.equal(state.ready, false);
  }
  state = advance(state, '2028-02-29');
  assert.equal(state.draft.dueDate, '2028-02-29');
  assert.equal(state.ready, true);
});

test('blocked tasks require a real recorded reason before review', () => {
  let state = intake(startTaskDialog('add task Fix login'), { updates: { owner: 'Ravi', dueDate: '2026-10-25', status: 'blocked' } });
  assert.equal(state.draft.field, 'blocker');
  for (const value of ['', 'skip', 'yes', 'Confirm', 'no', 'just add']) {
    state = advance(state, value);
    assert.equal(state.draft.field, 'blocker');
    assert.equal(state.ready, false);
    assert.equal(state.confirm, undefined);
  }
  state = advance(state, 'Waiting for API access');
  assert.equal(state.ready, true);
  assert.match(state.reply, /Waiting for API access/);
});

test('confirmation never becomes task details or skips incomplete intake', () => {
  for (const initial of [startTaskDialog('add task'), intake(startTaskDialog('add task Fix login')), intake(startTaskDialog('add task Fix login'), { question: 'What outcome is needed?' })]) {
    const early = advance(initial, 'yes');
    assert.equal(early.confirm, undefined);
    assert.equal(early.ready, false);
    assert.deepEqual(early.draft.contextAnswers, []);
    assert.equal(early.draft.field, initial.draft.field);
  }
  const malformedReview = advanceTaskDialog({ ...complete().draft, owner: '' }, 'Confirm');
  assert.equal(malformedReview.confirm, undefined);
  assert.equal(malformedReview.draft.field, 'owner');
  const incompleteIntake = advanceTaskDialog({ ...complete().draft, intakeComplete: false }, 'Confirm');
  assert.equal(incompleteIntake.confirm, undefined);
  assert.equal(incompleteIntake.needsIntake, true);
  const review = complete();
  assert.equal(advance(review, 'Looks useful').confirm, undefined);
  assert.equal(advance(review, 'do not save').confirm, undefined);
  assert.equal(advance(review, 'haan').confirm, true);
  assert.equal(advance(review, 'हाँ').confirm, true);
});

test('title edits invalidate context while other edits preserve it', () => {
  let state = intake(startTaskDialog('add task Create a chatbot'), { question: 'Who uses it?' });
  state = advance(state, 'Support agents');
  state = intake(state, { updates: { owner: 'Ravi', dueDate: '2026-10-25' } });
  state = advance(state, 'change owner to Asha');
  assert.equal(state.ready, true);
  assert.equal(state.draft.contextAnswers.length, 1);
  state = advance(state, 'edit title');
  assert.equal(state.draft.field, 'title');
  state = advance(state, 'Review login');
  assert.equal(state.needsIntake, true);
  assert.equal(state.draft.intakeComplete, false);
  assert.deepEqual(state.draft.contextAnswers, []);
  assert.equal(state.draft.description, 'Review login');
  assert.equal(state.draft.owner, 'Asha');
  state = intake(state);
  assert.equal(state.ready, true);
  state = advance(state, 'change due date to 2026-02-30');
  assert.equal(state.draft.field, 'dueDate');
  state = advance(state, 'today');
  state = advance(state, 'change status to blocked');
  assert.equal(state.draft.field, 'blocker');
  state = advance(state, 'Waiting for approval');
  state = advance(state, 'change status to in progress');
  assert.equal(state.draft.status, 'in_progress');
  assert.equal(state.draft.blocker, '');
  assert.equal(state.ready, true);
});

test('cancel works while collecting, understanding context, and after review', () => {
  for (const state of [startTaskDialog('add task'), startTaskDialog('add task Fix login'), intake(startTaskDialog('add task Fix login'), { question: 'What outcome is needed?' }), complete()]) {
    const result = advance(state, 'cancel');
    assert.equal(result.cancelled, true);
    assert.equal(result.confirm, undefined);
    assert.equal(result.ready, false);
  }
});

test('an optional pending reason can be skipped without storing a blocker signal', () => {
  let state = advance(complete(), 'edit blocker');
  assert.match(state.reply, /reason.*skip/i);
  state = advance(state, 'skip');
  assert.equal(state.ready, true);
  assert.equal(state.draft.blocker, '');
});

test('length limits preserve long briefs while rejecting excessive input', () => {
  let state = startTaskDialog(`add task ${'a'.repeat(2000)}`);
  assert.equal(state.draft.title.length, 180);
  assert.equal(state.draft.description.length, 2000);
  assert.equal(state.needsIntake, true);
  assert.equal(startTaskDialog(`add task ${'a'.repeat(2001)}`).draft.field, 'title');
  for (let number = 0; number < 2; number++) {
    state = intake(state, { question: 'q'.repeat(450) });
    assert.equal(state.draft.contextQuestion.length, 240);
    assert.equal(advance(state, 'a'.repeat(1501)).draft.field, 'context');
    state = advance(state, 'a'.repeat(1500));
  }
  assert.equal(state.draft.contextAnswers.length, 2);
  assert.ok(state.draft.description.length <= 6000);
  state = intake(state);
  assert.equal(advance(state, 'a'.repeat(101)).draft.field, 'owner');
  state = advance(state, 'Ravi');
  state = advance(state, 'today');
  state = advance(state, 'edit priority');
  assert.equal(advance(state, 'banana').draft.field, 'priority');
  state = advance(state, 'Low');
  state = advance(state, 'edit status');
  assert.equal(advance(state, 'unknown').draft.field, 'status');
  state = advance(state, 'blocked');
  assert.equal(advance(state, 'a'.repeat(501)).draft.field, 'blocker');
});

test('invalid model basic updates cannot create valid-looking task details', () => {
  const state = intake(startTaskDialog('add task Fix login'), { updates: { title: 'x'.repeat(181), owner: 'x'.repeat(101), dueDate: '2026-02-30', priority: 'Critical', status: 'unknown', blocker: 'x'.repeat(501) } });
  assert.equal(state.draft.title, 'Fix login');
  assert.equal(state.draft.owner, '');
  assert.equal(state.draft.dueDate, '');
  assert.equal(state.draft.priority, 'Medium');
  assert.equal(state.draft.status, 'open');
  assert.equal(state.draft.blocker, '');
  assert.equal(state.draft.field, 'owner');
});

test('Hindi dates use local calendar days including year rollover', () => {
  let state = intake(startTaskDialog('नया टास्क: लॉगिन ठीक करो', true, now), {}, true);
  state = advance(state, 'रवि', true);
  assert.match(state.reply, /aaj ya kal/);
  state = advanceTaskDialog(state.draft, 'कल', true, new Date(2026, 11, 31, 23, 59));
  assert.equal(state.draft.dueDate, '2027-01-01');
  assert.equal(state.ready, true);
  assert.match(state.reply, /Task details check karo/);
});

test('client assignment survives intake and every dialog transition', () => {
  let state = startTaskDialog('add task Fix login');
  state.draft.clientId = 'client-2';
  state = intake(state, { question: 'What is the affected page?' });
  state = advance(state, 'Checkout page');
  state = intake(state);
  state = advance(state, 'Ravi');
  state = advance(state, 'today');
  state = advance(state, 'change priority to High');
  assert.equal(state.draft.clientId, 'client-2');
  assert.equal(advance(state, 'confirm').draft.clientId, 'client-2');
});

test('earlier user facts remain in task description and repeated context is not duplicated', () => {
  const contextBrief = 'The Android login page rejects a valid OTP as invalid after the second attempt.';
  let state = startTaskDialog('Add task for this');
  state = intake(state, { contextBrief, updates: { title: 'Fix invalid OTP on Android login', owner: 'Ravi', dueDate: '2026-10-25' }, question: 'Which Android versions are affected?' });
  const originalBrief = state.draft.originalBrief;
  assert.match(state.draft.description, /Android login page rejects a valid OTP/);
  state = advance(state, 'Android 14 and 15');
  state = intake(state, { contextBrief });
  assert.equal(state.draft.originalBrief, originalBrief);
  assert.equal(state.draft.description.split(contextBrief).length, 2);
  assert.match(state.reply, /invalid after the second attempt.*Android 14 and 15/s);
  const confirmed = advance(state, 'Confirm');
  assert.equal(confirmed.confirm, true);
  assert.match(confirmed.draft.description, /Android login page rejects a valid OTP/);
  assert.match(confirmed.draft.description, /Android 14 and 15/);
});

test('earlier context is bounded and malformed context does not become task facts', () => {
  const state = startTaskDialog('Add task for this');
  for (const contextBrief of [null, {}, 'x'.repeat(2001)]) assert.equal(intake(state, { contextBrief }).draft.originalBrief, 'for this');
  const result = intake(state, { contextBrief: 'x'.repeat(2000) });
  assert.equal(result.draft.originalBrief.length, 2000);
  assert.ok(result.draft.description.length <= 6000);
});
