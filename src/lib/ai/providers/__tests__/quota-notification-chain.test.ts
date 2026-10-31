process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * W3-G1 round 3 CHAIN test for `ai.quota` (w169). It starts at the REAL trigger: the real quota ledger gets a quota
 * answer (recordQuotaHit, fake clock) and the real store persists the pause (saveQuotaLedger) in a REAL SQLite. It ends
 * at what the SELLER reads: the real sync + list routes of the notification centre in ar (RTL), fr and en, with the
 * catalog sentence and the link. Only the trust check is replaced.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  const { shopContext: shop } = await import("@/lib/db");
  const context = {
    version: 1, shop,
    actor: { kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32), deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0 },
  };
  return { ...actual, requireTrustedActor: vi.fn(async () => context), isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  const { shopContext: shop } = await import("@/lib/db");
  return {
    ...actual,
    requireTrustedAction: vi.fn(async () => ({
      version: 1,
      shop,
      actor: {
        kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32),
        deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0,
      },
    })),
  };
});
vi.mock("next/headers", async () => (await import("@/lib/notifications/__tests__/next-headers-mock")).nextHeadersMock());

import { db, shopContext } from "@/lib/db";
import { LOCALES, expectWording, sellerRowsOf, syncCentre } from "@/lib/notifications/__tests__/seller-read";
import { createQuotaLedger } from "../quota-ledger";
import { restoreQuotaLedger, saveQuotaLedger } from "../quota-ledger-store";

const ctx = { prisma: db, shop: shopContext };
const LINK = "/settings?section=license";

// The store remembers what it wrote for the life of the process, so every test lives in its own hours.
let slot = 0;
let clock = new Date(0);
beforeEach(async () => {
  slot += 1;
  clock = new Date(Date.UTC(2026, 9, 31, 1 + slot * 3, 0, 0));
  await db.notificationDeliveryAttempt.deleteMany();
  await db.operationalNotification.deleteMany();
  await db.notificationEvent.deleteMany();
  await db.notificationPreference.deleteMany();
  await db.setting.deleteMany({ where: { key: { startsWith: "ai_quota_pause_until_" } } });
});
afterAll(async () => {
  await db.notificationEvent.deleteMany();
  await db.operationalNotification.deleteMany();
  await db.$disconnect();
});

const quotaEvents = () => db.notificationEvent.findMany({ where: { eventType: "ai.quota.v1" }, select: { eventKey: true } });
const minuteOf = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

describe("W3-G1 r3 chain: an AI provider is paused after a quota answer -> the seller is told once per pause", () => {
  it("quota answer -> pause saved -> ONE row, read in ar (RTL), fr and en, linking to the licence/settings screen", async () => {
    const ledger = createQuotaLedger(() => clock);
    const until = ledger.recordQuotaHit("gemini", 600, clock, { retryAtKnown: true });
    await saveQuotaLedger(ctx, ledger, clock);
    expect((await quotaEvents()).map((event) => event.eventKey)).toEqual([`ai.quota:gemini:p${minuteOf(until.toISOString())}`]);
    await syncCentre();
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "ai.quota");
      expect(rows, `one row in ${locale}`).toHaveLength(1);
      expectWording(rows[0]!, locale, "ai.quota", null, LINK);
    }
    const en = (await sellerRowsOf("en", "ai.quota"))[0]!;
    expect(en.title).toBe("AI helper resting");
    expect(en.body).toBe("The AI helper is resting for a while (free limit reached). Everything else works.");
    expect((await sellerRowsOf("fr", "ai.quota"))[0]!.title).toBe("L’assistant IA se repose");
    expect((await sellerRowsOf("ar", "ai.quota"))[0]!.title).toBe("مساعد الذكاء الاصطناعي في استراحة");
  });

  it("a second hit inside the same pause (same instant, then one minute later, which extends it) does not notify again", async () => {
    const ledger = createQuotaLedger(() => clock);
    ledger.recordQuotaHit("gemini", 600, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    ledger.recordQuotaHit("gemini", 600, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    const later = new Date(clock.getTime() + 60_000);
    ledger.recordQuotaHit("gemini", 600, later);
    await saveQuotaLedger(ctx, ledger, later);
    expect(await quotaEvents()).toHaveLength(1);
    await syncCentre();
    expect(await sellerRowsOf("en", "ai.quota")).toHaveLength(1);
  });

  it("each provider has its own notice", async () => {
    const ledger = createQuotaLedger(() => clock);
    ledger.recordQuotaHit("gemini", 600, clock);
    ledger.recordQuotaHit("groq", 600, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    const keys = (await quotaEvents()).map((event) => event.eventKey).sort();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^ai\.quota:gemini:p\d{8}$/);
    expect(keys[1]).toMatch(/^ai\.quota:groq:p\d{8}$/);
    await syncCentre();
    expect(await sellerRowsOf("fr", "ai.quota")).toHaveLength(2);
  });

  it("after the pause is over a NEW pause notifies again (two rows, two different keys)", async () => {
    const ledger = createQuotaLedger(() => clock);
    const first = ledger.recordQuotaHit("gemini", 600, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    clock = new Date(first.getTime() + 60_000);
    expect(ledger.isPaused("gemini", clock).paused).toBe(false);
    const second = ledger.recordQuotaHit("gemini", 600, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    const keys = (await quotaEvents()).map((event) => event.eventKey).sort();
    expect(keys).toEqual([
      `ai.quota:gemini:p${minuteOf(first.toISOString())}`,
      `ai.quota:gemini:p${minuteOf(second.toISOString())}`,
    ].sort());
    await syncCentre();
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "ai.quota");
      expect(rows, `two rows in ${locale}`).toHaveLength(2);
      for (const row of rows) expectWording(row, locale, "ai.quota", null, LINK);
    }
  });

  it("a restart that restores the saved pause and saves it again does not notify a second time", async () => {
    const ledger = createQuotaLedger(() => clock);
    ledger.recordQuotaHit("gemini", 900, clock);
    await saveQuotaLedger(ctx, ledger, clock);
    const afterRestart = createQuotaLedger(() => clock);
    await restoreQuotaLedger(ctx, afterRestart, clock);
    expect(afterRestart.isPaused("gemini", clock).paused).toBe(true);
    await saveQuotaLedger(ctx, afterRestart, clock);
    expect(await quotaEvents()).toHaveLength(1);
  });

  it("no pause, no notice", async () => {
    await saveQuotaLedger(ctx, createQuotaLedger(() => clock), clock);
    expect(await quotaEvents()).toHaveLength(0);
    await syncCentre();
    expect(await sellerRowsOf("en", "ai.quota")).toHaveLength(0);
  });
});
