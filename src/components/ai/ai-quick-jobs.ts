import {
  CircleDollarSign,
  ClipboardCheck,
  PackageSearch,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { AiShopBriefing } from "@/components/ai/ai-workspace-types";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

export type AiQuickJobId = "pending" | "revenue" | "returns" | "products" | "deliveries";

export interface AiQuickJob {
  id: AiQuickJobId;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  /** The live count the job is about — null when it could not be measured. */
  count: number | null;
}

function briefingCount(id: AiQuickJobId, briefing: AiShopBriefing | undefined) {
  if (!briefing) return null;
  switch (id) {
    case "pending":
      return briefing.pendingOrders;
    case "revenue":
      return briefing.ordersToday;
    case "products":
      return briefing.lowStockProducts;
    case "deliveries":
      return briefing.pendingDeliveries;
    default:
      return null;
  }
}

/**
 * The seller jobs the agent is built around, grounded in the shop's live
 * briefing. One catalog feeds the home suggestions and the composer's "/"
 * menu, so both always offer the same jobs with the same wording.
 */
export function buildAiQuickJobs(
  workspace: ReturnType<typeof useAiWorkspace>,
): AiQuickJob[] {
  const { copy, locale } = workspace;
  const briefing = workspace.capabilities?.briefing;
  const jobs: Array<Omit<AiQuickJob, "count">> = [
    {
      id: "pending",
      title: copy("launchPendingTitle"),
      description: copy("launchPendingDescription"),
      prompt: copy("launchPendingPrompt"),
      icon: ClipboardCheck,
    },
    {
      id: "revenue",
      title: copy("launchRevenueTitle"),
      description: copy("launchRevenueDescription"),
      prompt: copy("launchRevenuePrompt"),
      icon: CircleDollarSign,
    },
    {
      id: "products",
      title: copy("launchProductsTitle"),
      description: copy("launchProductsDescription"),
      prompt: copy("launchProductsPrompt"),
      icon: PackageSearch,
    },
    {
      id: "returns",
      title: copy("launchReturnsTitle"),
      description: copy("launchReturnsDescription"),
      prompt: copy("launchReturnsPrompt"),
      icon: RotateCcw,
    },
    {
      id: "deliveries",
      title: getAiDecisionCopy(locale, "briefingDeliveries"),
      description: getAiDecisionCopy(locale, "briefingDeliveriesPrompt"),
      prompt: getAiDecisionCopy(locale, "briefingDeliveriesPrompt"),
      icon: Truck,
    },
  ];
  return jobs.map((job) => ({ ...job, count: briefingCount(job.id, briefing) }));
}

/** Case- and accent-insensitive match for the "/" filter. */
export function matchesQuickJob(job: AiQuickJob, query: string): boolean {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
  const needle = fold(query.trim());
  if (!needle) return true;
  return fold(`${job.title} ${job.description}`).includes(needle);
}
