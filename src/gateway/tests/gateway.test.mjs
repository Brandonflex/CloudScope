import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { createGateway, readConfig } from '../gateway.mjs';

const env = {
  CLOUDSCOPE_TENANT_ID: '11111111-1111-4111-8111-111111111111',
  CLOUDSCOPE_ALLOWED_USER_OBJECT_ID: '22222222-2222-4222-8222-222222222222',
  CLOUDSCOPE_OIDC_CLIENT_ID: '33333333-3333-4333-8333-333333333333',
  CLOUDSCOPE_OIDC_CLIENT_SECRET: 'test-only-client-secret',
  CLOUDSCOPE_SESSION_SECRET: 'test-only-session-secret-at-least-32-bytes',
  GatewayAuthentication__SharedSecret: 'test-only-gateway-secret-at-least-32-bytes',
  CLOUDSCOPE_PUBLIC_ORIGIN: 'https://cloudscope.example'
};
const config = readConfig(env);
let backend;
let gateway;
let upstreamRequests = [];
const oidc = {
  async begin(redirectUri) {
    assert.equal(redirectUri, `${config.publicOrigin}/auth/callback`);
    return { url: 'https://login.microsoftonline.com/authorize', state: 'test-state', verifier: 'test-verifier', nonce: 'test-nonce' };
  },
  async finish(url, tx) {
    assert.equal(url.origin, config.publicOrigin);
    if (url.searchParams.get('state') !== tx.state || url.searchParams.get('code') !== 'valid') throw new Error('bad response');
    assert.deepEqual(tx, { state: 'test-state', verifier: 'test-verifier', nonce: 'test-nonce' });
    return { tid: config.tenant, oid: config.user };
  }
};

