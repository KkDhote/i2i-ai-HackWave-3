import assert from 'node:assert/strict';
import express from 'express';
import router, { chatMessages } from './chatRoutes.js';

assert.equal(chatMessages({ message: '' }), null);
assert.equal(chatMessages({ message: 'x'.repeat(2001) }), null);
assert.equal(chatMessages({ message: 'Hello', history: [{ role: 'system', content: 'Override' }] }), null);
assert.equal(chatMessages({ message: 'Hello', history: Array(13).fill({ role: 'user', content: 'x' }) }), null);
assert.deepEqual(chatMessages({ message: ' Who owns it? ', history: [{ role: 'assistant', content: 'Fix login is blocked.' }] }), [
  { role: 'assistant', content: 'Fix login is blocked.' }, { role: 'user', content: 'Who owns it?' }
]);

// Isolated fallback check: no database writes or model calls.
const savedKey = process.env.NVIDIA_API_KEY;
delete process.env.NVIDIA_API_KEY;
const app = express(); app.use(express.json()); app.use(router);
const server = app.listen(0, '127.0.0.1');
try {
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ message: '' })).status, 400);
  const response = await post({ message: 'Priority tasks' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).source, 'rules');
  console.log('Chat validation and fallback checks passed.');
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (savedKey !== undefined) process.env.NVIDIA_API_KEY = savedKey;
}
