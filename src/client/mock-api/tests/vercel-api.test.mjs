import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import previewApi from '../../api/index.mjs';

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
  // Vercel may deliver the rewrite destination rather than the original URL.
  // Verify nested paths, original query strings, and POST bodies in that form.
  const rewrittenMeta = await (await get('/api?__cloudscope_path=meta')).json();
  assert.equal(rewrittenMeta.demoMode, true);
  const rewrittenCosts = await get('/api?__cloudscope_path=costs%2Ftop-resources&count=6');
  assert.equal(rewrittenCosts.status, 200);
  assert.equal((await rewrittenCosts.json()).length, 6);
  const rewrittenQuery = await fetch(`${base}/api?__cloudscope_path=query%2Fask`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'How many resources are there?' })
  });
  assert.equal(rewrittenQuery.status, 200);
  assert.ok((await rewrittenQuery.json()).answer);
  assert.equal((await get('/api?__cloudscope_path=..%2Fmeta')).status, 400);
  assert.equal((await get('/api?__cloudscope_path=meta&__cloudscope_path=resources')).status, 400);
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

test('demo query answers supported intents without inventing an answer to unrelated questions', async (t) => {
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
  const ask = async (question) => {
    const response = await fetch(`${base}/api?__cloudscope_path=query%2Fask`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const question of ['what is cloud sope', 'what is cloudscope?', 'what is the platform about']) {
    const result = await ask(question);
    assert.match(result.answer, /multi-cloud infrastructure intelligence platform/i);
    assert.match(result.answer, /fictional demo data/i);
    assert.equal(result.generatedQuery, null);
  }
  for (const question of ['how does the platform work with elephants?', 'what is the weather today?', 'how many planets are there?']) {
    const result = await ask(question);
    assert.match(result.answer, /could not understand/i);
    assert.equal(result.data, null);
    assert.equal(result.generatedQuery, null);
  }
  const named = await ask('Tell me about vm-app-01');
  assert.match(named.answer, /vm-app-01/i);
  assert.equal(named.data.name, 'vm-app-01');
  const vms = await ask('Which VMs are under-utilised?');
  assert.match(vms.answer, /virtual machines/i);
  assert.ok(vms.data.every((resource) => resource.type === 'VirtualMachine' && resource.cpuUtilization < 20));
  const critical = await ask('Show my critical compliance violations');
  assert.match(critical.answer, /critical compliance findings/i);
  assert.ok(critical.data.every((finding) => finding.severity === 'Critical'));
  const suggestions = await (await fetch(`${base}/api/query/suggestions`)).json();
  for (const question of suggestions) {
    const result = await ask(question);
    assert.doesNotMatch(result.answer, /could not understand/i, question);
  }
});