before(async () => {
  backend = http.createServer((req, res) => {
    upstreamRequests.push({ url: req.url, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'leak=must-not-be-forwarded' });
    res.end(JSON.stringify({ demoMode: false, realtimeAvailable: true, resourceCount: 0, relationshipCount: 0, configuredProviders: ['Azure'], discoveryStatus: 'Succeeded' }));
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  gateway = createGateway(config, oidc, { backendPort: backend.address().port });
});
after(() => backend.close());

function forwarded(call) { return call.set('X-Forwarded-Proto', 'https'); }
function cookie(response) { return response.headers['set-cookie'][0].split(';')[0]; }
async function login(app = gateway, callback = '?state=test-state&code=valid') {
  const start = await forwarded(request(app).get('/auth/login'));
  assert.equal(start.status, 302);
  assert.match(start.headers['set-cookie'][0], /HttpOnly/);
  assert.match(start.headers['set-cookie'][0], /Secure/);
  assert.match(start.headers['set-cookie'][0], /SameSite=Lax/);
  const initial = cookie(start);
  const result = await forwarded(request(app).get(`/auth/callback${callback}`).set('Cookie', initial));
  return { initial, result, authenticated: result.headers['set-cookie'] ? cookie(result) : null };
}

test('fails closed for missing credentials and invalid origins', () => {
  for (const changes of [
    { CLOUDSCOPE_TENANT_ID: 'common' }, { CLOUDSCOPE_ALLOWED_USER_OBJECT_ID: '' },
    { CLOUDSCOPE_SESSION_SECRET: 'short' }, { GatewayAuthentication__SharedSecret: '' },
    { CLOUDSCOPE_PUBLIC_ORIGIN: 'http://cloudscope.example' },
    { CLOUDSCOPE_PUBLIC_ORIGIN: 'https://cloudscope.example/other' },
    { CLOUDSCOPE_PUBLIC_ORIGIN: 'https://cloudscope.example/?q=1' }
  ]) assert.throws(() => readConfig({ ...env, ...changes }));
});

test('unauthenticated requests cannot reach the backend', async () => {
  const before = upstreamRequests.length;
  const response = await request(gateway).get('/api/meta');
  assert.equal(response.status, 401);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(upstreamRequests.length, before);
});

test('valid sign-in rotates session and forwards only a fixed read with server secret', async () => {
  const { initial, result, authenticated } = await login();
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, 'https://cloudscope.example/dashboard');
  assert.notEqual(authenticated, initial);
  const response = await forwarded(request(gateway).get('/api/meta?test=value').set('Cookie', authenticated)
    .set('X-CloudScope-Gateway-Key', 'attacker').set('X-Forwarded-Host', 'attacker.example').set('Authorization', 'attacker'));
  assert.equal(response.status, 200);
  assert.equal(response.body.realtimeAvailable, false);
  assert.equal(response.body.liveInventoryOnly, true);
  assert.equal(response.body.discoveryStatus, 'Succeeded');
  assert.equal(response.headers['set-cookie'], undefined);
  const upstream = upstreamRequests.at(-1);
  assert.equal(upstream.url, '/api/meta?test=value');
  assert.equal(upstream.headers['x-cloudscope-gateway-key'], config.gatewaySecret);
  assert.equal(upstream.headers.authorization, undefined);
  assert.equal(upstream.headers.cookie, undefined);
  assert.equal(upstream.headers['x-forwarded-host'], undefined);
});

test('bad state, replay and unauthorized identities fail closed', async () => {
  const bad = await login(gateway, '?state=wrong&code=valid');
  assert.equal(bad.result.status, 401);
  const replay = await forwarded(request(gateway).get('/auth/callback?state=test-state&code=valid').set('Cookie', bad.initial));
  assert.equal(replay.status, 401);
  const wrongUser = createGateway(config, { ...oidc, async finish() { return { tid: config.tenant, oid: '44444444-4444-4444-8444-444444444444' }; } });
  assert.equal((await login(wrongUser)).result.status, 403);
});

test('gateway blocks writes and endpoints not explicitly approved', async () => {
  const { authenticated } = await login();
  const before = upstreamRequests.length;
  assert.equal((await forwarded(request(gateway).post('/api/resources/discover').set('Cookie', authenticated))).status, 405);
  assert.equal((await forwarded(request(gateway).get('/api/costs/summary').set('Cookie', authenticated))).status, 404);
  assert.equal((await forwarded(request(gateway).get('/api/query/suggestions').set('Cookie', authenticated))).status, 404);
  assert.equal(upstreamRequests.length, before);
});

test('logout requires same origin and invalidates the session', async () => {
  const { authenticated } = await login();
  assert.equal((await forwarded(request(gateway).post('/auth/logout').set('Cookie', authenticated).set('Origin', 'https://attacker.example'))).status, 403);
  assert.equal((await forwarded(request(gateway).post('/auth/logout').set('Cookie', authenticated).set('Origin', config.publicOrigin))).status, 200);
  assert.equal((await forwarded(request(gateway).get('/api/meta').set('Cookie', authenticated))).status, 401);
});

test('supervisor refuses incomplete configuration and forces an isolated live backend', async () => {
  const { backendEnvironment, gatewayEnvironment } = await import('../supervisor.mjs');
  assert.throws(() => backendEnvironment(env));
  const ready = {
    ...env, CLOUDSCOPE_ENABLE_EXPERIMENTAL_GATEWAY: 'true',
    Azure__TenantId: env.CLOUDSCOPE_TENANT_ID,
    Azure__ClientId: '55555555-5555-4555-8555-555555555555',
    Azure__SubscriptionId: '66666666-6666-4666-8666-666666666666',
    Azure__ClientSecret: 'test-only-secret',
    Platform__StorageProvider: 'Cosmos', Platform__SeedDemoData: 'true',
    ASPNETCORE_URLS: 'http://0.0.0.0:8081', GatewayAuthentication__Enabled: 'false',
    AzureOpenAI__ApiKey: 'must-be-disabled', AWS__AccessKeyId: 'must-be-disabled'
  };
  assert.throws(() => backendEnvironment({ ...ready, Azure__TenantId: '77777777-7777-4777-8777-777777777777' }));
  assert.throws(() => backendEnvironment({ ...ready, Azure__ClientSecret: '' }));
  const result = backendEnvironment(ready);
  assert.equal(result.ASPNETCORE_URLS, 'http://127.0.0.1:8081');
  assert.equal(result.Platform__StorageProvider, 'InMemory');
  assert.equal(result.Platform__SeedDemoData, 'false');
  assert.equal(result.GatewayAuthentication__Enabled, 'true');
  assert.equal(result.AzureOpenAI__ApiKey, '');
  assert.equal(result.AWS__AccessKeyId, '');
  assert.equal(result.CLOUDSCOPE_OIDC_CLIENT_SECRET, undefined);
  assert.equal(result.CLOUDSCOPE_SESSION_SECRET, undefined);
  const gatewayEnv = gatewayEnvironment(ready);
  assert.equal(gatewayEnv.Azure__ClientSecret, undefined);
  assert.equal(gatewayEnv.Azure__SubscriptionId, undefined);
  assert.equal(gatewayEnv.CLOUDSCOPE_OIDC_CLIENT_SECRET, ready.CLOUDSCOPE_OIDC_CLIENT_SECRET);
});


test('gateway bounds total requests and login attempts per instance without trusting client IPs', async () => {
  let now = 0;
  const limited = createGateway(config, oidc, { maxRequestsPerMinute: 4, maxLoginsPerMinute: 1, clock: () => now });
  assert.equal((await forwarded(request(limited).get('/auth/login'))).status, 302);
  const blocked = await forwarded(request(limited).get('/auth/login').set('X-Forwarded-For', '1.2.3.4'));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['retry-after'], '60');
  now = 60000;
  assert.equal((await forwarded(request(limited).get('/auth/login'))).status, 302);
  assert.equal((await request(limited).get('/healthz')).status, 200);
});
