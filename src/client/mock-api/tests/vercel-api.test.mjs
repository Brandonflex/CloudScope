import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import previewApi from '../../api/[...path].mjs';

test('preview API powers the dashboard with bounded demo-only requests', async (t) => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'preview';
  const server = createServer(previewApi);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path) => fetch(`${base}${path}`);
  const meta = await (await get('/api/meta')).json();
  assert.equal(meta.demoMode, true);
  assert.equal(meta.realtimeAvailable, false);
  assert.ok(meta.resourceCount > 0);

  // Dashboard uses all six endpoints concurrently. Each must produce JSON.
  for (const path of ['/api/resources?pageSize=500', '/api/costs/summary', '/api/costs/trends',
    '/api/compliance/status', '/api/costs/top-resources?count=6', '/api/costs/anomalies',
    '/api/graph', '/api/compliance/reports/CIS', '/api/query/suggestions']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    await response.json();
  }
  const ask = await fetch(`${base}/api/query/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'How many resources are there?' })
  });
  assert.equal(ask.status, 200);
  assert.ok((await ask.json()).answer);
  assert.equal((await get('/api/costs/trends?startDate=1900-01-01&endDate=2100-01-01')).status, 400);
  assert.equal((await get('/api/costs/forecast?daysAhead=999999')).status, 400);
  assert.equal((await fetch(`${base}/api/meta`, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await get('/api/unknown')).status, 404);
  const oversized = await fetch(`${base}/api/query/ask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'x'.repeat(1001) })
  });
  assert.equal(oversized.status, 400);
  process.env.VERCEL_ENV = 'production';
  assert.equal((await get('/api/meta')).status, 404);
  delete process.env.VERCEL_ENV;
  assert.equal((await get('/api/meta')).status, 404);
});
