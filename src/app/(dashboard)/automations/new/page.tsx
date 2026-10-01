import type { Metadata } from "next";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { findAutomationTemplate } from "@/components/automations/flow/flow-templates";
import { whatsappConnected } from "@/lib/automations/automation-readiness";
import { getI18n } from "@/lib/i18n-server";
import { getAutomationWorkspaceCopy } from "@/lib/i18n/automation-workspace";
import { requireTrustedAction } from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getAutomationWorkspaceCopy(locale, "flow.newTitle") };
}

export const dynamic = "force-dynamic";

/** A new automation, blank or prefilled from a template (`?template=key`). */
export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  await requireTrustedAction("automations.manage");
  const { locale } = await getI18n();
  const { template } = await searchParams;
  const preset = findAutomationTemplate(template)?.build(locale);

  return (
    <div className="app-workspace-content flex flex-col">
      <AutomationBuilder preset={preset} whatsappConnected={await whatsappConnected()} />
    </div>
  );
}
