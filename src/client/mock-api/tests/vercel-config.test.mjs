import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertRewrites } from '@vercel/routing-utils';

// Run after the production build, from src/client (as in CI and Vercel).
test('Vercel serves the Angular browser output and rewrites only SPA routes', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.outputDirectory, 'dist/cloudscope/browser');
  assert.equal(config.buildCommand, 'npm run build:prod');
  assert.equal(config.functions['api/index.mjs'].includeFiles, 'public/demo/inventory.json');
  assert.ok(config.functions['api/index.mjs'].maxDuration > 20, 'AI timeouts must fit within the function duration');

  const indexPath = resolve(config.outputDirectory, 'index.html');
  assert.ok((await stat(indexPath)).isFile(), 'the Vercel output must contain index.html');
  const index = await readFile(indexPath, 'utf8');
  const script = index.match(/src="([^"]+\.js)"/);
  assert.ok(script, 'the built index must reference a JavaScript bundle');
  assert.ok((await stat(resolve(config.outputDirectory, script[1]))).isFile());

  const routesSource = await readFile('src/app/app.routes.ts', 'utf8');
  const clientRoutes = [...routesSource.matchAll(/path: '([^']+)'/g)]
    .map((match) => match[1])
    .filter((route) => route !== '**');
  const [apiRewrite, ...spaRewrites] = config.rewrites;
  assert.deepEqual(apiRewrite, { source: '/api/:__cloudscope_path+', destination: '/api?__cloudscope_path=:__cloudscope_path*' });
  assert.deepEqual(await readdir('api'), ['index.mjs'], 'all API routes must use the shared entry point');
  // Exercise Vercel's actual rewrite compiler, including multi-segment captures.
  const compiled = convertRewrites(config.rewrites)[0];
  assert.equal(compiled.dest, '/api?__cloudscope_path=$1');
  const pattern = new RegExp(compiled.src);
  for (const route of ['/api/meta', '/api/costs/summary', '/api/query/ask']) {
    const match = route.match(pattern);
    assert.ok(match, `${route} must match Vercel's rewrite`);
    assert.equal(match[1], route.slice('/api/'.length));
  }
  assert.ok(!pattern.test('/api'), 'the function destination must not match its own rewrite');
  assert.deepEqual(
    spaRewrites.map((rule) => rule.source).sort(),
    clientRoutes.map((route) => `/${route}`).sort()
  );
  assert.ok(spaRewrites.every((rule) => rule.destination === '/index.html'));
  assert.ok(!spaRewrites.some((rule) => /^\/(api|hubs)(\/|$)/.test(rule.source)));
});
