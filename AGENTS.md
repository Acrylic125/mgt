# Rules

## General

* Do not abuse ternaries. Prefer `if` blocks when logic has multiple branches or becomes difficult to scan.

```ts
// Avoid
const status = loading ? "loading" : error ? "error" : data ? "success" : "idle";

// Prefer
let status = "idle";

if (loading) {
  status = "loading";
} else if (error) {
  status = "error";
} else if (data) {
  status = "success";
}
```

* Do not overabstract. Only abstract when used more than once or when it represents a meaningful domain concept.

* Do not create functions whose sole purpose is to wrap another function or object without adding meaningful behavior.

* Do not typecast raw JSON without validation unless the data is already validated by an SDK or trusted typed boundary. Use Zod.

```ts
// Avoid
const config = JSON.parse(raw) as Config;

// Prefer
const ConfigSchema = z.object({
  endpoint: z.string().url(),
  enabled: z.boolean(),
});

const config = ConfigSchema.parse(JSON.parse(raw));
```

* Do not invent types unless necessary. Prefer types from `@n8n/workflow-sdk`, `@n8n/cli`, or other libraries. Prefer inference over aliases when possible.

* Only comment to explain **why**: limitations, constraints, trade-offs, workarounds. Do not narrate what the code already says.

* Group related files by workflow/domain under `provision/workflows/<name>/` unless otherwise specified.

## TypeScript

* Prefer `pnpm`.

* Do not use `any` or `unknown`. Prefer inference over explicit types. Do not add explicit return types when TypeScript can infer them. Prefer Zod/library inference when available.

* Prefer type-safe environment variables (e.g. Zod + `dotenv`) over bare `process.env` access.

```ts
// Avoid
const apiKey = process.env.N8N_API_KEY!;

// Prefer
const apiKey = env.N8N_API_KEY;
```

* Do not wrap values in `Number(...)` or `Boolean(...)` when types are already known. Convert only at untyped boundaries.

## n8n

* Author workflows with `@n8n/workflow-sdk` (`workflow`, `node`, `trigger`, etc.).
* Provision to the instance with `@n8n/cli` (do not hand-roll REST `fetch` for CRUD).
* Prefer native nodes (e.g. Telegram) over raw HTTP when a node exists.
* Node credential types (e.g. Telegram Access Token) are set in the n8n UI — document the source env var in the README. Parameter values may use `$env` when compose injects them.
* Document required env vars in `.env.example` and the README.

# Rule Overrides

Defaults, not absolutes. Disregard when explicitly requested or when an existing codebase/library requires a different pattern. Explicit instructions win.

# Implementation Response

When implementing or modifying code, briefly list which rules materially shaped the change. Skip rules that did not apply.
