/**
 * Wilaya risk engine — seeds risk profiles + provides risk-based insights.
 *
 * Risk levels are derived from the wilaya's zone (south/highPlateaux = higher
 * risk due to distance + lower confirmation rates; north = lower risk). The
 * seller can override these defaults in the settings UI (future PR).
 */
import "server-only";


import type { ServiceContext } from "@/lib/data/service-base";

export interface WilayaRisk {
  wilaya: string;
  riskLevel: number; // 1 (low) to 5 (high)
  confirmationRate: number; // 0-1, estimated
  returnRate: number; // 0-1, estimated
  notes?: string;
}

const ZONE_RISK: Record<string, Omit<WilayaRisk, "wilaya">> = {
  north: { riskLevel: 2, confirmationRate: 0.78, returnRate: 0.12, notes: "North — urban, good confirmation" },
  east: { riskLevel: 2, confirmationRate: 0.75, returnRate: 0.14, notes: "East — solid COD market" },
  west: { riskLevel: 3, confirmationRate: 0.70, returnRate: 0.16, notes: "West — moderate risk" },
  center: { riskLevel: 2, confirmationRate: 0.76, returnRate: 0.13, notes: "Center — Algiers region" },
  highPlateaux: { riskLevel: 4, confirmationRate: 0.60, returnRate: 0.22, notes: "High plateaux — lower confirmation, higher returns" },
  south: { riskLevel: 5, confirmationRate: 0.50, returnRate: 0.28, notes: "South — highest risk (distance, logistics)" },
};

/** Seed the WilayaRiskProfile table from data/wilayas.json. Idempotent. */
export async function seedWilayaRiskProfiles(
  context: ServiceContext,
): Promise<{ seeded: number; skipped: number }> {
  const wilayas = (await import("../../../data/wilayas.json")).default as Array<{
    name: string;
    zone: string;
  }>;
  let seeded = 0;
  let skipped = 0;

  for (const w of wilayas) {
    const existing = await context.prisma.wilayaRiskProfile.findUnique({
      where: { wilaya: w.name },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const zoneRisk = ZONE_RISK[w.zone] ?? ZONE_RISK.center!;
    await context.prisma.wilayaRiskProfile.create({
      data: {
        wilaya: w.name,
        riskLevel: zoneRisk.riskLevel,
        confirmationRate: zoneRisk.confirmationRate,
        returnRate: zoneRisk.returnRate,
        notes: zoneRisk.notes,
      },
    });
    seeded++;
  }

  return { seeded, skipped };
}

/** Get the risk profile for a wilaya (or null if not seeded). */
export async function getWilayaRisk(
  context: ServiceContext,
  wilaya: string,
): Promise<WilayaRisk | null> {
  const row = await context.prisma.wilayaRiskProfile.findUnique({ where: { wilaya } });
  if (!row) return null;
  return {
    wilaya: row.wilaya,
    riskLevel: row.riskLevel,
    confirmationRate: row.confirmationRate ?? 0,
    returnRate: row.returnRate ?? 0,
    notes: row.notes ?? undefined,
  };
}

/** Get all risk profiles (for the risk dashboard). */
export async function listWilayaRisks(context: ServiceContext): Promise<WilayaRisk[]> {
  const rows = await context.prisma.wilayaRiskProfile.findMany({
    orderBy: { riskLevel: "desc" },
  });
  return rows.map((r) => ({
    wilaya: r.wilaya,
    riskLevel: r.riskLevel,
    confirmationRate: r.confirmationRate ?? 0,
    returnRate: r.returnRate ?? 0,
    notes: r.notes ?? undefined,
  }));
}

/**
 * Assess an order's risk based on the delivery wilaya.
 *
 * i18n (W3-5 — partial fix): the function now returns TWO views of the
 * risk label + recommendation:
 *   - `label` / `recommendation`: French strings (BACKWARD COMPATIBLE —
 *     the existing `wilaya-risk/engine.test.ts` asserts these exact
 *     strings, and the AI tool `extended-tools.ts:getWilayaRisk` feeds
 *     them verbatim to the LLM, which can't translate i18n keys).
 *   - `labelKey` / `recommendationKey`: dotted i18n keys (e.g.
 *     `wilaya.risk.level.5`) that UI consumers can pass to `t()` for
 *     locale-aware display. Available in all 3 locale files (en/fr/ar).
 *
 * The full refactor (deprecate `label`/`recommendation` and have all
 * consumers use the `*Key` fields) is deferred to a follow-up wave —
 * it touches the API route, the AI tool, and 2-3 UI components, and
 * would break the risk badge contract in this polish pass.
 *
 * Consumers that want locale-aware display TODAY should prefer
 * `t(labelKey)` over `label`. Consumers that need a stable,
 * locale-independent value (e.g. for AI tool output, logging, or
 * non-UI surfaces) should keep using `label`.
 */
export async function assessOrderRisk(context: ServiceContext, wilaya: string): Promise<{
  level: number;
  label: string;
  recommendation: string;
  labelKey: string;
  recommendationKey: string;
}> {
  const risk = await getWilayaRisk(context, wilaya);
  const level = risk?.riskLevel ?? 3;
  const labels: Record<number, string> = {
    1: "Très faible",
    2: "Faible",
    3: "Modéré",
    4: "Élevé",
    5: "Très élevé",
  };
  const recommendations: Record<number, string> = {
    1: "Confirmer automatiquement",
    2: "Confirmation standard",
    3: "Confirmer par téléphone avant expédition",
    4: "Confirmation obligatoire + suivi renforcé",
    5: "Prépaiement recommandé ou confirmation double",
  };
  const labelKeys: Record<number, string> = {
    1: "wilaya.risk.level.1",
    2: "wilaya.risk.level.2",
    3: "wilaya.risk.level.3",
    4: "wilaya.risk.level.4",
    5: "wilaya.risk.level.5",
  };
  const recommendationKeys: Record<number, string> = {
    1: "wilaya.risk.recommendation.1",
    2: "wilaya.risk.recommendation.2",
    3: "wilaya.risk.recommendation.3",
    4: "wilaya.risk.recommendation.4",
    5: "wilaya.risk.recommendation.5",
  };
  return {
    level,
    label: labels[level] ?? "Modéré",
    recommendation: recommendations[level] ?? "Confirmation standard",
    labelKey: labelKeys[level] ?? "wilaya.risk.level.3",
    recommendationKey: recommendationKeys[level] ?? "wilaya.risk.recommendation.3",
  };
}
