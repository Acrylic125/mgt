# mgt

n8n automation workflow orchestrator. Workflows are authored with `@n8n/workflow-sdk` and provisioned with `@n8n/cli`.

## Setup

1. `cp .env.example .env` — Compose variables (n8n container + runner PAT).
2. `cp provision/.env.example provision/.env` — provisioning only (`N8N_URL`, `N8N_API_KEY`).
3. `pnpm --dir provision install`
4. `docker compose up -d --build` — UI at http://localhost:5678
5. Complete owner setup in the UI.
6. **Settings → n8n API → Create API key** → set `N8N_API_KEY` in `provision/.env`.
7. `pnpm --dir provision provision`
8. In **Repo Audit**, open **Create security task**, connect your Notion account, and give the integration access to the [Tasks board](https://app.notion.com/p/3e2d6e07011980088143c5c00782e27a). Provision again to attach the UI credential and enable the node.
9. Confirm the **Telegram API** credential `Telegram account` is attached, then **activate** the workflow (required for the 15-minute schedule). Use **Manual Trigger** or `POST http://localhost:5678/webhook/repo-audit` to test immediately.

## Environment variables

### Compose (repo-root `.env`)

| Variable | Purpose |
| --- | --- |
| `N8N_ENCRYPTION_KEY` | Stable encryption key (e.g. `openssl rand -hex 32`) |
| `TELEGRAM_CHAT_ID` | Destination chat/channel ID — workflows use `$env.TELEGRAM_CHAT_ID` |
| `AUDIT_REPOS` | Comma-separated GitHub repos (`owner/name`) for Repo Audit — workflows use `$env.AUDIT_REPOS` |
| `GITHUB_TOKEN` | GitHub PAT injected into `n8n-runner-service` → `audit-runner` (clone, push, PRs). Needs `repo` scope for private repos. |

Optional: `N8N_HOST`, `N8N_PORT`, `N8N_PROTOCOL`, `WEBHOOK_URL`, `GENERIC_TIMEZONE`.

Sidecar services (not the n8n UI) publish on host **42xx**. `n8n-runner-service` is **4200**. Inside Compose the runner still listens on 3000. Host health check: `http://localhost:4200/health`.

`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` lets expressions read `$env`. Restart after compose env changes: `docker compose up -d`.

### Provision (`provision/.env`)

| Variable | Purpose |
| --- | --- |
| `N8N_URL` | n8n base URL for `@n8n/cli` (default `http://localhost:5678`) |
| `N8N_API_KEY` | Provisioning API key from **Settings → n8n API** |

The BotFather token is not an env var for Compose or provision. Paste it into the n8n **Telegram Bot** credential.

## Manual credentials (n8n UI)

| Workflow | Credential |
| --- | --- |
| **Test** | **Telegram API** credential `Telegram Bot` — Access Token from [@BotFather](https://t.me/BotFather). |
| **Repo Audit** | **Telegram API** credential `Telegram account`. |
| **Repo Audit** | **Notion API** credential selected directly on **Create security task**; grant that integration access to the Tasks database. |

## Commands

| Command | Purpose |
| --- | --- |
| `docker compose up -d --build` | Build images and start n8n + runner service |
| `docker compose down` | Stop n8n |
| `pnpm --dir provision provision` | Upsert all `provision/workflows/*/workflow.ts` |

`docker compose up --build` also builds `mgt-audit-runner:latest`. That image is not left running; `n8n-runner-service` starts it per audit via the Docker socket.

## Layout

```
provision/                     n8n workflow SDK + provisioner
  Dockerfile.n8n
  scripts/provision.ts
  workflows/<name>/
    workflow.ts
    *.ts
services/n8n-runner-service/   Fastify API + SQLite runner tracking (mounts docker.sock)
services/audit-runner/         One-shot clone → npm/pnpm audit → GitHub PR container
```

## Repo Audit

The schedule fires every 15 minutes (Asia/Singapore). If a run already **completed** today, that tick is skipped. Manual and webhook runs always execute; a successful one also counts as today’s run.

For each repo in `AUDIT_REPOS` (max 3 in flight):

1. `POST /api/v1/runners/audit-repo` on `n8n-runner-service`
2. Poll `GET /api/v1/runners/audit-repo/{runnerId}` every 5s
3. Send one Telegram message:

```
**AUDIT REPOS**
- ✅ owner/name Audited with no issues
- ⚠️ owner/name https://github.com/owner/name/pull/N
- ❌ owner/name <error>
```

`✅` = no issues, `⚠️` = audit fixes required (MR opened/updated), `❌` = runner/system error (not “audit found CVEs”).

For every repo with an open audit MR, the workflow creates or updates one security issue in the private Notion Tasks board. It matches the **Ticket Key** `audit-<owner/name>` (case insensitive), with a title fallback for older unkeyed cards. New cards start **ToDo**, **Dev** / **Security**, titled `<owner/name> Fix CVEs`. The full report and remediation instructions are formatted Markdown in the page body; the Kanban card shows only its title and category labels. Updating a ticket keeps its current Kanban status.

Temporary Notion test path: run the **Test Notion** manual trigger to feed the five tasks from `temp.json` through the same ticket update flow. Repeated runs update those five cards. It does not run the audit or mark the day complete. Reprovision after editing `temp.json` to refresh the embedded fixture.

After changing `AUDIT_REPOS`, restart n8n so the Code node picks up the new list: `docker compose up -d`.
