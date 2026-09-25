import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(root, '.env') });

const env = z.object({
  N8N_API_KEY: z.string().min(1),
  N8N_URL: z.url().default('http://localhost:5678'),
}).parse({
  N8N_API_KEY: process.env.N8N_API_KEY,
  N8N_URL: process.env.N8N_URL,
});

const workflowName = 'NTU Schedule Change Detection';
const cli = path.join(root, 'node_modules', '.bin', 'n8n-cli');
const listedWorkflow = z.object({ id: z.string(), name: z.string() });
const listResponse = z.union([
  z.array(listedWorkflow),
  z.object({ data: z.array(listedWorkflow) }),
]);

try {
  const raw = execFileSync(cli, [
    'workflow', 'list', '--name', workflowName, '--format=json', '--limit', '250',
  ], {
    encoding: 'utf8',
    env: { ...process.env, N8N_URL: env.N8N_URL, N8N_API_KEY: env.N8N_API_KEY },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = listResponse.parse(JSON.parse(raw));
  const workflows = Array.isArray(parsed) ? parsed : parsed.data;
  const found = workflows.find((item) => item.name === workflowName);
  if (!found) {
    console.error(`${workflowName} is not provisioned`);
    process.exitCode = 1;
  } else {
    console.log(`${workflowName} exists (${found.id})`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unable to list n8n workflows';
  console.error(message.replaceAll(env.N8N_API_KEY, '<REDACTED>'));
  process.exitCode = 1;
}
