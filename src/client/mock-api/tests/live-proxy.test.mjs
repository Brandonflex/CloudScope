import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { parseGatewayOrigin, proxyLive } from '../live-proxy.mjs';
import previewApi from '../../api/index.mjs';

test('only explicit HTTPS Render origins are valid', () => {
  assert.equal(
    parseGatewayOrigin('https://cloudscope.onrender.com'),
    'https://cloudscope.onrender.com'
  );
  for (const value of [
    'http://cloudscope.onrender.com',
    'https://localhost',
    'https://evil.com',
    'https://cloudscope.onrender.com.evil.com',
    'https://cloudscope.onrender.com/path',
    'https://user@cloudscope.onrender.com',
    'https://cloudscope.onrender.com:1234'
  ]) {
    assert.equal(parseGatewayOrigin(value), null, value);
  }
});

test('configured but invalid live mode never falls back to fictional data', async (t) => {
  const oldEnv = process.env.VERCEL_ENV;
  const oldGateway = process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
  process.env.VERCEL_ENV = 'preview';
  process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = 'invalid';
  const server = http.createServer(previewApi).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (oldEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv;
    if (oldGateway === undefined) delete process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
    else process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = oldGateway;
    server.close();
  });
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api?__cloudscope_path=meta`
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /demoMode/);
});

test('live proxy only forwards its own session cookie, denies writes, and rejects HTML or hostile redirects', async (t) => {
  let observed;
  const gateway = http
    .createServer((req, res) => {
      observed = { url: req.url, headers: req.headers };
      if (req.url === '/api/resources?html=1')
        return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<script>bad</script>');
      if (req.url === '/auth/login?evil=1')
        return res.writeHead(302, { Location: 'https://evil.com/' }).end();
      if (req.url === '/auth/login')
        return res
          .writeHead(302, {
            Location: 'https://login.microsoftonline.com/authorize',
            'Set-Cookie': '__Host-cloudscope=valid; Path=/; HttpOnly; Secure; SameSite=Lax'
          })
          .end('redirect');
      return res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true }));
    })
    .listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const fakeRequest = (options, callback) => {
    assert.equal(options.hostname, 'example.onrender.com');
    assert.equal(options.protocol, 'https:');
    assert.equal(options.port, 443);
    return http.request(
      {
        hostname: '127.0.0.1',
        port: gateway.address().port,
        path: options.path,
        method: options.method,
        headers: options.headers
      },
      callback
    );
  };
  const proxy = http
    .createServer((req, res) =>
      proxyLive(
        req,
        res,
        new URL(req.url, 'http://local'),
        'https://example.onrender.com',
        fakeRequest
      )
    )
    .listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => {
    proxy.close();
    gateway.close();
  });
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const result = await fetch(`${base}/api/meta`, {
    headers: {
      Cookie: 'vercel-auth=secret; __Host-cloudscope=valid.signature; other=private',
      Authorization: 'Bearer secret',
      'X-CloudScope-Gateway-Key': 'evil',
      'X-Forwarded-Host': 'evil.test'
    }
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(observed.headers.cookie, '__Host-cloudscope=valid.signature');
  assert.equal(observed.headers.authorization, undefined);
  assert.equal(observed.headers['x-cloudscope-gateway-key'], undefined);
  assert.equal(observed.headers['x-forwarded-host'], undefined);
  assert.equal((await fetch(`${base}/api/resources`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/api/costs/summary`)).status, 404);
  assert.equal((await fetch(`${base}/api/resources?next=https%3A%2F%2Fevil.com`)).status, 200);
  assert.equal(observed.url, '/api/resources?next=https%3A%2F%2Fevil.com');
  assert.equal((await fetch(`${base}/api/resources?html=1`)).status, 502);
  assert.equal((await fetch(`${base}/auth/login?evil=1`, { redirect: 'manual' })).status, 502);
  const login = await fetch(`${base}/auth/login`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), 'https://login.microsoftonline.com/authorize');
  assert.match(login.headers.get('set-cookie'), /^__Host-cloudscope=/);
});

test('Vercel rewrite restoration routes auth and API requests to live gateway only', async (t) => {
  const { createApiHandler } = await import('../../api/index.mjs');
  const oldEnv = process.env.VERCEL_ENV;
  const oldGateway = process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
  process.env.VERCEL_ENV = 'preview';
  process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = 'https://example.onrender.com';
  const captured = [];
  const server = http
    .createServer(
      createApiHandler({
        liveProxy: (req, res, url) => {
          captured.push({ method: req.method, path: url.pathname, query: url.search });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        }
      })
    )
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (oldEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv;
    if (oldGateway === undefined) delete process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
    else process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = oldGateway;
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(`${base}/api?__cloudscope_auth=callback&code=abc&state=def`)).status,
    200
  );
  assert.deepEqual(captured.at(-1), {
    method: 'GET',
    path: '/auth/callback',
    query: '?code=abc&state=def'
  });
  assert.equal((await fetch(`${base}/api?__cloudscope_path=resources&pageSize=100`)).status, 200);
  assert.deepEqual(captured.at(-1), {
    method: 'GET',
    path: '/api/resources',
    query: '?pageSize=100'
  });
  assert.equal(
    (await fetch(`${base}/api?__cloudscope_auth=callback&__cloudscope_path=meta`)).status,
    400
  );
});

test('production cannot serve the demo and only routes through an explicitly configured live gateway', async (t) => {
  const { createApiHandler } = await import('../../api/index.mjs');
  const oldEnv = process.env.VERCEL_ENV;
  const oldGateway = process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
  process.env.VERCEL_ENV = 'production';
  delete process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
  const routed = [];
  const server = http
    .createServer(
      createApiHandler({
        liveProxy: (req, res, url, origin) => {
          routed.push({ path: url.pathname, origin });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ gateway: true }));
        }
      })
    )
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (oldEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = oldEnv;
    if (oldGateway === undefined) delete process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN;
    else process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = oldGateway;
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const noGateway = await fetch(`${base}/api?__cloudscope_path=meta`);
  assert.equal(noGateway.status, 404);
  assert.doesNotMatch(await noGateway.text(), /demoMode|resourceCount/);
  assert.equal((await fetch(`${base}/api?__cloudscope_auth=login`)).status, 503);
  assert.deepEqual(routed, []);

  process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN = 'https://example.onrender.com';
  assert.deepEqual(await (await fetch(`${base}/api?__cloudscope_path=meta`)).json(), {
    gateway: true
  });
  assert.deepEqual(await (await fetch(`${base}/api?__cloudscope_auth=login`)).json(), {
    gateway: true
  });
  assert.deepEqual(routed, [
    { path: '/api/meta', origin: 'https://example.onrender.com' },
    { path: '/auth/login', origin: 'https://example.onrender.com' }
  ]);

  // An absent Vercel system environment must never silently enable demo mode.
  delete process.env.VERCEL_ENV;
  const unknownEnvironment = await fetch(`${base}/api?__cloudscope_path=meta`);
  assert.equal(unknownEnvironment.status, 404);
  assert.doesNotMatch(await unknownEnvironment.text(), /demoMode|resourceCount/);
  assert.equal(routed.length, 2);
});
