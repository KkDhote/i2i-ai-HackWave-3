import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSeed } from './data/seedData.js';
import { planWithLLM } from './llm.js';
import { scopeCalls } from './agent/investigate.js';
import { curated } from './plan.js';
import { decide,patchByRules } from './intent.js';
import { parseCurrent } from './intentRoutes.js';
import { runEval } from './eval.js';

const plan = { op:'replace',intent:'usage',confidence:0.9,components:[{id:'usage',span:7},{id:'kpis',span:5},{id:'causes',span:12}],summary:'invented 999 outages',findings:['All tasks complete'],title:'Wrong client'};
const mock = (output=plan, calls=[{tool:'analyze_usage',args:{}}]) => async input => JSON.stringify(input[0].content.includes('investigation step') ? {calls} : output);

test('uses the selected client and displays only recorded findings and reasons', async () => {
  const src = generateSeed();
  const result = await planWithLLM('Review usage',null,{clientId:'harborline',src,chatImpl:mock()});
  assert.equal(result.clientId,'harborline');
  assert.match(result.plan.title,/Utsav Retail/);
  assert.equal(result.agent.calls[0].args.client,'harborline');
  assert.ok(result.agent.findings.every(f=>f.includes('Utsav Retail')));
  assert.doesNotMatch(JSON.stringify(result),/invented 999|All tasks complete|Wrong client/);
});
test('fresh requests reflect changed data and never reuse another client’s results', async () => {
  const src=generateSeed(), opts={src,clientId:'harborline',chatImpl:mock()};
  const first=await planWithLLM('Review usage',null,opts);
  src.usage.filter(u=>u.clientId==='harborline').forEach(u=>{u.users=999;});
  const fresh=await planWithLLM('Review usage',null,opts);
  assert.notDeepEqual(first.agent.findings,fresh.agent.findings);
  assert.match(fresh.agent.findings[0],/999/);
  const other=await planWithLLM('Review usage',null,{...opts,clientId:'solstice'});
  assert.match(other.plan.title,/Surya Energy/);
  assert.equal(other.agent.calls[0].args.client,'solstice');
});
test('rejects out-of-scope checks and invalid or uncertain AI selections', async () => {
  const src=generateSeed(), opts={src,clientId:'harborline'};
  assert.throws(()=>scopeCalls([{tool:'analyze_usage',args:{client:'kestrel'}}],'harborline',src.clients,'Review usage'));
  assert.throws(()=>scopeCalls([{tool:'compare_clients',args:{a:'harborline',b:'kestrel'}}],'harborline',src.clients,'Review usage'));
  assert.throws(()=>scopeCalls([{tool:'compare_clients',args:{a:'northwind',b:'kestrel'}}],'harborline',src.clients,'Compare Utsav and Surya'));
  assert.equal(scopeCalls([{tool:'compare_clients',args:{a:'harborline',b:'solstice'}}],'harborline',src.clients,'Compare Utsav and Surya')[0].tool,'compare_clients');
  for (const output of [{...plan,components:[{id:'invented',span:6}]},{...plan,op:'execute'},{...plan,components:[{id:'usage',span:7},{id:'usage',span:5},{id:'client',span:12}]}]) await assert.rejects(()=>planWithLLM('Review usage',null,{...opts,chatImpl:mock(output)}));
  assert.equal((await planWithLLM('Unclear goal',null,{...opts,chatImpl:mock({...plan,confidence:0.2})})).status,'clarify');
  assert.equal((await planWithLLM('Review usage',null,{...opts,clientId:'missing',chatImpl:mock()})).status,'clarify');
});
test('validates current screens and deterministic refinements preserve context', () => {
  assert.equal(parseCurrent({mode:'meeting',components:[{id:'fake',span:6}]}),undefined);
  const current=curated('meeting',{clientId:'harborline'}).plan;
  assert.ok(parseCurrent(current));
  assert.ok(patchByRules('Also show overdue tasks',current.components).add.some(c=>c.id==='overdue'));
  assert.deepEqual(patchByRules('Also show open issues',current.components),{add:[],remove:[]});
  assert.equal(decide('show client updates').key,'updates');
  assert.equal(decide('review open issues').key,'issues');
  assert.equal(decide('download files').type,'clarify');
});
test('AI refinements require a valid patch and cannot remove the whole interface', async () => {
  const src=generateSeed(),current=curated('meeting',{clientId:'harborline'}).plan;
  const opts={src,clientId:'harborline'};
  await assert.rejects(()=>planWithLLM('Refine this screen',current,{...opts,chatImpl:mock({...plan,op:'patch',patch:'invalid'})}));
  await assert.rejects(()=>planWithLLM('Refine this screen',current,{...opts,chatImpl:mock({...plan,op:'patch',patch:{add:[],remove:current.components.map(c=>c.id)}})}));
  const result=await planWithLLM('Include usage',current,{...opts,chatImpl:mock({...plan,op:'patch',patch:{add:[{id:'usage',span:12}],remove:[]}})});
  assert.equal(result.op,'patch');assert.equal(result.clientId,'harborline');assert.ok(result.plan.components.some(c=>c.id==='usage'));
});
test('all bundled rule examples retain their intended outcome', async () => {
  const result=await runEval(false);
  assert.equal(result.correct,result.total,JSON.stringify(result.rows.filter(r=>!r.ok)));
});
