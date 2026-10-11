import assert from 'node:assert/strict';
import test from 'node:test';
import { quickActionsFor } from './clientQuickActions.js';
import { CLIENT_INDEX } from '../../server/data/seedData.js';
import { curated } from '../../server/plan.js';

test('each client has six distinct supported actions with the right client context', () => {
  for (const client of [...CLIENT_INDEX, { id: 'new-client' }]) {
    const actions = quickActionsFor(client.id);
    assert.equal(actions.length, 6);
    assert.equal(new Set(actions.map(a => a.label)).size, 6);
    assert.equal(new Set(actions.map(a => a.pick)).size, 6);
    for (const action of actions) {
      const result = curated(action.pick, { clientId: client.id });
      assert.equal(result.clientId, client.id);
      assert.ok(result.plan.components.length >= 3);
      if (client.name && action.pick !== 'overdue') assert.ok(result.plan.title.includes(client.name));
      if (action.pick === 'overdue') assert.match(action.label, /workspace/i);
    }
  }
  assert.match(quickActionsFor('harborline')[0].label, /Diwali/);
  assert.notDeepEqual(quickActionsFor('harborline'), quickActionsFor('northwind'));
});
