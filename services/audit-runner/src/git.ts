import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";

import { env, gitHttpsExtraHeader, redact, repoName } from "./env.js";

const WORKPAD = "/tmp/github/workpad";
export const AUDIT_BRANCH = "audit";

function createGit(baseDir: string) {
  const gitEnv = { ...process.env };
  gitEnv.GIT_TERMINAL_PROMPT = "0";
  gitEnv.GIT_CONFIG_NOSYSTEM = "1";
  // simple-git refuses GIT_ASKPASS unless allowUnsafeAskPass is on; prompts are already disabled.
  delete gitEnv.GIT_ASKPASS;
  delete gitEnv.SSH_ASKPASS;
  return simpleGit({ baseDir }).env(gitEnv);
}

function shouldLeaveUnstaged(filePath: string) {
  const parts = filePath.split(/[\\/]/);
  if (parts.includes("node_modules")) {
    return true;
  }

  const base = path.posix.basename(filePath.replaceAll("\\", "/"));
  if (base === ".env" || base.startsWith(".env.")) {
    return true;
  }
  if (base === "credentials.json") {
    return true;
  }
  if (base.endsWith(".pem") || base.endsWith(".key")) {
    return true;
  }
  if (base === "id_rsa" || base === "id_ed25519") {
    return true;
  }
  return false;
}

export async function prepareRepo() {
  await mkdir(WORKPAD, { recursive: true });
  const repoRoot = path.join(WORKPAD, repoName);
  await rm(repoRoot, { recursive: true, force: true });

  const cloneUrl = `https://x-access-token:${encodeURIComponent(env.GITHUB_TOKEN)}@github.com/${env.REPO}.git`;
  try {
    await createGit(WORKPAD).clone(cloneUrl, repoName);
  } catch (error) {
    let detail = "clone failed";
    if (error instanceof Error) {
      detail = redact(error.message);
    }
    throw new Error(`Failed to clone ${env.REPO}: ${detail}`);
  }

  const git = createGit(repoRoot);
  // Drop the token from origin so later git output cannot leak it.
  await git.remote(["set-url", "origin", `https://github.com/${env.REPO}.git`]);
  await git.addConfig("http.https://github.com/.extraheader", gitHttpsExtraHeader);
  await git.addConfig("user.name", "Audit Runner");
  await git.addConfig("user.email", "audit-runner@local");

  const defaultBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

  try {
    await git.fetch(["origin"]);
  } catch (error) {
    let detail = "fetch failed";
    if (error instanceof Error) {
      detail = redact(error.message);
    }
    console.error(`git fetch origin skipped: ${detail}`);
  }

  const branches = await git.branch(["-a"]);
  let hasLocalAudit = false;
  let hasRemoteAudit = false;
  for (const name of branches.all) {
    if (name === AUDIT_BRANCH) {
      hasLocalAudit = true;
    }
    if (name === "remotes/origin/audit" || name === "origin/audit") {
      hasRemoteAudit = true;
    }
  }

  if (hasLocalAudit) {
    if (branches.current !== AUDIT_BRANCH) {
      await git.checkout(AUDIT_BRANCH);
    }
  } else if (hasRemoteAudit) {
    await git.checkout(["--track", "origin/audit"]);
  } else {
    await git.checkout(["-b", AUDIT_BRANCH]);
  }

  return { git, repoRoot, defaultBranch };
}

export async function commitAndPush(git: ReturnType<typeof createGit>) {
  await git.add("-A");

  const staged = await git.status();
  const unstage = staged.files
    .map((file) => file.path)
    .filter((filePath) => shouldLeaveUnstaged(filePath));

  if (unstage.length > 0) {
    await git.reset(["HEAD", "--", ...unstage]);
  }

  const remaining = await git.status();
  if (remaining.files.length === 0) {
    return false;
  }

  await git.commit("[AUDIT] Fix CVEs");

  try {
    await git.push(["-u", "origin", AUDIT_BRANCH]);
  } catch (error) {
    let detail = "push failed";
    if (error instanceof Error) {
      detail = redact(error.message);
    }
    throw new Error(`Failed to push ${AUDIT_BRANCH}: ${detail}`);
  }

  return true;
}

export async function hasWorktreeChanges(git: ReturnType<typeof createGit>) {
  const status = await git.status();
  return status.files.some((file) => !shouldLeaveUnstaged(file.path));
}
