import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceRequest } from './workspaceRequest.js';
import { evidenceFor } from './lib.js';

test('explicit display requests map to supported views; ordinary questions and writes do not', () => {
  assert.deepEqual(workspaceRequest('Show Utsav open issues'),{type:'layout',pick:'issues'});
  assert.deepEqual(workspaceRequest('Open calendar'),{type:'calendar'});
  assert.equal(workspaceRequest('Also show overdue tasks').type,'refine');
  assert.equal(workspaceRequest('Remove next actions').type,'refine');
  assert.deepEqual(workspaceRequest('usage dikhao'),{type:'layout',pick:'usage'});
  for (const q of ['What is Fix login status?','Add a task: Fix login','Show priority tasks','Send an email','Do not show usage','Sync calendar','Show meeting and usage']) assert.equal(workspaceRequest(q),null,q);
});
test('widget explanations handle absent data and do not claim growing usage fell', () => {
  const data={usage:[10,15,20],usageMeta:{significant:false},tasks:[],comms:[],segs:[],causes:[],load:[],blockers:[],accts:[],releases:[]};
  assert.match(evidenceFor({id:'usage'},data).text,/10 at the start, 20 in the latest/);
  assert.doesNotMatch(evidenceFor({id:'usage'},data).text,/fell/);
  for (const id of ['overdue','comms','segs','causes','load','blockers','accts']) assert.ok(evidenceFor({id},data));
  assert.doesNotMatch(evidenceFor({id:'overdue'},data).text,/Infinity/);
});
