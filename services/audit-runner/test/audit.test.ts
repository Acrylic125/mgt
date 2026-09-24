import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("repairs a pnpm lockfile left stale by an existing audit PR", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-runner-test-"));
  const bin = path.join(root, "bin");
  const repo = path.join(root, "repo");
  const packageDir = path.join(repo, "app");
  const oldPath = process.env.PATH;
  const oldCi = process.env.CI;

  try {
    await mkdir(bin);
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }));
    await writeFile(path.join(packageDir, "pnpm-lock.yaml"), "stale\n");
    await writeFile(
      path.join(bin, "pnpm"),
      `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(process.cwd(), "commands.log"), args.join(" ") + "\\n");
if (args[0] === "install" && args.includes("--frozen-lockfile")) {
  console.error("ERR_PNPM_LOCKFILE_CONFIG_MISMATCH Cannot proceed with the frozen installation");
  process.exit(1);
}
if (args[0] === "install") {
  if (process.env.CI && !args.includes("--frozen-lockfile=false")) {
    console.error("ERR_PNPM_LOCKFILE_CONFIG_MISMATCH Cannot proceed with the frozen installation");
    process.exit(1);
  }
  fs.writeFileSync(path.join(process.cwd(), "pnpm-lock.yaml"), "updated\\n");
  process.exit(0);
}
if (args[0] === "audit") {
  if (args.includes("--fix")) {
    fs.writeFileSync(path.join(process.cwd(), "fixed"), "yes");
    process.exit(0);
  }
  if (!fs.existsSync(path.join(process.cwd(), "fixed"))) {
    console.log(JSON.stringify({ vulnerabilities: { example: { severity: "high" } } }));
    process.exit(1);
  }
  console.log(JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }));
  process.exit(0);
}
process.exit(1);
`,
      { mode: 0o755 },
    );

    process.env.PATH = `${bin}${path.delimiter}${oldPath ?? ""}`;
    process.env.CI = "true";
    process.env.RUNNER_ID = "test";
    process.env.REPO = "owner/repo";
    process.env.N8N_RUNNER_SERVICE_URL = "http://localhost";
    process.env.GITHUB_TOKEN = "test-token";

    const { auditPackages } = await import("../dist/audit.js");
    const reports = await auditPackages(repo);
    const commands = await readFile(path.join(packageDir, "commands.log"), "utf8");

    assert.deepEqual(reports[0]?.notes, []);
    assert.equal(reports[0]?.didFix, true);
    assert.equal(await readFile(path.join(packageDir, "pnpm-lock.yaml"), "utf8"), "updated\n");
    assert.match(
      commands,
      /install --frozen-lockfile\ninstall --frozen-lockfile=false\naudit --audit-level=moderate --json\naudit --fix\ninstall --frozen-lockfile=false\n/,
    );
  } finally {
    if (oldPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = oldPath;
    }
    if (oldCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = oldCi;
    }
    await rm(root, { recursive: true, force: true });
  }
});
