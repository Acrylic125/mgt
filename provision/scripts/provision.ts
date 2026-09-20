import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { WorkflowBuilder } from '@n8n/workflow-sdk';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = path.join(ROOT, 'workflows');
const N8N_CLI = path.join(ROOT, 'node_modules', '.bin', 'n8n-cli');

loadEnv({ path: path.join(ROOT, '.env') });

const env = z
  .object({
    N8N_API_KEY: z.string().min(1, 'Copy provision/.env.example → provision/.env and set N8N_API_KEY'),
    N8N_URL: z.url().default('http://localhost:5678'),
  })
  .parse({
    N8N_API_KEY: process.env.N8N_API_KEY,
    N8N_URL: process.env.N8N_URL,
  });

const WorkflowBuilderSchema = z.custom<WorkflowBuilder>((value) => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('toJSON' in value) || !('validate' in value)) return false;
  return typeof value.toJSON === 'function' && typeof value.validate === 'function';
}, 'Expected a workflow(...) builder default export');

const WorkflowModuleSchema = z.object({
  default: WorkflowBuilderSchema,
});

const ListedWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const ListResponseSchema = z.union([
  z.array(ListedWorkflowSchema),
  z.object({ data: z.array(ListedWorkflowSchema) }),
]);

const UpsertResultSchema = z.object({
  id: z.string(),
  name: z.string(),
});

function cli(args: string[]) {
  return execFileSync(
    N8N_CLI,
    [...args, '--url', env.N8N_URL, '--apiKey', env.N8N_API_KEY],
    {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );
}

function discoverWorkflowFiles(filter?: string) {
  const dirs = readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  let names = dirs;
  if (filter) {
    names = dirs.filter((name) => name === filter);
  }

  return names
    .map((name) => path.join(WORKFLOWS_DIR, name, 'workflow.ts'))
    .filter((file) => existsSync(file));
}

async function loadWorkflow(file: string) {
  const mod = WorkflowModuleSchema.parse(await import(pathToFileURL(file).href));
  const builder = mod.default;
  const validation = builder.validate();

  if (validation.errors.length > 0) {
    for (const err of validation.errors) {
      console.error(`  - ${err.message}`);
    }
    throw new Error(`Validation failed for ${file}`);
  }

  for (const warning of validation.warnings) {
    console.warn(`  ! ${warning.message}`);
  }

  return builder.toJSON();
}

function findByName(name: string) {
  const raw = cli([
    'workflow',
    'list',
    '--name',
    name,
    '--format=json',
    '--limit',
    '250',
  ]);
  const listed = ListResponseSchema.parse(JSON.parse(raw));
  const items = Array.isArray(listed) ? listed : listed.data;
  return items.find((workflow) => workflow.name === name);
}

function upsert(json: ReturnType<WorkflowBuilder['toJSON']>) {
  const payload = {
    name: json.name,
    nodes: json.nodes,
    connections: json.connections,
    settings: json.settings ?? { executionOrder: 'v1' },
  };

  const dir = mkdtempSync(path.join(tmpdir(), 'mgt-provision-'));
  const file = path.join(dir, 'workflow.json');
  writeFileSync(file, JSON.stringify(payload, null, 2));

  const existing = findByName(json.name);
  if (existing) {
    const updated = UpsertResultSchema.parse(
      JSON.parse(
        cli(['workflow', 'update', existing.id, '--file', file, '--format=json']),
      ),
    );
    console.log(`Updated: ${updated.name} (${updated.id})`);
    return;
  }

  const created = UpsertResultSchema.parse(
    JSON.parse(cli(['workflow', 'create', '--file', file, '--format=json'])),
  );
  console.log(`Created: ${created.name} (${created.id})`);
}

async function main() {
  const filter = process.argv[2];
  const files = discoverWorkflowFiles(filter);

  if (files.length === 0) {
    if (filter) {
      console.error(`No workflow found for "${filter}"`);
    } else {
      console.error('No provision/workflows/*/workflow.ts found');
    }
    process.exit(1);
  }

  for (const file of files) {
    console.log(`Provisioning ${path.relative(ROOT, file)}…`);
    upsert(await loadWorkflow(file));
  }
}

main().catch((err) => {
  if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
