import type { BusinessTransaction } from "./command-kernel";
import type { OutboxIntentFact } from "./contracts";

export interface FrozenAutomationSnapshot {
  id: string;
  name: string;
  action: string;
  config: string | null;
  conditions: string | null;
  steps: string | null;
  dryRun: boolean;
}

export interface FrozenAutomationIntentPayload {
  version: 2;
  trigger: string;
  eventPayload: Record<string, unknown>;
  automation: FrozenAutomationSnapshot;
}

export async function buildFrozenAutomationOutboxIntents(
  tx: BusinessTransaction,
  commandId: string,
  trigger: string,
  eventPayload: Record<string, unknown>,
  effectScope = "event",
): Promise<OutboxIntentFact[]> {
  const automations = await tx.automation.findMany({
    where: {
      trigger,
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      action: true,
      config: true,
      conditions: true,
      steps: true,
      dryRun: true,
    },
    orderBy: { id: "asc" },
  });

  return automations.map((automation) => ({
    effectKey: `${commandId}:automation:${effectScope}:${automation.id}`,
    effectType: "automation.dispatch.v2",
    payload: {
      version: 2,
      trigger,
      eventPayload,
      automation: {
        ...automation,
        dryRun: automation.dryRun === true,
      },
    } satisfies FrozenAutomationIntentPayload,
  }));
}
