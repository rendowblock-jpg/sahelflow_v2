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

  // F-0015: first-run setup waited 4.7-12 s on a lab runner; the sampler showed ~1,350 disk write operations for
  // POST /api/auth/setup and almost no CPU. One findUnique + one create per wilaya = one synced commit each.
  /** A context whose WilayaRiskProfile delegate counts every call made on it, per method. */
  function countingContext() {
    const calls: Record<string, number> = {};
    const real = db.wilayaRiskProfile as unknown as Record<string, unknown>;
    const delegate = new Proxy(real, {
      get(target, property: string) {
        const value = target[property];
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls[property] = (calls[property] ?? 0) + 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const prisma = new Proxy(db as unknown as Record<string, unknown>, {
      get(target, property: string) {
        if (property === "wilayaRiskProfile") return delegate;
        const value = target[property];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    return { calls, context: { prisma: prisma as never, shop: TEST_SHOP_CONTEXT } };
  }

  it("does not write one wilaya at a time: a handful of database calls for every wilaya", async () => {
    const { calls, context: counted } = countingContext();
    const result = await seedWilayaRiskProfilesForShop(counted);
    expect(result.seeded).toBeGreaterThan(50);
    const total = Object.values(calls).reduce((a, b) => a + b, 0);
    expect(total, JSON.stringify(calls)).toBeLessThanOrEqual(3);
    expect(await db.wilayaRiskProfile.count()).toBe(result.seeded);
  });

  it("a second run reads once and writes nothing", async () => {
    await seedWilayaRiskProfiles();
    const { calls, context: counted } = countingContext();
    const result = await seedWilayaRiskProfilesForShop(counted);
    expect(result.seeded).toBe(0);
    expect(result.skipped).toBeGreaterThan(50);
    expect(calls.create ?? 0).toBe(0);
    expect(calls.createMany ?? 0).toBe(0);
  });

  it("fills only what is missing and keeps a profile the seller already changed", async () => {
    await seedWilayaRiskProfiles();
    const total = await db.wilayaRiskProfile.count();
    await db.wilayaRiskProfile.update({ where: { wilaya: "Adrar" }, data: { riskLevel: 1, notes: "mine" } });
    await db.wilayaRiskProfile.delete({ where: { wilaya: "Oran" } });
    const result = await seedWilayaRiskProfiles();
    expect(result.seeded).toBe(1);
    expect(result.skipped).toBe(total - 1);
    expect(await db.wilayaRiskProfile.count()).toBe(total);
    const adrar = await db.wilayaRiskProfile.findUnique({ where: { wilaya: "Adrar" } });
    expect(adrar!.riskLevel).toBe(1);
    expect(adrar!.notes).toBe("mine");
  });

  it("survives a second seed that wrote some of the rows between its read and its write", async () => {
    const real = db.wilayaRiskProfile as unknown as Record<string, unknown>;
    let thrown = 0;
    const delegate = new Proxy(real, {
      get(target, property: string) {
        const value = target[property];
        if (typeof value !== "function") return value;
        if (property !== "createMany") return (value as (...a: unknown[]) => unknown).bind(target);
        return async (args: { data: Array<{ wilaya: string }> }) => {
          if (thrown === 0) {
            thrown++;
            // the other seed got there first with the first ten wilayas
            await (value as (a: unknown) => Promise<unknown>).call(target, { data: args.data.slice(0, 10) });
            throw Object.assign(new Error("Unique constraint failed on the fields: (`wilaya`)"), { code: "P2002" });
          }
          return (value as (a: unknown) => Promise<unknown>).call(target, args);
        };
      },
    });
    const prisma = new Proxy(db as unknown as Record<string, unknown>, {
      get(target, property: string) {
        if (property === "wilayaRiskProfile") return delegate;
        const value = target[property];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const result = await seedWilayaRiskProfilesForShop({ prisma: prisma as never, shop: TEST_SHOP_CONTEXT });
    const total = await db.wilayaRiskProfile.count();
    expect(thrown).toBe(1);
    expect(total).toBeGreaterThan(50);
    expect(result.seeded).toBe(total - 10);
    expect(result.seeded + result.skipped).toBe(total);
  });

  it("does not hide any other database error", async () => {
    const delegate = new Proxy(db.wilayaRiskProfile as unknown as Record<string, unknown>, {
      get(target, property: string) {
        if (property === "createMany") return async () => { throw Object.assign(new Error("disk is full"), { code: "SQLITE_FULL" }); };
        const value = target[property];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const prisma = new Proxy(db as unknown as Record<string, unknown>, {
      get(target, property: string) {
        if (property === "wilayaRiskProfile") return delegate;
        const value = target[property];
        return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    await expect(seedWilayaRiskProfilesForShop({ prisma: prisma as never, shop: TEST_SHOP_CONTEXT })).rejects.toThrow("disk is full");
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
