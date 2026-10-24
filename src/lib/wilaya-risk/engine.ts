/**
 * Wilaya risk engine — seeds risk profiles + provides risk-based insights.
 *
 * Risk levels are derived from the wilaya's zone (south/highPlateaux = higher
 * risk due to distance + lower confirmation rates; north = lower risk). The
 * seller can override these defaults in the settings UI (future PR).
 */
import "server-only";


import type { ServiceContext } from "@/lib/data/service-base";
import { DEFAULT_LOCALE, getTranslations, type Locale } from "@/lib/i18n";
import { resolveWilayaProfileKey } from "./canonicalize";

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
  // 7-b P2: Arabic / unnormalized wilaya spellings must score, not silently
  // fall back to the default level. Exact key first (canonical seed rows),
  // then the canonicalization authority.
  const row =
    (await context.prisma.wilayaRiskProfile.findUnique({ where: { wilaya } })) ??
    (await context.prisma.wilayaRiskProfile.findUnique({
      where: { wilaya: await resolveWilayaProfileKey(wilaya) },
    }));
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
 * `label` and `recommendation` are read from the locale files in the asked
 * language (French when none is given, which is what API and AI-tool callers
 * got before). `labelKey` / `recommendationKey` stay the stable codes for
 * screens that translate on their own. Levels outside 1-5 show the moderate
 * (3) text.
 */
export async function assessOrderRisk(
  context: ServiceContext,
  wilaya: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{
  level: number;
  label: string;
  recommendation: string;
  labelKey: string;
  recommendationKey: string;
}> {
  const risk = await getWilayaRisk(context, wilaya);
  const level = risk?.riskLevel ?? 3;
  const shown = Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3;
  const labelKey = `wilaya.risk.level.${shown}`;
  const recommendationKey = `wilaya.risk.recommendation.${shown}`;
  const text = getTranslations(locale);
  return {
    level,
    label: text[labelKey] ?? labelKey,
    recommendation: text[recommendationKey] ?? recommendationKey,
    labelKey,
    recommendationKey,
  };
}
