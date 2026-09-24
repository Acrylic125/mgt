import { z } from "zod";

import { env, redact, repoOwner } from "./env.js";

const AUDIT_TITLE = "[AUDIT] Fix CVEs";
const GITHUB_API_VERSION = "2022-11-28";

const GitHubPullSchema = z
  .object({
    html_url: z.string(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable().optional(),
  })
  .passthrough();

const GitHubPullsSchema = z.array(GitHubPullSchema);

const GitHubErrorSchema = z
  .object({
    message: z.string(),
  })
  .passthrough();

function githubHeaders() {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "mgt-audit-runner",
  };
}

function parseGithubJson(text: string) {
  try {
    return z.json().parse(JSON.parse(text));
  } catch {
    throw new Error("GitHub API returned non-JSON");
  }
}

function githubErrorMessage(status: number, raw: string) {
  try {
    const parsed = GitHubErrorSchema.safeParse(parseGithubJson(raw));
    if (parsed.success) {
      return `GitHub API ${status}: ${parsed.data.message}`;
    }
  } catch {
    // GitHub sometimes returns a non-JSON error body
  }
  return `GitHub API ${status}`;
}

async function githubFetch(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
) {
  const response = await fetch(url, {
    method: init.method,
    headers: {
      ...githubHeaders(),
      ...init.headers,
    },
    body: init.body,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(redact(githubErrorMessage(response.status, raw)));
  }
  if (raw.trim().length === 0) {
    return null;
  }
  return parseGithubJson(raw);
}

export async function findOpenAuditPull() {
  const listUrl = `https://api.github.com/repos/${env.REPO}/pulls?head=${repoOwner}:audit&state=open`;
  const listedRaw = await githubFetch(listUrl, { method: "GET" });
  const listed = GitHubPullsSchema.parse(listedRaw);

  let existing = listed[0];
  for (const pull of listed) {
    if (pull.title === AUDIT_TITLE) {
      existing = pull;
      break;
    }
  }

  return existing;
}

export async function upsertAuditPullRequest(defaultBranch: string, body: string) {
  const existing = await findOpenAuditPull();

  if (existing) {
    try {
      await githubFetch(`https://api.github.com/repos/${env.REPO}/pulls/${existing.number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      return { mrUrl: existing.html_url, mrBody: body };
    } catch (error) {
      let detail = "failed to update PR body";
      if (error instanceof Error) {
        detail = redact(error.message);
      }
      console.error(detail);
    }
    return { mrUrl: existing.html_url, mrBody: existing.body ?? "" };
  }

  const created = GitHubPullSchema.parse(
    await githubFetch(`https://api.github.com/repos/${env.REPO}/pulls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: AUDIT_TITLE,
        head: "audit",
        base: defaultBranch,
        body,
      }),
    }),
  );

  return { mrUrl: created.html_url, mrBody: body };
}
