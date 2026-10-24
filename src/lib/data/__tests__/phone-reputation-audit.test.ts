/**
 * MNY-18: a second report on the same number replaces `notes`, so the earlier
 * reason was lost and nothing recorded the change. A re-report now leaves one
 * audit row holding both texts and only the last four digits of the number.
 * Real SQLite; the per-shop blind index is the real one.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { reportBadPhone } from "@/lib/data/phone-reputation";
import {
  TEST_SHOP_CONTEXT,
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";

const PHONE = "0555 123 456";
const FULL = "0555123456";
const ACTION = "phone_reputation.re_reported";

let db: PrismaClient;

function ctx() {
  return { prisma: db as never, shop: TEST_SHOP_CONTEXT };
}

async function auditRows() {
  return db.auditLog.findMany({
    where: { action: ACTION },
    orderBy: { createdAt: "asc" },
  });
}

beforeEach(async () => {
  db = await createTestPrisma();
});

afterAll(async () => {
  await disconnectTestPrisma(db);
});

describe("phone reputation re-report audit (MNY-18)", () => {
  it("writes no audit row on the first report", async () => {
    await reportBadPhone(ctx(), PHONE, "refused", "o1");

    expect(await auditRows()).toHaveLength(0);
    const row = await db.phoneReputation.findFirstOrThrow();
    expect(row.notes).toBe("[o1] refused");
    expect(row.reportCount).toBe(1);
  });

  it("writes one audit row with both texts and the 4-digit tail on a re-report", async () => {
    await reportBadPhone(ctx(), PHONE, "refused", "o1");
    await reportBadPhone(ctx(), PHONE, "fake address", "o2");

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    const entry = rows[0];
    if (!entry) throw new Error("no audit row was written");
    expect(entry.entity).toBe("phone_reputation");

    const stored = await db.phoneReputation.findFirstOrThrow();
    expect(entry.entityId).toBe(stored.id);

    const metadata = JSON.parse(entry.metadata ?? "{}");
    expect(metadata).toMatchObject({
      from: "[o1] refused",
      to: "[o2] fake address",
      last4: "3456",
      reportCount: 2,
    });

    const everything = JSON.stringify(entry);
    expect(everything).not.toContain(FULL);
    expect(everything).not.toContain("0555");
    expect(everything).not.toContain(stored.phoneHash);
  });

  it("keeps storing only the newest note in notes", async () => {
    await reportBadPhone(ctx(), PHONE, "refused", "o1");
    await reportBadPhone(ctx(), PHONE, "fake address", "o2");

    const stored = await db.phoneReputation.findFirstOrThrow();
    expect(stored.notes).toBe("[o2] fake address");
    expect(stored.reportCount).toBe(2);
  });

  it("writes one audit row for every re-report", async () => {
    await reportBadPhone(ctx(), PHONE, "a", "o1");
    await reportBadPhone(ctx(), PHONE, "b", "o2");
    await reportBadPhone(ctx(), PHONE, "c", "o3");

    const rows = await auditRows();
    expect(rows).toHaveLength(2);
    expect(JSON.parse(rows[1]?.metadata ?? "{}")).toMatchObject({
      from: "[o2] b",
      to: "[o3] c",
      reportCount: 3,
    });
  });

  it("cuts each text to 200 characters", async () => {
    await reportBadPhone(ctx(), PHONE, "x".repeat(300), "o1");
    await reportBadPhone(ctx(), PHONE, "y".repeat(400), "o2");

    const entry = (await auditRows())[0];
    if (!entry) throw new Error("no audit row was written");
    const metadata = JSON.parse(entry.metadata ?? "{}");
    expect(metadata.from).toHaveLength(200);
    expect(metadata.to).toHaveLength(200);
    expect(metadata.from.startsWith("[o1] xxx")).toBe(true);
  });

  it("never copies the full number from a reason into the audit row", async () => {
    await reportBadPhone(ctx(), PHONE, "first", "o1");
    await reportBadPhone(ctx(), PHONE, `called ${FULL} twice`, "o2");

    const [entry] = await auditRows();
    expect(JSON.stringify(entry)).not.toContain(FULL);
  });

  it("still succeeds when the audit write fails", async () => {
    await reportBadPhone(ctx(), PHONE, "first", "o1");
    const spy = vi
      .spyOn(db.auditLog, "create")
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(
      reportBadPhone(ctx(), PHONE, "second", "o2"),
    ).resolves.toMatchObject({ success: true });
    expect(spy).toHaveBeenCalledOnce();
    expect((await db.phoneReputation.findFirstOrThrow()).notes).toBe(
      "[o2] second",
    );
  });
});
