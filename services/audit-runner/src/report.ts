import { z } from "zod";

import { env, redact } from "./env.js";

const ReportPayloadSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("failed"), message: z.string() }),
  z.object({
    status: z.literal("completed"),
    auditResult: z.object({
      mrUrl: z.string().optional(),
    }),
  }),
]);

const HEARTBEAT_MS = 10_000;
const REPORT_TIMEOUT_MS = 15_000;
const TERMINAL_ATTEMPTS = 3;

function reportUrl() {
  const base = env.N8N_RUNNER_SERVICE_URL.replace(/\/+$/, "");
  return `${base}/api/v1/runners/audit-repo/${env.RUNNER_ID}/report`;
}

export async function sendReport(payload: z.infer<typeof ReportPayloadSchema>) {
  const body = ReportPayloadSchema.parse(payload);
  const response = await fetch(reportUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Report failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

function logReportError(error: Error | string) {
  let message = "report failed";
  if (typeof error === "string") {
    message = error;
  } else {
    message = error.message;
  }
  console.error(redact(message));
}

export async function reportTerminal(payload: z.infer<typeof ReportPayloadSchema>) {
  for (let attempt = 0; attempt < TERMINAL_ATTEMPTS; attempt++) {
    try {
      await sendReport(payload);
      return;
    } catch (error) {
      if (error instanceof Error) {
        logReportError(error);
      } else {
        logReportError("terminal report failed");
      }
      if (attempt < TERMINAL_ATTEMPTS - 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1000);
        });
      }
    }
  }
}

export function startHeartbeat() {
  let stopped = false;
  let inFlight = 0;

  async function beat() {
    if (stopped) {
      return;
    }
    inFlight += 1;
    try {
      await sendReport({ status: "pending" });
    } catch (error) {
      if (error instanceof Error) {
        logReportError(error);
      } else {
        logReportError("pending report failed");
      }
    } finally {
      inFlight -= 1;
    }
  }

  void beat();
  const interval = setInterval(() => {
    void beat();
  }, HEARTBEAT_MS);

  return async function stopHeartbeat() {
    stopped = true;
    clearInterval(interval);
    while (inFlight > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  };
}
