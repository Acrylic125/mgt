import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { runners } from "../db/schema.js";
import { spawnAuditRunner } from "../docker.js";

const createBodySchema = z.object({
  repo: z
    .string()
    .trim()
    .regex(/^[^/\s]+\/[^/\s]+$/, "repo must be GitHub owner/name"),
});

const runnerIdParamsSchema = z.object({
  runnerId: z.string().min(1),
});

const pendingStatusSchema = z.object({
  status: z.literal("pending"),
});

const failedStatusSchema = z.object({
  status: z.literal("failed"),
  message: z.string(),
});

const completedStatusSchema = z.object({
  status: z.literal("completed"),
  auditResult: z.object({
    mrUrl: z.string().optional(),
    mrBody: z.string().optional(),
    mrBranch: z.string().optional(),
  }),
});

const runnerStatusSchema = z.discriminatedUnion("status", [
  pendingStatusSchema,
  failedStatusSchema,
  completedStatusSchema,
]);

function toClientResponse(row: typeof runners.$inferSelect) {
  if (row.status === "failed") {
    let message = "";
    if (row.message !== null) {
      message = row.message;
    }
    return failedStatusSchema.parse({
      status: "failed",
      message,
    });
  }

  if (row.status === "completed") {
    if (row.mrUrl) {
      return completedStatusSchema.parse({
        status: "completed",
        auditResult: {
          mrUrl: row.mrUrl,
          mrBody: row.mrBody ?? "",
          mrBranch: row.mrBranch ?? "audit",
        },
      });
    }

    return completedStatusSchema.parse({
      status: "completed",
      auditResult: {},
    });
  }

  return pendingStatusSchema.parse({ status: "pending" });
}

export async function auditRepoRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.message });
    }

    const runnerId = randomUUID();
    const now = Date.now();

    db.insert(runners)
      .values({
        id: runnerId,
        repo: parsed.data.repo,
        status: "pending",
        message: null,
        mrUrl: null,
        mrBody: null,
        mrBranch: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Return before Docker create/start so the client polls GET for spawn failures.
    void spawnAuditRunner(runnerId, parsed.data.repo).catch((error) => {
      let message = "Failed to start audit-runner container";
      if (error instanceof Error) {
        message = error.message;
      }
      db.update(runners)
        .set({
          status: "failed",
          message,
          updatedAt: Date.now(),
        })
        .where(eq(runners.id, runnerId))
        .run();
    });

    return reply.status(201).send({ runnerId });
  });

  app.get("/:runnerId", async (request, reply) => {
    const parsedParams = runnerIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ message: parsedParams.error.message });
    }

    const row = db
      .select()
      .from(runners)
      .where(eq(runners.id, parsedParams.data.runnerId))
      .get();

    if (!row) {
      return reply.status(404).send();
    }

    return reply.send(toClientResponse(row));
  });

  app.post("/:runnerId/report", async (request, reply) => {
    const parsedParams = runnerIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ message: parsedParams.error.message });
    }

    const parsedBody = runnerStatusSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ message: parsedBody.error.message });
    }

    const row = db
      .select()
      .from(runners)
      .where(eq(runners.id, parsedParams.data.runnerId))
      .get();

    if (!row) {
      return reply.status(404).send();
    }

    const report = parsedBody.data;

    if (report.status === "pending") {
      if (row.status === "completed" || row.status === "failed") {
        return reply.send(toClientResponse(row));
      }

      db.update(runners)
        .set({
          status: "pending",
          updatedAt: Date.now(),
        })
        .where(eq(runners.id, parsedParams.data.runnerId))
        .run();

      return reply.send(pendingStatusSchema.parse({ status: "pending" }));
    }

    if (report.status === "failed") {
      db.update(runners)
        .set({
          status: "failed",
          message: report.message,
          mrUrl: null,
          mrBody: null,
          mrBranch: null,
          updatedAt: Date.now(),
        })
        .where(eq(runners.id, parsedParams.data.runnerId))
        .run();

      return reply.send(
        failedStatusSchema.parse({
          status: "failed",
          message: report.message,
        }),
      );
    }

    let mrUrl = null;
    let mrBody = null;
    let mrBranch = null;
    if (report.auditResult.mrUrl !== undefined) {
      mrUrl = report.auditResult.mrUrl;
    }
    if (report.auditResult.mrBody !== undefined) {
      mrBody = report.auditResult.mrBody;
    }
    if (report.auditResult.mrBranch !== undefined) {
      mrBranch = report.auditResult.mrBranch;
    }

    db.update(runners)
      .set({
        status: "completed",
        message: null,
        mrUrl,
        mrBody,
        mrBranch,
        updatedAt: Date.now(),
      })
      .where(eq(runners.id, parsedParams.data.runnerId))
      .run();

    if (mrUrl) {
      return reply.send(
        completedStatusSchema.parse({
          status: "completed",
          auditResult: { mrUrl, mrBody: mrBody ?? "", mrBranch: mrBranch ?? "audit" },
        }),
      );
    }

    return reply.send(
      completedStatusSchema.parse({
        status: "completed",
        auditResult: {},
      }),
    );
  });
}
