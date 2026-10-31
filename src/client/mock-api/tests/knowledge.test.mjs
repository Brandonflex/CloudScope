import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveKnowledge } from '../knowledge.mjs';

test('retrieves only relevant curated documents with safe, fixed links', () => {
  const refs = retrieveKnowledge('How does Azure resource discovery work?');
  assert.ok(refs.some((entry) => entry.id === 'azure-graph'));
  assert.ok(refs.length <= 3);
  assert.ok(refs.every((entry) => ['github.com', 'learn.microsoft.com', 'docs.aws.amazon.com'].includes(new URL(entry.url).hostname)));
  assert.deepEqual(retrieveKnowledge('What is the weather on Mars?'), []);
  assert.ok(retrieveKnowledge('How does that work?', [{ role: 'user', content: 'Tell me about AWS Config' }]).some((entry) => entry.id === 'aws-config'));
});
