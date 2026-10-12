import assert from 'node:assert/strict';
import test from 'node:test';
import { renderVerifiedAnswer, selectAnswerByRules, validateAnswerSelection } from './verifiedAnswers.js';

const now = Date.parse('2026-10-12T08:00:00Z');
const evidence = { tasks:[
  { taskKey:'a',title:'Fix login',owner:'Ravi',status:'open',priority:'High',dueAt:'2026-10-10T18:29:59.999Z',blocker:null,description:'Use staging only' },
  { taskKey:'b',title:'Fix checkout',owner:'Priya',status:'blocked',priority:'Medium',dueAt:'2026-10-20T18:29:59.999Z',blocker:'Awaiting test access' },
  { taskKey:'c',title:'Closed critical',status:'done',priority:'Critical' }
], goals:[{ id:'g',title:'Release',status:'active',progress:50,completedTasks:1,totalTasks:2 }] };
const selected = (intent,taskKeys=[]) => validateAnswerSelection({ intent,confidence:0.9,taskKeys,goalIds:[] },evidence);

test('rejects invented, duplicate, cross-client or ambiguous record references', () => {
  for (const value of [null,{}, {intent:'task_status',confidence:0.2,taskKeys:['a']}, {intent:'task_status',confidence:0.9,taskKeys:['other-client']}, {intent:'task_status',confidence:0.9,taskKeys:['a','b']}, {intent:'goals',confidence:0.9,goalIds:['unknown']}, {intent:'transfer',confidence:1}]) assert.equal(validateAnswerSelection(value,evidence),null);
  assert.match(renderVerifiedAnswer(null,evidence), /Which task/);
});
test('renders facts from records and ignores model-supplied claims', () => {
  const selection = validateAnswerSelection({intent:'task_status',confidence:0.9,taskKeys:['a'],answer:'Completed yesterday; owner Rahul; paid ₹5000',status:'done',blocker:'Server down'},evidence);
  const answer = renderVerifiedAnswer(selection,evidence,{now});
  assert.match(answer,/status: open.*Priority: High.*Owner: Ravi/s);
  assert.match(answer,/blocker\/reason: Not recorded/);
  assert.match(answer,/10 Oct 2026 \(India time\)/);
  assert.doesNotMatch(answer,/Rahul|Server down|₹5000|Completed yesterday/);
});
test('ranking and goal totals are calculated and completed work excluded from priorities', () => {
  const answer = renderVerifiedAnswer(selected('priority'),evidence,{now});
  assert.ok(answer.indexOf('Fix login') < answer.indexOf('Fix checkout'));
  assert.doesNotMatch(answer,/Closed critical/);
  assert.match(renderVerifiedAnswer(selected('goals'),evidence),/50% complete; 1 of 2/);
});
test('missing fields, limited snapshots, and suggestions never pretend execution', () => {
  const partial = {...evidence,partial:true};
  assert.match(renderVerifiedAnswer(selected('task_status',['c']),partial),/Due date: Not recorded/);
  assert.match(renderVerifiedAnswer(selected('priority'),partial),/limited snapshot/);
  assert.match(renderVerifiedAnswer(selected('next_steps',['b']),evidence),/Suggested next step:.*has not been performed/s);
  assert.match(renderVerifiedAnswer(selected('task_details',['a']),evidence),/Use staging only/);
});
test('resolves only unambiguous prior user references and redirects unrelated questions', () => {
  assert.equal(selectAnswerByRules('Why is it pending?',evidence,[{role:'user',content:'Fix login'}]).taskKeys[0],'a');
  assert.equal(selectAnswerByRules('Why is it pending?',evidence,[{role:'assistant',content:'Fix login'}]),null);
  assert.equal(selectAnswerByRules('Why is it pending?',evidence,[{role:'user',content:'Fix login and Fix checkout'}]),null);
  assert.equal(selectAnswerByRules('Why is unknown task blocked?',evidence),null);
  assert.equal(selectAnswerByRules('priority tasks',evidence).intent,'priority');
  assert.equal(selectAnswerByRules('What is the weather?',evidence).intent,'unsupported');
  assert.match(renderVerifiedAnswer(selected('task_status',['a']),evidence,{hindi:true,now}),/Fix login।/);
});
