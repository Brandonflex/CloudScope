import express from 'express';
import session from 'express-session';
import { LRUCache } from 'lru-cache';
import http from 'node:http';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 2 * 1024 * 1024;
const SESSION_LIFETIME = 30 * 60 * 1000;
// Deliberately limited to inventory/graph reads. Billing, recommendations,
// compliance and AI are excluded until their live data integrity is verified.
const ALLOWED_GETS = new Set([
  '/api/meta', '/api/resources', '/api/resources/by-id',
  '/api/resources/relationships', '/api/resources/blast-radius',
  '/api/graph', '/api/graph/subgraph', '/api/graph/paths'
]);

export function readConfig(env) {
  const tenant = env.CLOUDSCOPE_TENANT_ID || '';
  const user = env.CLOUDSCOPE_ALLOWED_USER_OBJECT_ID || '';
  const clientId = env.CLOUDSCOPE_OIDC_CLIENT_ID || '';
  const clientSecret = env.CLOUDSCOPE_OIDC_CLIENT_SECRET || '';
  const sessionSecret = env.CLOUDSCOPE_SESSION_SECRET || '';
  const gatewaySecret = env.GatewayAuthentication__SharedSecret || '';
  if (![tenant, user, clientId].every((value) => GUID.test(value))) {
    throw new Error('Tenant ID, allowed user object ID and OIDC client ID must be UUIDs.');
  }
  if (!clientSecret || Buffer.byteLength(sessionSecret) < 32 || Buffer.byteLength(gatewaySecret) < 32) {
    throw new Error('Missing OIDC client secret, session secret or backend gateway secret.');
  }
  let publicUrl;
  try { publicUrl = new URL(env.CLOUDSCOPE_PUBLIC_ORIGIN); } catch { throw new Error('Invalid public origin.'); }
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password ||
      publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error('The public origin must be an HTTPS origin without a path, query or credentials.');
  }
  return { tenant: tenant.toLowerCase(), user: user.toLowerCase(), clientId, clientSecret,
    sessionSecret, gatewaySecret, publicOrigin: publicUrl.origin };
}

// Render's free service is single-instance and ephemeral. Bound memory and
// lifetime; sessions disappear on restart and users must authenticate again.
class BoundedStore extends session.Store {
  constructor() {
    super();
    this.items = new LRUCache({ max: 1000, ttl: SESSION_LIFETIME });
  }
  get(id, done) {
    const item = this.items.get(id);
    done(null, item ? JSON.parse(item) : null);
  }
  set(id, value, done) {
    this.items.set(id, JSON.stringify(value));
    done?.(null);
  }
  destroy(id, done) {
    this.items.delete(id);
    done?.(null);
  }
}

function answer(res, code, message) {
  res.status(code).json({ message });
}

function proxyInventory(req, res, gatewaySecret, backendPort) {
  const path = new URL(req.originalUrl, 'http://127.0.0.1');
  if (path.pathname !== req.originalUrl.split('?')[0] || !ALLOWED_GETS.has(path.pathname) || req.originalUrl.length > 4096) {
    return answer(res, 404, 'Endpoint unavailable.');
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: backendPort, method: 'GET',
    path: `${path.pathname}${path.search}`,
    headers: { accept: 'application/json', 'X-CloudScope-Gateway-Key': gatewaySecret },
    timeout: 20000
  }, (response) => {
    const chunks = [];
    let size = 0;
    let completed = false;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) response.destroy();
      else chunks.push(chunk);
    });
    response.on('error', () => { if (!res.headersSent) answer(res, 502, 'Backend response unavailable.'); });
    response.on('close', () => { if (!completed && !res.headersSent) answer(res, 502, 'Backend response unavailable.'); });
    response.on('end', () => {
      completed = true;
      if (res.headersSent) return;
      const contentType = response.headers['content-type'] || '';
      if (!contentType.toLowerCase().startsWith('application/json')) {
        return answer(res, 502, 'Backend response unavailable.');
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return answer(res, 502, 'Backend response unavailable.'); }
      if (path.pathname === '/api/meta' && response.statusCode === 200) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return answer(res, 502, 'Backend response unavailable.');
        body.realtimeAvailable = false; // This gateway intentionally does not proxy SignalR.
      }
      res.status(response.statusCode || 502).json(body);
    });
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) answer(res, 502, 'Backend unavailable.'); });
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
  upstream.end();
}

/** oidc is an injected adapter; the production adapter is in server.mjs. */
export function createGateway(config, oidc, { backendPort = 8081, store = new BoundedStore() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Render terminates HTTPS. No authorization or redirect URL is derived
  // from forwarded headers; every external URL is fixed in configuration.
  app.set('trust proxy', true);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
    next();
  });
  app.use(session({
    name: '__Host-cloudscope', secret: config.sessionSecret, store,
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_LIFETIME }
  }));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/auth/session', (req, res) => res.json({ authenticated: !!req.session.identity }));
  app.get('/auth/login', async (req, res) => {
    try {
      const transaction = await oidc.begin(`${config.publicOrigin}/auth/callback`);
      req.session.transaction = { state: transaction.state, verifier: transaction.verifier, nonce: transaction.nonce };
      req.session.save((err) => err ? answer(res, 503, 'Sign-in unavailable.') : res.redirect(302, transaction.url));
    } catch { answer(res, 503, 'Sign-in unavailable.'); }
  });
  app.get('/auth/callback', async (req, res) => {
    const transaction = req.session.transaction;
    // Consume the transaction before the exchange, including on failure.
    delete req.session.transaction;
    if (!transaction) return answer(res, 401, 'Sign-in could not be verified.');
    try {
      const callback = new URL(`/auth/callback${req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''}`, config.publicOrigin);
      const claims = await oidc.finish(callback, transaction);
      if (typeof claims?.tid !== 'string' || typeof claims?.oid !== 'string' ||
          claims.tid.toLowerCase() !== config.tenant || claims.oid.toLowerCase() !== config.user) {
        return answer(res, 403, 'This account is not authorized.');
      }
      // Rotate the session ID on login to prevent fixation. Never store tokens.
      req.session.regenerate((err) => {
        if (err) return answer(res, 503, 'Sign-in unavailable.');
        req.session.identity = { authorized: true };
        req.session.save((saveError) => saveError ? answer(res, 503, 'Sign-in unavailable.') : res.redirect(303, `${config.publicOrigin}/dashboard`));
      });
    } catch { answer(res, 401, 'Sign-in could not be verified.'); }
  });
  app.post('/auth/logout', (req, res) => {
    if (req.get('origin') !== config.publicOrigin) return answer(res, 403, 'Invalid origin.');
    req.session.destroy(() => {
      res.clearCookie('__Host-cloudscope', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
      res.json({ authenticated: false });
    });
  });
  app.use('/api', (req, res) => {
    if (!req.session.identity) return answer(res, 401, 'Sign in required.');
    if (req.method !== 'GET') return answer(res, 405, 'Read-only gateway.');
    return proxyInventory(req, res, config.gatewaySecret, backendPort);
  });
  app.use((_req, res) => answer(res, 404, 'Endpoint unavailable.'));
  return app;
}
