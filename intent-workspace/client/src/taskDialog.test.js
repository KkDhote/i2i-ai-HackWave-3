import assert from 'node:assert/strict';
import test from 'node:test';
import { isTaskRequest, startTaskDialog, advanceTaskDialog } from './taskDialog.js';

const now = new Date(2026, 9, 11, 12);
const advance = (state, value, hindi = false) => advanceTaskDialog(state.draft, value, hindi, now);
const complete = () => ['Ravi', 'tomorrow', 'High', 'open'].reduce((state, value) => advance(state, value), startTaskDialog('Add a task: Fix login', false, now));

test('recognizes creation requests without matching questions about existing tasks', () => {
  for (const value of ['add a task', 'Can you create a new task', 'new task: Fix login', 'bhai naya task banao', 'task add karo', 'नया टास्क बनाओ']) assert.equal(isTaskRequest(value), true, value);
  for (const value of ['What is the status of my new task?', 'Show high priority tasks', 'Why did Ravi add a task?', 'How do I add a task?']) assert.equal(isTaskRequest(value), false, value);
});

test('collects one field at a time and requires confirmation after review', () => {
  let state = startTaskDialog('create a task', false, now);
  assert.equal(state.draft.field, 'title');
  state = advance(state, 'Fix login');
  assert.equal(state.draft.field, 'owner');
  state = advance(state, 'Owner is Ravi');
  assert.equal(state.draft.owner, 'Ravi');
  assert.equal(state.draft.field, 'dueDate');
  state = advance(state, 'tomorrow');
  assert.equal(state.draft.dueDate, '2026-10-12');
  state = advance(state, 'skip');
  assert.equal(state.draft.priority, 'Medium');
  state = advance(state, 'default');
  assert.equal(state.draft.status, 'open');
  assert.equal(state.draft.field, 'review');
  assert.equal(state.ready, true);
  assert.equal(state.confirm, undefined);
  assert.match(state.reply, /Fix login.*Ravi.*2026-10-12.*Medium.*open/s);
  assert.equal(advance(state, 'confirm').confirm, true);
});

test('invalid dates stay on the due date question and never silently roll over', () => {
  let state = advance(startTaskDialog('add task: Fix login'), 'Ravi');
  for (const date of ['2026-02-30', '2026-13-01', '2026-10-00', 'next week', 'skip']) {
    state = advance(state, date);
    assert.equal(state.draft.field, 'dueDate');
    assert.equal(state.draft.dueDate, '');
    assert.equal(state.ready, false);
  }
  state = advance(state, '2028-02-29');
  assert.equal(state.draft.dueDate, '2028-02-29');
});

test('blocked tasks require a recorded reason before review', () => {
  let state = ['Ravi', 'today', 'High', 'blocked'].reduce((s, value) => advance(s, value), startTaskDialog('add task: Fix login'));
  assert.equal(state.draft.field, 'blocker');
  for (const value of ['', 'skip']) {
    state = advance(state, value);
    assert.equal(state.draft.field, 'blocker');
    assert.equal(state.ready, false);
  }
  state = advance(state, 'Waiting for API access');
  assert.equal(state.ready, true);
  assert.match(state.reply, /Waiting for API access/);
});

test('confirmation cannot save before review or be inferred from ordinary replies', () => {
  const early = advance(startTaskDialog('add task: Fix login'), 'yes');
  assert.equal(early.confirm, undefined);
  assert.equal(early.ready, false);
  assert.equal(early.draft.field, 'owner');
  assert.equal(early.draft.owner, '');
  const malformedReview = advanceTaskDialog({ ...complete().draft, owner: '' }, 'Confirm');
  assert.equal(malformedReview.confirm, undefined);
  assert.equal(malformedReview.draft.field, 'owner');
  const review = complete();
  assert.equal(advance(review, 'Looks useful').confirm, undefined);
  assert.equal(advance(review, 'do not save').confirm, undefined);
  assert.equal(advance(review, 'haan').confirm, true);
  assert.equal(advance(review, 'हाँ').confirm, true);
});

test('review edits keep other fields and recheck a blocked status', () => {
  let state = advance(complete(), 'change owner to Asha');
  assert.equal(state.ready, true);
  assert.equal(state.draft.owner, 'Asha');
  state = advance(state, 'edit title');
  assert.equal(state.ready, false);
  assert.equal(state.draft.field, 'title');
  state = advance(state, 'Review login');
  assert.equal(state.draft.owner, 'Asha');
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

test('cancel works while collecting and after review', () => {
  for (const state of [startTaskDialog('add task'), complete()]) {
    const result = advance(state, 'cancel');
    assert.equal(result.cancelled, true);
    assert.equal(result.confirm, undefined);
    assert.equal(result.ready, false);
  }
});

test('an optional reason can be skipped without storing a blocker signal', () => {
  let state = advance(complete(), 'edit blocker');
  assert.match(state.reply, /reason.*skip/i);
  state = advance(state, 'skip');
  assert.equal(state.ready, true);
  assert.equal(state.draft.blocker, '');
});

test('length limits and invalid choices do not advance the conversation', () => {
  assert.equal(startTaskDialog(`add task: ${'a'.repeat(181)}`).draft.field, 'title');
  let state = startTaskDialog('add task: Fix login');
  assert.equal(advance(state, 'a'.repeat(101)).draft.field, 'owner');
  state = advance(state, 'Ravi');
  state = advance(state, 'today');
  assert.equal(advance(state, 'banana').draft.field, 'priority');
  state = advance(state, 'Low');
  assert.equal(advance(state, 'unknown').draft.field, 'status');
  state = advance(state, 'blocked');
  assert.equal(advance(state, 'a'.repeat(501)).draft.field, 'blocker');
});

test('Hindi dates use local calendar dates, including year rollover', () => {
  let state = startTaskDialog('नया टास्क: लॉगिन ठीक करो', true, now);
  state = advance(state, 'रवि', true);
  assert.match(state.reply, /aaj ya kal/);
  state = advanceTaskDialog(state.draft, 'कल', true, new Date(2026, 11, 31, 23, 59));
  assert.equal(state.draft.dueDate, '2027-01-01');
  state = advance(state, 'मध्यम', true);
  state = advance(state, 'लंबित', true);
  assert.equal(state.ready, true);
  assert.match(state.reply, /Task details check karo/);
});
