# mgt

n8n automation workflow orchestrator. Workflows are authored with `@n8n/workflow-sdk` and provisioned with `@n8n/cli`.

## Setup

1. `cp .env.example .env` — fill the variables below.
2. `pnpm install`
3. `docker compose up -d --build` — UI at http://localhost:5678
4. Complete owner setup in the UI.
5. **Settings → n8n API → Create API key** → set `N8N_API_KEY` in `.env`.
6. `pnpm provision`
7. In n8n, create a **Telegram API** credential named `Telegram Bot` with Access Token = `TELEGRAM_BOT_TOKEN`.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `N8N_ENCRYPTION_KEY` | `.env` → compose | Stable encryption key (e.g. `openssl rand -hex 32`) |
| `N8N_API_KEY` | `.env` (host) | Provisioning via `@n8n/cli` |
| `N8N_URL` | `.env` (host) | n8n base URL for provisioning (default `http://localhost:5678`) |
| `TELEGRAM_BOT_TOKEN` | `.env` (host) | BotFather access token — paste into the `Telegram Bot` credential in the UI. The Telegram node cannot take the token from `$env`. |
| `TELEGRAM_CHAT_ID` | `.env` → compose | Destination chat/channel ID — Test workflow uses `$env.TELEGRAM_CHAT_ID`. |

`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` lets expressions read `$env` (needed for chat ID). Restart after chat ID changes: `docker compose up -d`.

## Manual credentials (n8n UI)

| Workflow | Credential |
| --- | --- |
| **Test** | **Telegram API** credential `Telegram Bot` — Access Token = `TELEGRAM_BOT_TOKEN` from [@BotFather](https://t.me/BotFather). |

## Commands

| Command | Purpose |
| --- | --- |
| `docker compose up -d --build` | Start n8n |
| `docker compose down` | Stop n8n |
| `pnpm provision` | Upsert all `workflows/*/workflow.ts` |

## Layout

```
workflows/<name>/
  workflow.ts      # @n8n/workflow-sdk definition
  *.ts             # Helpers / Code-node scripts imported by workflow.ts
```
