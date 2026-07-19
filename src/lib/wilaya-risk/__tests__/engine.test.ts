/**
 * Wilaya risk engine tests — seeding, lookup, listing, and order-risk assessment.
 *
 * Uses the cleanDb pattern + a manual cleanup of WilayaRiskProfile (not in the
 * shared cleanDb helper).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  seedWilayaRiskProfiles as seedWilayaRiskProfilesForShop,
  getWilayaRisk as getWilayaRiskForShop,
  listWilayaRisks as listWilayaRisksForShop,
  assessOrderRisk as assessOrderRiskForShop,
  type WilayaRisk,
} from "../engine";
import {
  createTestPrisma,
  disconnectTestPrisma,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

function context() {
  return { prisma: db as never, shop: TEST_SHOP_CONTEXT };
}

function seedWilayaRiskProfiles() {
  return seedWilayaRiskProfilesForShop(context());
}

function getWilayaRisk(wilaya: string) {
  return getWilayaRiskForShop(context(), wilaya);
}

function listWilayaRisks() {
  return listWilayaRisksForShop(context());
}

function assessOrderRisk(wilaya: string) {
  return assessOrderRiskForShop(context(), wilaya);
}

beforeEach(async () => {
  db = await createTestPrisma();
  await db.wilayaRiskProfile.deleteMany();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

// ── seedWilayaRiskProfiles ──────────────────────────────────────────────────

describe("seedWilayaRiskProfiles", () => {
  it("seeds all wilayas from data/wilayas.json on first run", async () => {
    const result = await seedWilayaRiskProfiles();
    expect(result.seeded).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
    const count = await db.wilayaRiskProfile.count();
    expect(count).toBe(result.seeded);
  });

  it("is idempotent — second run skips all and seeds none", async () => {
    await seedWilayaRiskProfiles();
    const result = await seedWilayaRiskProfiles();
    expect(result.seeded).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("assigns risk levels by zone (south = highest)", async () => {
    await seedWilayaRiskProfiles();
    // Adrar is in the "south" zone → riskLevel 5
    const adrar = await db.wilayaRiskProfile.findUnique({ where: { wilaya: "Adrar" } });
    expect(adrar).not.toBeNull();
    expect(adrar!.riskLevel).toBe(5);
    // A north/center/east wilaya should have a lower level (2).
    const lowRisk = await db.wilayaRiskProfile.findFirst({
      where: { riskLevel: 2 },
    });
    expect(lowRisk).not.toBeNull();
  });

  it("stores confirmationRate + returnRate + notes for each wilaya", async () => {
    await seedWilayaRiskProfiles();
    const adrar = await db.wilayaRiskProfile.findUnique({ where: { wilaya: "Adrar" } });
    expect(adrar!.confirmationRate).toBeGreaterThan(0);
    expect(adrar!.confirmationRate).toBeLessThan(1);
    expect(adrar!.returnRate).toBeGreaterThan(0);
    expect(adrar!.returnRate).toBeLessThan(1);
    expect(adrar!.notes).toBeTruthy();
  });
});

// ── getWilayaRisk ───────────────────────────────────────────────────────────

describe("getWilayaRisk", () => {
  it("returns null when no profile exists for the wilaya", async () => {
    const risk = await getWilayaRisk("Nonexistent Wilaya");
    expect(risk).toBeNull();
  });

  it("returns the profile shape when seeded", async () => {
    await db.wilayaRiskProfile.create({
      data: {
        wilaya: "Alger",
        riskLevel: 2,
        confirmationRate: 0.78,
        returnRate: 0.12,
        notes: "Center — Algiers region",
      },
    });
    const risk: WilayaRisk | null = await getWilayaRisk("Alger");
    expect(risk).not.toBeNull();
    expect(risk!.wilaya).toBe("Alger");
    expect(risk!.riskLevel).toBe(2);
    expect(risk!.confirmationRate).toBe(0.78);
    expect(risk!.returnRate).toBe(0.12);
    expect(risk!.notes).toBe("Center — Algiers region");
  });

  it("returns notes as undefined when null in DB", async () => {
    await db.wilayaRiskProfile.create({
      data: { wilaya: "TestWilaya", riskLevel: 3, confirmationRate: 0.7, returnRate: 0.15 },
    });
    const risk = await getWilayaRisk("TestWilaya");
    expect(risk!.notes).toBeUndefined();
  });

  it("defaults null confirmationRate/returnRate to 0", async () => {
    await db.wilayaRiskProfile.create({
      data: { wilaya: "NullableWilaya", riskLevel: 3, confirmationRate: null, returnRate: null },
    });
    const risk = await getWilayaRisk("NullableWilaya");
    expect(risk!.confirmationRate).toBe(0);
    expect(risk!.returnRate).toBe(0);
  });
});

// ── listWilayaRisks ─────────────────────────────────────────────────────────

describe("listWilayaRisks", () => {
  it("returns an empty array when nothing is seeded", async () => {
    const list = await listWilayaRisks();
    expect(list).toEqual([]);
  });

  it("returns all profiles sorted by riskLevel desc", async () => {
    await db.wilayaRiskProfile.create({
      data: { wilaya: "Low", riskLevel: 1, confirmationRate: 0.85, returnRate: 0.05 },
    });
    await db.wilayaRiskProfile.create({
      data: { wilaya: "High", riskLevel: 5, confirmationRate: 0.5, returnRate: 0.28 },
    });
    await db.wilayaRiskProfile.create({
      data: { wilaya: "Mid", riskLevel: 3, confirmationRate: 0.7, returnRate: 0.16 },
    });
    const list = await listWilayaRisks();
    expect(list).toHaveLength(3);
    expect(list[0]!.wilaya).toBe("High");
    expect(list[1]!.wilaya).toBe("Mid");
    expect(list[2]!.wilaya).toBe("Low");
  });

  it("maps each row to the WilayaRisk interface", async () => {
    await db.wilayaRiskProfile.create({
      data: {
        wilaya: "Alger",
        riskLevel: 2,
        confirmationRate: 0.78,
        returnRate: 0.12,
        notes: "test note",
      },
    });
    const list = await listWilayaRisks();
    const first = list[0]!;
    expect(first.wilaya).toBe("Alger");
    expect(first.riskLevel).toBe(2);
    expect(first.confirmationRate).toBe(0.78);
    expect(first.returnRate).toBe(0.12);
    expect(first.notes).toBe("test note");
  });
});

// ── assessOrderRisk (wilaya-level) ──────────────────────────────────────────

describe("assessOrderRisk (wilaya-level)", () => {
  it("returns level 3 + 'Modéré' label for an unknown wilaya", async () => {
    const result = await assessOrderRisk("UnknownWilaya");
    expect(result.level).toBe(3);
    expect(result.label).toBe("Modéré");
    expect(result.recommendation).toBe("Confirmer par téléphone avant expédition");
  });

  it("returns the seeded level + matching label + recommendation", async () => {
    await db.wilayaRiskProfile.create({
      data: { wilaya: "Adrar", riskLevel: 5, confirmationRate: 0.5, returnRate: 0.28 },
    });
    const result = await assessOrderRisk("Adrar");
    expect(result.level).toBe(5);
    expect(result.label).toBe("Très élevé");
    expect(result.recommendation).toBe("Prépaiement recommandé ou confirmation double");
  });

  it("maps each risk level (1-5) to its label + recommendation", async () => {
    const cases: Array<{ level: number; wilaya: string; label: string; recommendation: string }> = [
      { level: 1, wilaya: "W1", label: "Très faible", recommendation: "Confirmer automatiquement" },
      { level: 2, wilaya: "W2", label: "Faible", recommendation: "Confirmation standard" },
      { level: 3, wilaya: "W3", label: "Modéré", recommendation: "Confirmer par téléphone avant expédition" },
      { level: 4, wilaya: "W4", label: "Élevé", recommendation: "Confirmation obligatoire + suivi renforcé" },
      { level: 5, wilaya: "W5", label: "Très élevé", recommendation: "Prépaiement recommandé ou confirmation double" },
    ];
    for (const c of cases) {
      await db.wilayaRiskProfile.create({
        data: { wilaya: c.wilaya, riskLevel: c.level, confirmationRate: 0.5, returnRate: 0.1 },
      });
      const result = await assessOrderRisk(c.wilaya);
      expect(result.level).toBe(c.level);
      expect(result.label).toBe(c.label);
      expect(result.recommendation).toBe(c.recommendation);
      await db.wilayaRiskProfile.delete({ where: { wilaya: c.wilaya } });
    }
  });
});
