import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import * as cheerio from 'cheerio';
import { checkScheduleScript } from '../workflows/ntu-schedule-change-detection/check-schedule';

const html = (value: string) => `<select name="acadsem"><option value="old">Old</option><option selected="selected" value=${value}>Current</option></select>`;

function check(page: string, staticData: Record<string, string>) {
  return runInNewContext(`(function () { ${checkScheduleScript.jsCode} })()`, {
    $input: { first: () => ({ json: { html: page } }) },
    $getWorkflowStaticData: () => staticData,
    require: (name: string) => {
      assert.equal(name, 'cheerio');
      return cheerio;
    },
  });
}

test('notifies and stores the selected value on the first run', () => {
  const state: Record<string, string> = {};
  const result = check(html('2026;1'), state);
  assert.equal(result[0].json.text, 'NTU Schedule Updated!');
  assert.equal(state.previousAcadsem, '2026;1');
});

test('does not notify when the selected value is unchanged', () => {
  const state = { previousAcadsem: '2026;1' };
  assert.equal(check(html('2026;1'), state).length, 0);
  assert.equal(state.previousAcadsem, '2026;1');
});

test('notifies and stores a changed value', () => {
  const state = { previousAcadsem: '2026;1' };
  const result = check(html('2026;2'), state);
  assert.equal(result[0].json.text, 'NTU Schedule Updated!');
  assert.equal(state.previousAcadsem, '2026;2');
});

test('does not overwrite state when the selected option is absent', () => {
  const state = { previousAcadsem: '2026;1' };
  assert.throws(() => check('<select name="acadsem"><option value="2026;2">Current</option></select>', state));
  assert.equal(state.previousAcadsem, '2026;1');
});
