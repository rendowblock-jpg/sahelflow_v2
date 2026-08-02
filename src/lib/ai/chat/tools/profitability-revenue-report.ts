import "server-only";

import { z } from "zod";

import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import type { DbClient } from "@/lib/db";
import type { ToolContext, ToolResult } from "./registry";
import { registerTool } from "./registry";

// Ensure the compatibility tool set is registered before this governed
// implementation replaces only `get_revenue_report` in the runtime Map.
import "./advanced-tools-legacy";

export const profitabilityRevenueReportSchema = z.object({
  period: z
    .enum(["today", "yesterday", "week", "month"])
    .optional()
    .default("today"),
});

function getDb(ctx: ToolContext): DbClient {
  return ctx.db as DbClient;
}

function resolvePeriod(
  period: z.infer<typeof profitabilityRevenueReportSchema>["period"],
  now: Date,
): { from: Date; to: Date; label: string } {
  const to = new Date(now);

  switch (period) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to, label: "Aujourd'hui" };
    }
    case "yesterday": {
      const end = new Date(now);
      end.setHours(0, 0, 0, 0);
      const from = new Date(end);
      from.setDate(from.getDate() - 1);
      return { from, to: end, label: "Hier" };
    }
    case "week": {
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      return { from, to, label: "7 derniers jours" };
    }
    case "month": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 1);
      return { from, to, label: "30 derniers jours" };
    }
  }
}

registerTool({
  definition: {
    name: "get_revenue_report",
    description:
      "Get governed realized revenue, net revenue, net profit, recognized orders, and average realized order value for today, yesterday, this week, or this month.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "yesterday", "week", "month"],
          description: "Time period (default: today)",
        },
      },
    },
  },
  async execute(params, ctx): Promise<ToolResult> {
    try {
      const input = profitabilityRevenueReportSchema.parse(params);
      const period = resolvePeriod(input.period, new Date());
      const profitability = await getProfitabilityProjection(getDb(ctx), {
        from: period.from,
        to: period.to,
      });
      const realizedRevenue = profitability.grossRevenue;
      const orderCount = profitability.recognizedOrderCount;

      return {
        success: true,
        data: {
          period: period.label,
          start: period.from.toISOString(),
          end: period.to.toISOString(),
          orderCount,
          revenue: realizedRevenue,
          realizedRevenue,
          netRevenue: profitability.netRevenue,
          netProfit: profitability.netProfit,
          profitabilityComplete: profitability.profitabilityComplete,
          missingCostItemCount: profitability.missingCostItemCount,
          estimatedCostItemCount: profitability.estimatedCostItemCount,
          averageOrderValue:
            orderCount > 0
              ? Math.round(realizedRevenue / orderCount)
              : 0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Erreur",
      };
    }
  },
});
