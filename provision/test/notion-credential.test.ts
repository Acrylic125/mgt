import assert from 'node:assert/strict';
import { test } from 'node:test';

test('Repo Audit leaves the Notion node unconnected for UI setup', async () => {
  const { default: auditWorkflow } = await import('../workflows/audit-repo/workflow');
  const notionNode = auditWorkflow.toJSON().nodes.find((node) => node.name === 'Create security task');

  assert.equal(notionNode?.disabled, true);
  assert.equal(notionNode?.credentials?.notionApi, undefined);
});

test('Repo Audit supplies a valid Notion data source ID without container environment', async () => {
  const { default: auditWorkflow } = await import('../workflows/audit-repo/workflow');
  const notionNode = auditWorkflow.toJSON().nodes.find((node) => node.name === 'Create security task');

  assert.deepEqual(notionNode?.parameters?.dataSourceId, {
    __rl: true,
    mode: 'id',
    value: '3e2d6e07-0119-80fe-85b1-000b276fc20b',
  });
});
