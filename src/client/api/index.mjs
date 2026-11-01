/**
 * Preview-only demo API. This is not a production backend and never accesses
 * cloud credentials. Vercel Deployment Protection must protect previews.
 */
import { handleRequest } from '../mock-api/server.mjs';
import { proxyLive } from '../mock-api/live-proxy.mjs';

const getRoutes = new Set([
  '/api/meta',
  '/api/resources',
  '/api/resources/by-id',
  '/api/resources/relationships',
  '/api/resources/blast-radius',
  '/api/graph',
  '/api/graph/subgraph',
  '/api/graph/paths',
  '/api/costs/summary',
  '/api/costs/trends',
  '/api/costs/forecast',
  '/api/costs/anomalies',
  '/api/costs/top-resources',
  '/api/costs/recommendations',
  '/api/compliance/status',
  '/api/compliance/policies',
  '/api/query/suggestions'
]);
const postRoutes = new Set([
  '/api/meta/demo',
  '/api/resources/discover',
  '/api/compliance/scan',
  '/api/query/ask'
]);

function fail(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify({ message }));
}

export function createApiHandler({ liveProxy = proxyLive } = {}) {
  return async function previewApi(request, response) {
    const url = new URL(request.url, 'http://localhost');
    // Vercel may pass either the original URL or the rewrite destination. Restore
    // the original route when it passes /api?__cloudscope_path=costs/summary.
    const rewritePaths = url.searchParams.getAll('__cloudscope_path');
    const authPaths = url.searchParams.getAll('__cloudscope_auth');
    if (
      rewritePaths.length > 1 ||
      authPaths.length > 1 ||
      (rewritePaths.length && authPaths.length)
    ) {
      fail(response, 400, 'Invalid demo route.');
      return;
    }
    if ((url.pathname === '/api' || url.pathname === '/api/index') && rewritePaths.length) {
      const route = rewritePaths[0];
      if (!/^[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)*$/.test(route)) {
        fail(response, 400, 'Invalid demo route.');
        return;
      }
      url.pathname = `/api/${route}`;
    }
    if ((url.pathname === '/api' || url.pathname === '/api/index') && authPaths.length) {
      if (!/^(login|callback|logout|session)$/.test(authPaths[0])) {
        fail(response, 400, 'Invalid authentication route.');
        return;
      }
      url.pathname = `/auth/${authPaths[0]}`;
    }
    url.searchParams.delete('__cloudscope_path');
    url.searchParams.delete('__cloudscope_auth');
    request.url = `${url.pathname}${url.search}`;
    // An explicitly configured live gateway always wins and NEVER falls back to
    // synthetic data, including when the origin is invalid or unreachable.
    if (process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN !== undefined) {
      if (!['preview', 'production'].includes(process.env.VERCEL_ENV)) {
        fail(response, 404, 'Live API is unavailable.');
        return;
      }
      return liveProxy(request, response, url, process.env.CLOUDSCOPE_LIVE_GATEWAY_ORIGIN);
    }
    if (url.pathname.startsWith('/auth/')) {
      fail(response, 503, 'Live gateway is not configured.');
      return;
    }
    if (process.env.VERCEL_ENV !== 'preview') {
      fail(response, 404, 'Preview demo API is unavailable.');
      return;
    }
    const path = url.pathname.replace(/\/+$/, '');
    const isReport = /^\/api\/compliance\/reports\/(CIS|SOC2|HIPAA|GDPR)$/i.test(path);
    const allowed =
      request.method === 'GET'
        ? getRoutes.has(path) || isReport
        : request.method === 'POST' && postRoutes.has(path);
    if (!allowed) {
      fail(response, 404, 'Demo endpoint not found.');
      return;
    }

    // Reject cross-origin browser requests. This does not replace deployment
    // protection or platform rate limiting, both of which remain necessary.
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          fail(response, 403, 'Cross-origin requests are not allowed.');
          return;
        }
      } catch {
        fail(response, 403, 'Invalid origin.');
        return;
      }
    }

    // Bound potentially expensive computations and unusually long inputs.
    for (const [key, max] of [
      ['daysAhead', 365],
      ['count', 500],
      ['pageSize', 500],
      ['pageNumber', 100000],
      ['depth', 20],
      ['maxDepth', 20]
    ]) {
      const value = url.searchParams.get(key);
      if (value !== null && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)) {
        fail(response, 400, `Invalid ${key}.`);
        return;
      }
    }
    for (const [key, value] of url.searchParams) {
      if (key.length > 100 || value.length > 2048) {
        fail(response, 400, 'Query parameter is too long.');
        return;
      }
    }
    const start = url.searchParams.get('startDate');
    const end = url.searchParams.get('endDate');
    const startTime = start ? Date.parse(start) : Date.now() - 90 * 86400000;
    const endTime = end ? Date.parse(end) : Date.now();
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      startTime > endTime ||
      endTime - startTime > 366 * 86400000
    ) {
      fail(response, 400, 'Invalid date range.');
      return;
    }
    if (Number(request.headers['content-length'] ?? 0) > 65536) {
      fail(response, 413, 'Request body too large.');
      return;
    }

    // The shared handler reads the raw Node stream, not Vercel's body helper.
    // Do not access request.body here: it would consume the stream.
    await handleRequest(request, response, { allowPreviewAi: true });
  };
}

export default createApiHandler();
