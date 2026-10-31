import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Run after the production build, from src/client (as in CI and Vercel).
test('Vercel serves the Angular browser output and rewrites only SPA routes', async () => {
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  assert.equal(config.outputDirectory, 'dist/cloudscope/browser');
  assert.equal(config.buildCommand, 'npm run build:prod');
  assert.equal(config.functions['api/*.mjs'].includeFiles, 'public/demo/inventory.json');

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
  assert.deepEqual(
    config.rewrites.map((rule) => rule.source).sort(),
    clientRoutes.map((route) => `/${route}`).sort()
  );
  assert.ok(config.rewrites.every((rule) => rule.destination === '/index.html'));
  assert.ok(!config.rewrites.some((rule) => /^\/(api|hubs)(\/|$)/.test(rule.source)));
});
