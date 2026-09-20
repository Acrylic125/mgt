import "dotenv/config";

import { z } from "zod";

const EnvSchema = z.object({
  RUNNER_ID: z.string().min(1),
  REPO: z
    .string()
    .min(1)
    .regex(/^[^\s/]+\/[^\s/]+$/, "REPO must be owner/name"),
  N8N_RUNNER_SERVICE_URL: z.url(),
  GITHUB_TOKEN: z.string().min(1),
});

export const env = EnvSchema.parse({
  RUNNER_ID: process.env.RUNNER_ID,
  REPO: process.env.REPO,
  N8N_RUNNER_SERVICE_URL: process.env.N8N_RUNNER_SERVICE_URL,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
});

const slash = env.REPO.indexOf("/");
export const repoOwner = env.REPO.slice(0, slash);
export const repoName = env.REPO.slice(slash + 1);

const encodedToken = encodeURIComponent(env.GITHUB_TOKEN);
const basicAuth = Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`, "utf8").toString("base64");

export function redact(text: string) {
  let result = text.replaceAll(env.GITHUB_TOKEN, "[redacted]");
  result = result.replaceAll(encodedToken, "[redacted]");
  result = result.replaceAll(basicAuth, "[redacted]");
  result = result.replaceAll(`x-access-token:${env.GITHUB_TOKEN}`, "x-access-token:[redacted]");
  return result;
}

export const gitHttpsExtraHeader = `AUTHORIZATION: basic ${basicAuth}`;
