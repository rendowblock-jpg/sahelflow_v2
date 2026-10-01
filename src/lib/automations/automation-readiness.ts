import "server-only";

import { db } from "@/lib/db";
import { sidecar } from "@/lib/whatsapp/sidecar-client";

/**
 * Whether a WhatsApp number is connected right now, so the builder and the
 * hub can warn before a WhatsApp step fails. Bounded: a page never waits on
 * the provider for more than a moment, and "unknown" reads as not connected.
 */
export async function whatsappConnected(timeoutMs = 1500): Promise<boolean> {
  try {
    const status = await Promise.race([
      sidecar.status(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return Boolean(status && status.status === "connected" && status.user?.id);
  } catch {
    return false;
  }
}

export interface AutomationRunSummary {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  steps: Array<{ position: number; action: string; status: string; errorCode: string | null }>;
}

/** The latest runs of one automation with each step's outcome (no payloads). */
export async function listAutomationRunsForEditor(
  automationId: string,
  limit = 15,
): Promise<AutomationRunSummary[]> {
  const runs = await db.automationRun.findMany({
    where: { automationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      steps: {
        orderBy: { position: "asc" },
        select: { position: true, action: true, status: true, lastErrorCode: true },
      },
    },
  });
  return runs.map((run) => ({
    id: run.id,
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    steps: run.steps.map((step) => ({
      position: step.position,
      action: step.action,
      status: step.status,
      errorCode: step.lastErrorCode,
    })),
  }));
}
