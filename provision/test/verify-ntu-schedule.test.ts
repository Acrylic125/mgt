import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function verify(workflows: { id: string; name: string }[]) {
  const server = createServer((request, response) => {
    assert.equal(request.url?.startsWith('/api/v1/workflows?'), true);
    assert.equal(request.headers['x-n8n-api-key'], 'test-key');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: workflows, nextCursor: null }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const child = spawn(process.execPath, [
      '--import', 'tsx', path.join(root, 'scripts', 'verify-ntu-schedule.ts'),
    ], {
      cwd: root,
      env: {
        ...process.env,
        N8N_API_KEY: 'test-key',
        N8N_URL: `http://127.0.0.1:${address.port}`,
      },
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    return { code, output };
  } finally {
    server.close();
  }
}

test('CLI succeeds when the NTU workflow exists', async () => {
  const result = await verify([{ id: 'ntu-1', name: 'NTU Schedule Change Detection' }]);
  assert.equal(result.code, 0);
  assert.match(result.output, /exists \(ntu-1\)/);
});

test('CLI fails when the NTU workflow is absent', async () => {
  const result = await verify([{ id: 'other', name: 'Other workflow' }]);
  assert.equal(result.code, 1);
  assert.match(result.output, /is not provisioned/);
});
