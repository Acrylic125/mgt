import { auditPackages, buildPrBody } from "./audit.js";
import { env, redact } from "./env.js";
import { AUDIT_BRANCH, commitAndPush, hasWorktreeChanges, prepareRepo } from "./git.js";
import { findOpenAuditPull, upsertAuditPullRequest } from "./github.js";
import { reportTerminal, startHeartbeat } from "./report.js";

async function run() {
  console.log(`Starting audit-runner for ${env.REPO} (${env.RUNNER_ID})`);
  const { git, repoRoot, defaultBranch } = await prepareRepo();
  const reports = await auditPackages(repoRoot);

  if (!(await hasWorktreeChanges(git))) {
    const existing = await findOpenAuditPull();
    if (existing) {
      return { mrUrl: existing.html_url, mrBody: existing.body ?? "" };
    }
    return;
  }

  const pushed = await commitAndPush(git);
  if (!pushed) {
    return;
  }

  return upsertAuditPullRequest(defaultBranch, buildPrBody(reports));
}

async function main() {
  const stopHeartbeat = startHeartbeat();
  let mr: Awaited<ReturnType<typeof run>>;
  let failedMessage: string | undefined;

  try {
    mr = await run();
  } catch (error) {
    failedMessage = "Unexpected error";
    if (error instanceof Error) {
      failedMessage = redact(error.message);
    }
  } finally {
    await stopHeartbeat();
  }

  if (failedMessage !== undefined) {
    await reportTerminal({ status: "failed", message: failedMessage });
    process.exit(1);
  }

  if (mr) {
    await reportTerminal({
      status: "completed",
      auditResult: { ...mr, mrBranch: AUDIT_BRANCH },
    });
  } else {
    await reportTerminal({ status: "completed", auditResult: {} });
  }
  process.exit(0);
}

void main();
