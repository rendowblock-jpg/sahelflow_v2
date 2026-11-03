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

/**
 * Seed the WilayaRiskProfile table from data/wilayas.json. Idempotent: a wilaya that already has a profile is left
 * exactly as it is (the seller may have changed it).
 *
 * One read for what exists and one write for what is missing. The first version did a findUnique and a create per
 * wilaya (69 of each), and every create was its own synced commit: the lab measured about 1,270 disk write operations
 * and 4.7-12 s for the first-run PIN setup on a fast server disk, with almost no CPU (finding F-0015).
 */
export async function seedWilayaRiskProfiles(
  context: ServiceContext,
): Promise<{ seeded: number; skipped: number }> {
  const wilayas = (await import("../../../data/wilayas.json")).default as Array<{
    name: string;
    zone: string;
  }>;

  const missingNow = async () => {
    const existing = await context.prisma.wilayaRiskProfile.findMany({
      select: { wilaya: true },
    });
    const have = new Set(existing.map((row) => row.wilaya));
    return wilayas
      .filter((w) => !have.has(w.name))
      .map((w) => {
        const zoneRisk = ZONE_RISK[w.zone] ?? ZONE_RISK.center!;
        return {
          wilaya: w.name,
          riskLevel: zoneRisk.riskLevel,
          confirmationRate: zoneRisk.confirmationRate,
          returnRate: zoneRisk.returnRate,
          notes: zoneRisk.notes,
        };
      });
  };

  let missing = await missingNow();
  let seeded = 0;
  if (missing.length > 0) {
    try {
      seeded = (await context.prisma.wilayaRiskProfile.createMany({ data: missing })).count;
    } catch (error) {
      // SQLite has no skipDuplicates. A second seed running at the same moment (first-run setup and the risk page can
      // both ask) may have written some of these between our read and our write; the batch then fails as a whole.
      // Read again and write what is still missing, once.
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      missing = await missingNow();
      if (missing.length > 0) {
        seeded = (await context.prisma.wilayaRiskProfile.createMany({ data: missing })).count;
      }
    }
  }

  return { seeded, skipped: wilayas.length - seeded };
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
