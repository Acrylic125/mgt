import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { testNotionScript } from '../workflows/audit-repo/test-notion';
import { ticketPlanScript } from '../workflows/audit-repo/ticket-plan';

test('test fixture updates keyed tickets and creates only missing tickets', () => {
  const fixtureItems = runInNewContext(`(function() { ${testNotionScript.jsCode} })()`);
  const existing = fixtureItems.slice(0, 4).map((item: { json: { key: string; title: string } }, index: number) => ({
    json: {
      id: `existing-page-${index}`,
      properties: {
        'Ticket Key': { rich_text: [{ plain_text: item.json.key }] },
        Name: { title: [{ plain_text: item.json.title }] },
      },
    },
  }));
  const output = runInNewContext(`(function() { ${ticketPlanScript.jsCode} })()`, {
    $: (name: string) => {
      if (name === 'Test Notion') return { isExecuted: true };
      if (name === 'Load temp.json tasks') return { all: () => fixtureItems };
      throw new Error(`Unexpected node: ${name}`);
    },
    $input: { all: () => existing },
  });
  assert.equal(output.length, 5);
  assert.deepEqual(Array.from(output, (item: { json: { pageId: string } }) => item.json.pageId), [
    'existing-page-0',
    'existing-page-1',
    'existing-page-2',
    'existing-page-3',
    '',
  ]);
  assert.equal(output[0].json.key, 'audit-Acrylic125/mgt');
});

test('duplicate ticket keys stop the write plan', () => {
  const fixtureItems = runInNewContext(`(function() { ${testNotionScript.jsCode} })()`);
  const key = fixtureItems[0].json.key;
  const existing = [1, 2].map((id) => ({
    json: {
      id: `duplicate-${id}`,
      properties: { 'Ticket Key': { rich_text: [{ plain_text: key }] } },
    },
  }));

  assert.throws(() => runInNewContext(`(function() { ${ticketPlanScript.jsCode} })()`, {
    $: (name: string) => {
      if (name === 'Test Notion') return { isExecuted: true };
      if (name === 'Load temp.json tasks') return { all: () => fixtureItems };
      throw new Error(`Unexpected node: ${name}`);
    },
    $input: { all: () => existing },
  }), /Duplicate Notion ticket key/);
});
