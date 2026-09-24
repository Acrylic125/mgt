import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { ticketPlanScript } from '../workflows/audit-repo/ticket-plan';

const tickets = ['Acrylic125/mgt', 'Acrylic125/fstars', 'Acrylic125/fntu'].map((repo) => ({
  json: {
    key: `audit-${repo}`,
    title: `${repo} Fix CVEs`,
    description: `Audit report for ${repo}`,
  },
}));

test('audit tickets update keyed pages and create missing pages', () => {
  const existing = tickets.slice(0, 2).map((item, index) => ({
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
      if (name === 'Prepare security tasks') return { all: () => tickets };
      throw new Error(`Unexpected node: ${name}`);
    },
    $input: { all: () => existing },
  });
  assert.equal(output.length, 3);
  assert.deepEqual(Array.from(output, (item: { json: { pageId: string } }) => item.json.pageId), [
    'existing-page-0',
    'existing-page-1',
    '',
  ]);
  assert.equal(output[0].json.key, 'audit-Acrylic125/mgt');
});

test('duplicate ticket keys stop the write plan', () => {
  const key = tickets[0].json.key;
  const existing = [1, 2].map((id) => ({
    json: {
      id: `duplicate-${id}`,
      properties: { 'Ticket Key': { rich_text: [{ plain_text: key }] } },
    },
  }));

  assert.throws(() => runInNewContext(`(function() { ${ticketPlanScript.jsCode} })()`, {
    $: (name: string) => {
      if (name === 'Prepare security tasks') return { all: () => tickets };
      throw new Error(`Unexpected node: ${name}`);
    },
    $input: { all: () => existing },
  }), /Duplicate Notion ticket key/);
});
