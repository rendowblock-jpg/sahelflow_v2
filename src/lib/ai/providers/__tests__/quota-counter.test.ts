/** Provider REQUEST counter (not message counter), kept in the settings table. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { quotaLedger } from "../quota-ledger";
import { saveQuotaLedger } from "../quota-ledger-store";
import {
  flushRequestCounts,
  noteProviderRequest,
  readRequestsToday,
  requestCountKey,
  resetPendingRequestCountsForTests,
} from "../quota-counter";

function fakeContext(opts: { failWrites?: () => boolean } = {}) {
  const rows = new Map<string, string>();
  const prisma = {
    setting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        rows.has(where.key) ? { key: where.key, value: rows.get(where.key)! } : null),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        if (opts.failWrites?.()) throw new Error("disk full");
        rows.set(where.key, create.value);
      }),
      findMany: vi.fn(async ({ where }: { where: { key: { startsWith: string } } }) =>
        [...rows.keys()].filter((k) => k.startsWith(where.key.startsWith)).map((key) => ({ key }))),
      deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => { rows.delete(where.key); }),
    },
  };
  return { rows, prisma, context: { prisma, shop: "test" } as never };
}

const NOW = new Date("2026-10-31T23:30:00.000Z");

beforeEach(() => resetPendingRequestCountsForTests());

describe("requestCountKey", () => {
  it("uses the UTC calendar day, whatever the machine's time zone", () => {
    expect(requestCountKey("groq", new Date("2026-10-31T23:59:59.000Z"))).toBe("ai_requests_groq_2026-10-31");
    expect(requestCountKey("gemini", new Date("2026-11-01T00:00:00.000Z"))).toBe("ai_requests_gemini_2026-11-01");
  });
});

describe("flushRequestCounts", () => {
  it("adds the requests noted since the last flush to today's key, per provider", async () => {
    const { context, rows } = fakeContext();
    noteProviderRequest("gemini", NOW);
    noteProviderRequest("gemini", NOW);
    noteProviderRequest("groq", NOW);
    await flushRequestCounts(context, NOW);
    expect(rows.get("ai_requests_gemini_2026-10-31")).toBe("2");
    expect(rows.get("ai_requests_groq_2026-10-31")).toBe("1");
    noteProviderRequest("gemini", NOW);
    await flushRequestCounts(context, NOW);
    expect(rows.get("ai_requests_gemini_2026-10-31")).toBe("3");
  });

  it("books a request on the day it was made, not the day it was written", async () => {
    const { context, rows } = fakeContext();
    noteProviderRequest("gemini", NOW);
    await flushRequestCounts(context, new Date("2026-11-01T00:00:05.000Z"));
    expect(rows.get("ai_requests_gemini_2026-10-31")).toBe("1");
    expect(rows.has("ai_requests_gemini_2026-11-01")).toBe(false);
  });

  it("does not lose counts when two flushes run at once", async () => {
    const { context, rows } = fakeContext();
    for (let i = 0; i < 4; i += 1) noteProviderRequest("groq", NOW);
    const first = flushRequestCounts(context, NOW);
    for (let i = 0; i < 3; i += 1) noteProviderRequest("groq", NOW);
    await Promise.all([first, flushRequestCounts(context, NOW)]);
    expect(rows.get("ai_requests_groq_2026-10-31")).toBe("7");
  });

  it("a failed write never throws, and the count is kept for the next flush", async () => {
    let fail = true;
    const { context, rows } = fakeContext({ failWrites: () => fail });
    noteProviderRequest("gemini", NOW);
    await expect(flushRequestCounts(context, NOW)).resolves.toBeUndefined();
    expect(rows.size).toBe(0);
    fail = false;
    await flushRequestCounts(context, NOW);
    expect(rows.get("ai_requests_gemini_2026-10-31")).toBe("1");
  });

  it("a failed read of the old count never throws either", async () => {
    const { context, prisma } = fakeContext();
    prisma.setting.findUnique.mockRejectedValue(new Error("locked"));
    noteProviderRequest("gemini", NOW);
    await expect(flushRequestCounts(context, NOW)).resolves.toBeUndefined();
  });

  it("deletes counters older than 3 days and keeps the others", async () => {
    const { context, rows } = fakeContext();
    rows.set("ai_requests_gemini_2026-10-27", "9");   // 4 days old: pruned
    rows.set("ai_requests_groq_2026-10-20", "9");     // 11 days old: pruned
    rows.set("ai_requests_gemini_2026-10-28", "5");   // exactly 3 days old: kept
    rows.set("ai_requests_gemini_2026-10-30", "2");   // yesterday: kept
    rows.set("ai_quota_pause_until_gemini", "2026-10-31T12:00:00.000Z"); // other keys never touched
    noteProviderRequest("gemini", NOW);
    await flushRequestCounts(context, NOW);
    expect([...rows.keys()].sort()).toEqual([
      "ai_quota_pause_until_gemini",
      "ai_requests_gemini_2026-10-28",
      "ai_requests_gemini_2026-10-30",
      "ai_requests_gemini_2026-10-31",
    ]);
  });
});

describe("readRequestsToday", () => {
  it("reads today's key only, 0 when nothing was counted", async () => {
    const { context, rows } = fakeContext();
    rows.set("ai_requests_gemini_2026-10-31", "12");
    rows.set("ai_requests_groq_2026-10-30", "40");
    expect(await readRequestsToday(context, NOW)).toEqual({ gemini: 12, groq: 0, openai: 0 });
  });

  it("includes requests noted but not yet written, and leaves a provider out when the read fails", async () => {
    const { context, rows, prisma } = fakeContext();
    rows.set("ai_requests_gemini_2026-10-31", "12");
    noteProviderRequest("gemini", NOW);
    expect((await readRequestsToday(context, NOW)).gemini).toBe(13);
    prisma.setting.findUnique.mockRejectedValue(new Error("locked"));
    expect(await readRequestsToday(context, NOW)).toEqual({});
  });

  it("treats a junk stored value as unknown, not as zero", async () => {
    const { context, rows } = fakeContext();
    rows.set("ai_requests_gemini_2026-10-31", "banana");
    expect((await readRequestsToday(context, NOW)).gemini).toBeUndefined();
  });
});

describe("saveQuotaLedger", () => {
  it("also writes the requests the shared ledger counted, and leaves a private test ledger alone", async () => {
    const { context, rows } = fakeContext();
    quotaLedger.recordRequest("groq", NOW);
    quotaLedger.recordRequest("groq", NOW);
    await saveQuotaLedger(context);
    expect(rows.get("ai_requests_groq_2026-10-31")).toBe("2");
  });
});
