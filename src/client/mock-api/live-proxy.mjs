// Experimental, opt-in same-origin proxy. It has no Azure credentials or
// gateway key; the Render gateway independently authenticates each request.
import https from 'node:https';

const API_GETS = new Set([
  '/api/meta',
  '/api/resources',
  '/api/resources/by-id',
  '/api/resources/relationships',
  '/api/resources/blast-radius',
  '/api/graph',
  '/api/graph/subgraph',
  '/api/graph/paths'
]);
const AUTH_GETS = new Set(['/auth/login', '/auth/callback', '/auth/session']);
const MAX_BODY = 2 * 1024 * 1024;

function fail(res, status, message) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ message }));
}

export function parseGatewayOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.onrender\.com$/i.test(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function sessionCookie(header) {
  if (typeof header !== 'string' || header.length > 8192) return '';
  const cookies = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('__Host-cloudscope='));
  if (cookies.length !== 1 || !/^__Host-cloudscope=[A-Za-z0-9.%_-]{1,1024}$/.test(cookies[0]))
    return '';
  return cookies[0];
}

export async function proxyLive(request, response, url, origin, requestImpl = https.request) {
  const gatewayOrigin = parseGatewayOrigin(origin);
  if (!gatewayOrigin) return fail(response, 503, 'Live gateway is not configured correctly.');
  const path = url.pathname;
  const allowed =
    (request.method === 'GET' && (API_GETS.has(path) || AUTH_GETS.has(path))) ||
    (request.method === 'POST' && path === '/auth/logout');
  if (!allowed || request.url.length > 8192)
    return fail(response, 404, 'Live endpoint unavailable.');
  if (request.method === 'POST') {
    const length = Number(request.headers['content-length'] || 0);
    if (
      !Number.isInteger(length) ||
      length < 0 ||
      length > 1024 ||
      request.headers['transfer-encoding']
    )
      return fail(response, 413, 'Request body too large.');
    request.resume();
  }
  const target = new URL(`${path}${url.search}`, gatewayOrigin);
  const headers = { accept: 'application/json', 'x-forwarded-proto': 'https' };
  const cookie = sessionCookie(request.headers.cookie);
  if (cookie) headers.cookie = cookie;
  if (path === '/auth/logout' && typeof request.headers.origin === 'string')
    headers.origin = request.headers.origin;
  if (request.method === 'POST') headers['content-length'] = '0';

  return await new Promise((resolve) => {
    response.once('finish', resolve);
    response.once('close', resolve);
    let upstream;
    try {
      upstream = requestImpl(
        target,
        { method: request.method, headers, timeout: 25000 },
        (upstreamResponse) => {
          let complete = false;
          let size = 0;
          const chunks = [];
          upstreamResponse.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) upstreamResponse.destroy();
            else chunks.push(chunk);
          });
          upstreamResponse.on('error', () => fail(response, 502, 'Live gateway unavailable.'));
          upstreamResponse.on('close', () => {
            if (!complete) fail(response, 502, 'Live gateway unavailable.');
          });
          upstreamResponse.on('end', () => {
            complete = true;
            if (response.headersSent) return;
            const status = upstreamResponse.statusCode || 502;
            const location = upstreamResponse.headers.location;
            if (location) {
              let dest;
              try {
                dest = new URL(location);
              } catch {
                return fail(response, 502, 'Invalid sign-in response.');
              }
              const loginRedirect =
                path === '/auth/login' &&
                dest.protocol === 'https:' &&
                dest.hostname === 'login.microsoftonline.com';
              const returnRedirect =
                path === '/auth/callback' &&
                dest.protocol === 'https:' &&
                dest.host === request.headers.host &&
                dest.pathname === '/dashboard' &&
                !dest.search &&
                !dest.hash;
              if (!loginRedirect && !returnRedirect)
                return fail(response, 502, 'Invalid sign-in response.');
            }
            const setCookies = upstreamResponse.headers['set-cookie'] || [];
            if (setCookies.length && !AUTH_GETS.has(path) && path !== '/auth/logout') {
              return fail(response, 502, 'Invalid gateway response.');
            }
            if (
              setCookies.some(
                (value) =>
                  !value.startsWith('__Host-cloudscope=') ||
                  !/;\s*samesite=lax(?:;|$)/i.test(value) ||
                  !/;\s*secure(?:;|$)/i.test(value) ||
                  !/;\s*httponly(?:;|$)/i.test(value) ||
                  !/;\s*path=\/(?:;|$)/i.test(value) ||
                  /;\s*domain=/i.test(value)
              )
            ) {
              return fail(response, 502, 'Invalid sign-in response.');
            }
            const contentType = upstreamResponse.headers['content-type'] || '';
            const body = Buffer.concat(chunks);
            if (!location) {
              if (!contentType.toLowerCase().startsWith('application/json'))
                return fail(response, 502, 'Invalid gateway response.');
              try {
                JSON.parse(body.toString('utf8'));
              } catch {
                return fail(response, 502, 'Invalid gateway response.');
              }
            }
            const outgoing = {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer'
            };
            if (location) outgoing.Location = location;
            if (setCookies.length) outgoing['Set-Cookie'] = setCookies;
            response.writeHead(status, outgoing);
            response.end(location ? '' : body);
          });
        }
      );
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => fail(response, 502, 'Live gateway unavailable.'));
      response.on('close', () => {
        if (!response.writableEnded) upstream.destroy();
      });
      upstream.end();
    } catch {
      fail(response, 502, 'Live gateway unavailable.');
    }
  });
}
