import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { listAutomationRunsForEditor, whatsappConnected } from "@/lib/automations/automation-readiness";
import { parseStoredAutomationDefinition } from "@/lib/automations/contracts";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { getAutomationWorkspaceCopy } from "@/lib/i18n/automation-workspace";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getAutomationWorkspaceCopy(locale, "workspace.edit") };
}

export const dynamic = "force-dynamic";

/** Edit one automation in the flow builder. */
export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireTrustedAction("automations.manage");
  const { locale } = await getI18n();
  const { id } = await params;
  const automation = await db.automation.findFirst({ where: { id, deletedAt: null } });
  if (!automation) notFound();

  const raw = {
    id: automation.id,
    name: automation.name,
    trigger: automation.trigger,
    action: automation.action,
    isActive: automation.isActive,
    conditions: automation.conditions,
    config: automation.config,
    steps: automation.steps,
    dryRun: automation.dryRun,
    maxRetries: automation.maxRetries,
    retryDelayMs: automation.retryDelayMs,
  };

  // A definition the durable contract can no longer read opens as a safe,
  // inactive test-mode starting point the seller rebuilds; the stored row is
  // only changed when they save.
  let readable = true;
  try {
    parseStoredAutomationDefinition(automation);
  } catch {
    readable = false;
  }
  const repairStep = {
    action: "tag_customer" as const,
    onFailure: "stop" as const,
    config: {
      noteText: getAutomationWorkspaceCopy(locale, "workspace.repairNote"),
    },
  };
  const builderAutomation = readable
    ? raw
    : {
        ...raw,
        trigger: "order.created",
        action: "tag_customer",
        isActive: false,
        conditions: null,
        config: JSON.stringify(repairStep.config),
        steps: JSON.stringify([repairStep]),
        dryRun: true,
      };

  const [runs, connected] = await Promise.all([
    listAutomationRunsForEditor(automation.id),
    whatsappConnected(),
  ]);

  return (
    <div className="app-workspace-content flex flex-col">
      <AutomationBuilder automation={builderAutomation} runs={runs} whatsappConnected={connected} />
    </div>
  );
}
