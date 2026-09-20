// Side-effect import so CREATE TABLE runs before the process starts listening.
import "./db/index.js";
import Fastify from "fastify";
import { env } from "./env.js";
import { auditRepoRoutes } from "./routes/audit-repo.js";

const app = Fastify();

app.get("/health", async () => ({ ok: true }));

await app.register(auditRepoRoutes, {
  prefix: "/api/v1/runners/audit-repo",
});

await app.listen({ host: env.HOST, port: env.PORT });
console.log(`listening on ${env.HOST}:${env.PORT}`);
