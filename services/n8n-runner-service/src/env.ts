import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_PATH: z.string().min(1).default("./data/runners.sqlite"),
  GITHUB_TOKEN: z.string().min(1),
  AUDIT_RUNNER_IMAGE: z.string().min(1).default("mgt-audit-runner:latest"),
  DOCKER_NETWORK: z.string().min(1).optional(),
  N8N_RUNNER_SERVICE_URL: z.url().default("http://n8n-runner-service:3000"),
});

export const env = envSchema.parse(process.env);
