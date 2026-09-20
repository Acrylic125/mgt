import { spawn } from "node:child_process";
import { access, glob, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { redact } from "./env.js";

const PackageJsonSchema = z
  .object({
    packageManager: z.string().optional(),
  })
  .passthrough();

const ViaObjectSchema = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    severity: z.string().optional(),
    recommendation: z.string().optional(),
  })
  .passthrough();

const FindingSchema = z
  .object({
    name: z.string().optional(),
    module_name: z.string().optional(),
    severity: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    recommendation: z.string().optional(),
    via: z.json().optional(),
  })
  .passthrough();

const VulnerabilityCountsSchema = z
  .object({
    info: z.number().optional(),
    low: z.number().optional(),
    moderate: z.number().optional(),
    high: z.number().optional(),
    critical: z.number().optional(),
    total: z.number().optional(),
  })
  .passthrough();

const AuditJsonSchema = z
  .object({
    vulnerabilities: z.record(z.string(), FindingSchema).optional(),
    advisories: z.record(z.string(), FindingSchema).optional(),
    metadata: z
      .object({
        vulnerabilities: VulnerabilityCountsSchema.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(dir: string) {
  if (await fileExists(path.join(dir, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (
    (await fileExists(path.join(dir, "package-lock.json"))) ||
    (await fileExists(path.join(dir, "npm-shrinkwrap.json")))
  ) {
    return "npm";
  }

  const raw = await readFile(path.join(dir, "package.json"), "utf8");
  const pkg = PackageJsonSchema.parse(JSON.parse(raw));
  const packageManager = pkg.packageManager;
  if (!packageManager) {
    return null;
  }
  if (packageManager.startsWith("pnpm")) {
    return "pnpm";
  }
  if (packageManager.startsWith("npm")) {
    return "npm";
  }
  return null;
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = redact(chunk.toString());
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = redact(chunk.toString());
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      resolve({
        code: 127,
        stdout,
        stderr: redact(error.message),
      });
    });
    child.on("close", (code) => {
      let exitCode = 1;
      if (code !== null) {
        exitCode = code;
      }
      resolve({ code: exitCode, stdout, stderr });
    });
  });
}

function isMissingLockfile(stdout: string, stderr: string) {
  const text = `${stdout}\n${stderr}`.toLowerCase();
  if (text.includes("err_pnpm_no_lockfile")) {
    return true;
  }
  if (text.includes("lockfile") && (text.includes("not found") || text.includes("does not exist"))) {
    return true;
  }
  if (text.includes("no lockfile")) {
    return true;
  }
  if (text.includes("package-lock.json") && text.includes("can only install")) {
    return true;
  }
  if (text.includes("npm-shrinkwrap") && text.includes("not found")) {
    return true;
  }
  if (text.includes("no pnpm-lock.yaml") || text.includes("no package-lock.json")) {
    return true;
  }
  return false;
}

function parseJsonObject(text: string) {
  return z.record(z.string(), z.json()).parse(JSON.parse(text));
}

function extractJsonObject(text: string) {
  try {
    return parseJsonObject(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return parseJsonObject(text.slice(start, end + 1));
    }
    throw new Error("No JSON object in command output");
  }
}

function isModerateOrAbove(severity: string) {
  const normalized = severity.toLowerCase();
  if (normalized === "moderate" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return true;
  }
  return false;
}

function metadataHasModerateOrAbove(audit: z.infer<typeof AuditJsonSchema>) {
  const counts = audit.metadata?.vulnerabilities;
  if (!counts) {
    return false;
  }
  const moderate = counts.moderate ?? 0;
  const high = counts.high ?? 0;
  const critical = counts.critical ?? 0;
  return moderate + high + critical > 0;
}

function issuesFromFinding(key: string, finding: z.infer<typeof FindingSchema>) {
  const name = finding.module_name ?? finding.name ?? key;
  let title = "vulnerability";
  if (finding.title && finding.title.trim().length > 0) {
    title = finding.title;
  } else if (finding.url && finding.url.trim().length > 0) {
    title = finding.url;
  }

  let severity = finding.severity ?? "unknown";
  let recommendation = finding.recommendation;
  const viaItems = finding.via;
  if (Array.isArray(viaItems)) {
    for (const viaItem of viaItems) {
      if (typeof viaItem === "string") {
        continue;
      }
      const via = ViaObjectSchema.safeParse(viaItem);
      if (!via.success) {
        continue;
      }
      if (title === "vulnerability" && via.data.title) {
        title = via.data.title;
      } else if (title === "vulnerability" && via.data.url) {
        title = via.data.url;
      }
      if (severity === "unknown" && via.data.severity) {
        severity = via.data.severity;
      }
      if (!recommendation && via.data.recommendation) {
        recommendation = via.data.recommendation;
      }
    }
  }

  if (!recommendation || recommendation.trim().length === 0) {
    recommendation = `Update ${name} to a version that is not vulnerable.`;
  }

  return {
    name,
    severity,
    title,
    recommendation,
  };
}

function extractIssues(audit: z.infer<typeof AuditJsonSchema>) {
  const issues: Array<{
    name: string;
    severity: string;
    title: string;
    recommendation: string;
  }> = [];

  const advisories = audit.advisories ?? {};
  for (const [key, finding] of Object.entries(advisories)) {
    const issue = issuesFromFinding(key, finding);
    if (isModerateOrAbove(issue.severity)) {
      issues.push(issue);
    }
  }

  const vulnerabilities = audit.vulnerabilities ?? {};
  for (const [key, finding] of Object.entries(vulnerabilities)) {
    const issue = issuesFromFinding(key, finding);
    if (isModerateOrAbove(issue.severity)) {
      issues.push(issue);
    }
  }

  return issues;
}

function parseAuditOutput(stdout: string, stderr: string) {
  const sources = [stdout, stderr];
  let lastError = "failed to parse audit JSON";
  for (const source of sources) {
    if (source.trim().length === 0) {
      continue;
    }
    try {
      return AuditJsonSchema.parse(extractJsonObject(source));
    } catch (error) {
      if (error instanceof Error) {
        lastError = error.message;
      }
    }
  }
  throw new Error(lastError);
}

async function findPackageDirs(repoRoot: string) {
  const dirs: string[] = [];
  for await (const entry of glob("**/package.json", {
    cwd: repoRoot,
    exclude: ["**/node_modules/**"],
  })) {
    if (entry.split(/[\\/]/).includes("node_modules")) {
      continue;
    }
    const fullPath = path.join(repoRoot, entry);
    dirs.push(path.dirname(fullPath));
  }
  dirs.sort();
  return dirs;
}

function folderLabel(repoRoot: string, packageDir: string) {
  const relative = path.relative(repoRoot, packageDir);
  if (relative === "") {
    return "-";
  }
  return relative.split(path.sep).join("/");
}

async function installDependencies(manager: "npm" | "pnpm", packageDir: string) {
  // pnpm 10 in this image has no `pnpm ci`; frozen-lockfile install is the equivalent.
  let ciArgs = ["ci"];
  if (manager === "pnpm") {
    ciArgs = ["install", "--frozen-lockfile"];
  }
  const ci = await runCommand(manager, ciArgs, packageDir);

  if (ci.code === 0) {
    return;
  }

  const output = `${ci.stdout}\n${ci.stderr}`;
  let canFallback = isMissingLockfile(ci.stdout, ci.stderr);
  if (output.includes("ERR_PNPM_CI_NOT_IMPLEMENTED")) {
    canFallback = true;
  }

  if (!canFallback) {
    throw new Error(`${manager} install failed (exit ${ci.code})`);
  }

  let installArgs = ["install"];
  if (manager === "pnpm") {
    installArgs = ["install", "--frozen-lockfile=false"];
  }
  const fallback = await runCommand(manager, installArgs, packageDir);

  if (fallback.code !== 0) {
    throw new Error(`${manager} install failed (exit ${fallback.code})`);
  }
}

async function runAuditJson(manager: "npm" | "pnpm", packageDir: string) {
  const result = await runCommand(manager, ["audit", "--audit-level=moderate", "--json"], packageDir);
  return parseAuditOutput(result.stdout, result.stderr);
}

async function runAuditFix(manager: "npm" | "pnpm", packageDir: string) {
  let args = ["audit", "fix"];
  if (manager === "pnpm") {
    args = ["audit", "--fix"];
  }
  return runCommand(manager, args, packageDir);
}

export async function auditPackages(repoRoot: string) {
  const reports: Array<{
    folder: string;
    issues: Array<{
      name: string;
      severity: string;
      title: string;
      recommendation: string;
    }>;
    notes: string[];
    didFix: boolean;
  }> = [];

  const packageDirs = await findPackageDirs(repoRoot);
  for (const packageDir of packageDirs) {
    const folder = folderLabel(repoRoot, packageDir);
    const notes: string[] = [];
    const issues: Array<{
      name: string;
      severity: string;
      title: string;
      recommendation: string;
    }> = [];
    let didFix = false;

    let manager: "npm" | "pnpm" | null = null;
    try {
      manager = await detectPackageManager(packageDir);
    } catch (error) {
      let detail = "could not read package.json";
      if (error instanceof Error) {
        detail = redact(error.message);
      }
      notes.push(detail);
      reports.push({ folder, issues, notes, didFix });
      continue;
    }

    if (!manager) {
      notes.push("Unsupported or unknown package manager; skipped.");
      reports.push({ folder, issues, notes, didFix });
      continue;
    }

    try {
      await installDependencies(manager, packageDir);
    } catch (error) {
      let detail = `${manager} install failed`;
      if (error instanceof Error) {
        detail = redact(error.message);
      }
      notes.push(detail);
      reports.push({ folder, issues, notes, didFix });
      continue;
    }

    let audit;
    try {
      audit = await runAuditJson(manager, packageDir);
    } catch (error) {
      let detail = "audit JSON parse failed";
      if (error instanceof Error) {
        detail = redact(error.message);
      }
      notes.push(detail);
      reports.push({ folder, issues, notes, didFix });
      continue;
    }

    const firstIssues = extractIssues(audit);
    const shouldFix = firstIssues.length > 0 || metadataHasModerateOrAbove(audit);

    if (shouldFix) {
      didFix = true;
      const fixResult = await runAuditFix(manager, packageDir);
      if (fixResult.code !== 0) {
        notes.push(`${manager} audit fix failed (exit ${fixResult.code})`);
      }

      try {
        const after = await runAuditJson(manager, packageDir);
        issues.push(...extractIssues(after));
        if (metadataHasModerateOrAbove(after) && issues.length === 0) {
          notes.push("Audit still reports moderate-or-higher issues that could not be fully parsed.");
        }
      } catch (error) {
        issues.push(...firstIssues);
        let detail = "post-fix audit JSON parse failed";
        if (error instanceof Error) {
          detail = redact(error.message);
        }
        notes.push(detail);
      }
    }

    reports.push({ folder, issues, notes, didFix });
  }

  return reports;
}

export function buildPrBody(reports: Awaited<ReturnType<typeof auditPackages>>) {
  const sections: string[] = [];

  for (const report of reports) {
    if (report.issues.length === 0 && report.notes.length === 0 && !report.didFix) {
      continue;
    }

    const lines = [`[NODE] ${report.folder}:`];
    for (const issue of report.issues) {
      lines.push(`- ${issue.name} (${issue.severity}): ${issue.title}`);
      lines.push(`  Recommendation: ${issue.recommendation}`);
    }
    for (const note of report.notes) {
      lines.push(`- ${note}`);
    }
    if (report.didFix && report.issues.length === 0) {
      lines.push("- Audit fix applied; no remaining moderate-or-higher issues.");
    }
    sections.push(lines.join("\n"));
  }

  if (sections.length === 0) {
    return "Audit completed. No remaining moderate-or-higher issues to report.";
  }
  return sections.join("\n\n");
}
