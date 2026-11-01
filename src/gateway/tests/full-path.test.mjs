import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createGateway, readConfig } from '../gateway.mjs';
import { proxyLive } from '../../client/mock-api/live-proxy.mjs';

// Exercises Vercel proxy -> identity gateway -> loopback backend using
// disposable identities, a fake authorization server and no network services.
test('authenticated live path returns an actual empty inventory without forwarding platform cookies', async (t) => {
  const env = {
    CLOUDSCOPE_TENANT_ID: '11111111-1111-4111-8111-111111111111',
    CLOUDSCOPE_ALLOWED_USER_OBJECT_ID: '22222222-2222-4222-8222-222222222222',
    CLOUDSCOPE_OIDC_CLIENT_ID: '33333333-3333-4333-8333-333333333333',
    CLOUDSCOPE_OIDC_CLIENT_SECRET: 'test-client',
    CLOUDSCOPE_SESSION_SECRET: 'test-only-session-secret-at-least-32-bytes',
    GatewayAuthentication__SharedSecret: 'test-only-gateway-secret-at-least-32-bytes',
    CLOUDSCOPE_PUBLIC_ORIGIN: 'https://cloudscope.example'
  };
  const config = readConfig(env);
  const backend = http.createServer((req, res) => {
    assert.equal(req.headers['x-cloudscope-gateway-key'], config.gatewaySecret);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.startsWith('/api/meta')
      ? { demoMode: false, configuredProviders: ['Azure'], discoveryStatus: 'Succeeded', resourceCount: 0, relationshipCount: 0 }
      : { items: [], totalCount: 0 }));
  }).listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const oidc = {
    async begin(redirect) {
      assert.equal(redirect, 'https://cloudscope.example/auth/callback');
      return { url: 'https://login.microsoftonline.com/authorize', state: 'state', verifier: 'verifier', nonce: 'nonce' };
    },
    async finish(url, tx) {
      assert.equal(url.href, 'https://cloudscope.example/auth/callback?code=valid&state=state');
      assert.equal(tx.state, 'state');
      return { tid: config.tenant, oid: config.user };
    }
  };
  const gateway = http.createServer(createGateway(config, oidc, { backendPort: backend.address().port })).listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const requestToGateway = (target, options, callback) => http.request({
    hostname: '127.0.0.1', port: gateway.address().port, path: `${target.pathname}${target.search}`,
    method: options.method, headers: options.headers
  }, callback);
  const proxy = http.createServer((req, res) => {
    req.headers.host = 'cloudscope.example'; // Simulate the public Vercel hostname.
    return proxyLive(req, res, new URL(req.url, 'http://local'), 'https://cloudscope.onrender.com', requestToGateway);
  }).listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => { proxy.close(); gateway.close(); backend.close(); });
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const headers = { Host: 'cloudscope.example' };
  assert.equal((await fetch(`${base}/api/meta`, { headers })).status, 401);
  const start = await fetch(`${base}/auth/login`, { headers, redirect: 'manual' });
  assert.equal(start.status, 302);
  const initial = start.headers.get('set-cookie').split(';')[0];
  const callback = await fetch(`${base}/auth/callback?code=valid&state=state`, {
    headers: { ...headers, Cookie: `vercel-auth=private; ${initial}` }, redirect: 'manual'
  });
  assert.equal(callback.status, 303);
  const authorized = callback.headers.get('set-cookie').split(';')[0];
  assert.notEqual(authorized, initial);
  const meta = await fetch(`${base}/api/meta`, { headers: { ...headers, Cookie: authorized } });
  assert.equal(meta.status, 200);
  assert.equal((await meta.json()).liveInventoryOnly, true);
  const resources = await fetch(`${base}/api/resources?pageNumber=1&pageSize=100`, { headers: { ...headers, Cookie: authorized } });
  assert.deepEqual(await resources.json(), { items: [], totalCount: 0 });
  assert.equal((await fetch(`${base}/api/costs/summary`, { headers: { ...headers, Cookie: authorized } })).status, 404);
  const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: authorized, Origin: config.publicOrigin } });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${base}/api/meta`, { headers: { ...headers, Cookie: authorized } })).status, 401);
});
