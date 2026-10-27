/** Pauses survive a restart through the settings table (no migration). */
import { describe, expect, it, vi } from "vitest";
import { createQuotaLedger } from "../quota-ledger";
import { restoreQuotaLedger, saveQuotaLedger } from "../quota-ledger-store";

function fakeContext() {
  const rows = new Map<string, string>();
  const prisma = {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { key: where.key, value: rows.get(where.key)! } : null),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        rows.set(where.key, create.value);
      }),
    },
  };
  return { rows, context: { prisma, shop: "test" } as never };
}

describe("quota ledger store", () => {
  const T0 = new Date(2026, 9, 25, 12, 0, 0);

  it("saves a running pause and restores it into a fresh ledger", async () => {
    const { context } = fakeContext();
    const before = createQuotaLedger();
    before.recordQuotaHit("groq", 600, T0);
    await saveQuotaLedger(context, before);

    const after = createQuotaLedger();
    await restoreQuotaLedger(context, after, T0);
    expect(after.isPaused("groq", T0).until?.getTime()).toBe(T0.getTime() + 600_000);
    expect(after.isPaused("gemini", T0).paused).toBe(false);
  });

  it("ignores an expired or unreadable stored value", async () => {
    const { context, rows } = fakeContext();
    rows.set("ai_quota_pause_until_groq", new Date(T0.getTime() - 1000).toISOString());
    rows.set("ai_quota_pause_until_gemini", "not a date");
    const ledger = createQuotaLedger();
    await restoreQuotaLedger(context, ledger, T0);
    expect(ledger.isPaused("groq", T0).paused).toBe(false);
    expect(ledger.isPaused("gemini", T0).paused).toBe(false);
  });
});
