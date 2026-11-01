import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = await readFile(new URL('../../../.github/workflows/deploy-azure.yml', import.meta.url), 'utf8');

test('billable Azure infrastructure is manual-only and requires explicit cost acknowledgment', () => {
  // Deliberately constrain the whole trigger block, not just the absence of push:
  // a new automatic event must be reviewed rather than bypassing this safeguard.
  const trigger = workflow.match(/^on:\n([\s\S]*?)(?=^[^\s#])/m)?.[1];
  assert.ok(trigger, 'expected a workflow trigger block');
  const eventNames = [...trigger.matchAll(/^  ([\w-]+):/gm)].map((match) => match[1]);
  assert.deepEqual(eventNames, ['workflow_dispatch']);
  assert.match(trigger, /      acknowledge_charges:\n(?: {8}[^\n]*\n)*? {8}type: boolean\n(?: {8}[^\n]*\n)*? {8}required: true\n(?: {8}[^\n]*\n)*? {8}default: false/);

  const guard = workflow.match(/^  guard:\n([\s\S]*?)(?=^  deploy-infra:)/m)?.[1];
  assert.ok(guard, 'expected a guard before infrastructure deployment');
  assert.match(guard, /- name: Require explicit cost acknowledgment\n\s+if: \$\{\{ inputs\.acknowledge_charges != true \}\}\n\s+run: \|\n[\s\S]*?\n\s+exit 1\n\s+- name: Check for AZURE_CREDENTIALS/);
  assert.match(workflow, /  deploy-infra:\n[\s\S]*?\n    needs: guard\n    if: needs\.guard\.outputs\.configured == 'true'/);
  assert.match(workflow, /  deploy-app:\n[\s\S]*?\n    needs: \[guard, deploy-infra\]\n    if: needs\.guard\.outputs\.configured == 'true'/);
});
