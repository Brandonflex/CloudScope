import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('demo API accepts slash-containing IDs through the same query routes as the backend', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['mock-api/server.mjs', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await Promise.race([
    once(child.stdout, 'data'),
    once(child, 'exit').then(([code]) => { throw new Error(`Demo server exited: ${code}`); }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Server startup timed out')), 10000).unref())
  ]);
  const base = `http://127.0.0.1:${port}`;
  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.realtimeAvailable, false, 'the mock API must not advertise a SignalR hub');
  const list = await (await fetch(`${base}/api/resources?pageSize=500`)).json();
  const resource = list.items.find((item) => item.id.includes('/'));
  assert.ok(resource, 'demo inventory should contain slash-containing IDs');
  const id = encodeURIComponent(resource.id);
  for (const path of [`resources/by-id?id=${id}`, `resources/relationships?id=${id}`, `resources/blast-radius?id=${id}`, `graph/subgraph?resourceId=${id}`]) {
    const response = await fetch(`${base}/api/${path}`);
    assert.equal(response.status, 200, path);
    await response.json();
  }
  assert.equal((await (await fetch(`${base}/api/resources/by-id?id=${id}`)).json()).id, resource.id);
  assert.equal((await fetch(`${base}/api/resources/by-id?id=missing`)).status, 404);
});
