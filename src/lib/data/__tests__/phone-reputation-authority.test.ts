import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkPhoneReputation,
  getBadPhoneList,
  reportBadPhone,
} from "@/lib/data/phone-reputation";
import {
  deriveExistingShopBlindIndex,
  deriveShopBlindIndex,
} from "@/lib/crypto/protected-record";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

vi.mock("@/lib/crypto/protected-record", () => ({
  deriveShopBlindIndex: vi.fn(),
  deriveExistingShopBlindIndex: vi.fn(),
}));

const deriveWrite = vi.mocked(deriveShopBlindIndex);
const deriveRead = vi.mocked(deriveExistingShopBlindIndex);

function context() {
  const upsert = vi.fn().mockResolvedValue({});
  const count = vi.fn().mockResolvedValue(3);
  const findUnique = vi.fn();
  const findMany = vi.fn();
  const prisma = {
    phoneReputation: { upsert, count, findUnique, findMany },
  };
  return {
    service: { prisma: prisma as never, shop: TEST_SHOP_CONTEXT },
    upsert,
    count,
    findUnique,
    findMany,
  };
}

describe("phone reputation Phase 4 blind-index authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deriveWrite.mockResolvedValue("canonical-write-hash");
    deriveRead.mockResolvedValue("canonical-read-hash");
  });

  it("writes through the per-shop blind-index authority", async () => {
    const { service, upsert, count } = context();

    await expect(
      reportBadPhone(service, "0555 123 456", "refused", "order-1"),
    ).resolves.toEqual({ success: true, total: 3 });

    expect(deriveWrite).toHaveBeenCalledWith(
      service.prisma,
      "0555123456",
      { recordType: "PhoneReputation", field: "phone" },
      { shopContext: TEST_SHOP_CONTEXT },
    );
    expect(upsert).toHaveBeenCalledWith({
      where: { phoneHash: "canonical-write-hash" },
      create: expect.objectContaining({
        phoneHash: "canonical-write-hash",
        last4: "3456",
        severity: "bad",
        notes: "[order-1] refused",
        reportCount: 1,
      }),
      update: expect.objectContaining({
        last4: "3456",
        reportCount: { increment: 1 },
        notes: "[order-1] refused",
      }),
    });
    expect(count).toHaveBeenCalledOnce();
  });

  it("keeps a committed report successful when the count projection fails", async () => {
    const { service, count } = context();
    count.mockRejectedValueOnce(new Error("count unavailable"));

    await expect(reportBadPhone(service, "0777123456", "fake")).resolves.toEqual({
      success: true,
      total: 1,
    });
  });

  it("reads through the existing per-shop authority and returns the stored result", async () => {
    const { service, findUnique } = context();
    const lastSeenAt = new Date("2026-08-07T00:00:00.000Z");
    findUnique.mockResolvedValueOnce({ notes: "refused twice", lastSeenAt });

    await expect(checkPhoneReputation(service, "0666 123 456")).resolves.toEqual({
      isBad: true,
      reason: "refused twice",
      reportedAt: "2026-08-07T00:00:00.000Z",
    });

    expect(deriveRead).toHaveBeenCalledWith(
      service.prisma,
      "0666123456",
      { recordType: "PhoneReputation", field: "phone" },
      { shopContext: TEST_SHOP_CONTEXT },
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { phoneHash: "canonical-read-hash" },
      select: { notes: true, lastSeenAt: true },
    });
  });

  it("returns clean misses without querying on a missing blind-index authority", async () => {
    const { service, findUnique } = context();
    deriveRead.mockResolvedValueOnce(null);

    await expect(checkPhoneReputation(service, "0555000000")).resolves.toEqual({
      isBad: false,
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns a clean miss when the canonical hash has no reputation row", async () => {
    const { service, findUnique } = context();
    findUnique.mockResolvedValueOnce(null);

    await expect(checkPhoneReputation(service, "0555000001")).resolves.toEqual({
      isBad: false,
    });
  });

  it("maps the stored registry to display-safe fields", async () => {
    const { service, findMany } = context();
    findMany.mockResolvedValueOnce([
      {
        phoneHash: "hash-1",
        last4: "1234",
        notes: "bad address",
        lastSeenAt: new Date("2026-08-06T10:00:00.000Z"),
      },
      {
        phoneHash: "hash-2",
        last4: null,
        notes: null,
        lastSeenAt: new Date("2026-08-05T09:00:00.000Z"),
      },
    ]);

    await expect(getBadPhoneList(service)).resolves.toEqual([
      {
        phoneHash: "hash-1",
        phoneTail: "1234",
        reason: "bad address",
        at: "2026-08-06T10:00:00.000Z",
      },
      {
        phoneHash: "hash-2",
        phoneTail: undefined,
        reason: "(no reason recorded)",
        at: "2026-08-05T09:00:00.000Z",
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { lastSeenAt: "desc" },
      select: { phoneHash: true, last4: true, notes: true, lastSeenAt: true },
    });
  });
});
