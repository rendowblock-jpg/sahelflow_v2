/**
 * Service-base tests — withServiceError + generateOrderNumber + nextOrderNumber.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withServiceError, generateOrderNumber, nextOrderNumber } from "../service-base";
import { SahelFlowError, NotFoundError, ValidationError } from "@/types/errors";
import { createTestPrisma, disconnectTestPrisma } from "./helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("generateOrderNumber", () => {
  it("formats with 4-digit padding", () => {
    expect(generateOrderNumber(1)).toBe("ORD-0001");
    expect(generateOrderNumber(42)).toBe("ORD-0042");
    expect(generateOrderNumber(9999)).toBe("ORD-9999");
    expect(generateOrderNumber(10000)).toBe("ORD-10000");
  });
});

describe("nextOrderNumber", () => {
  it("creates a counter starting at 1 if none exists", async () => {
    const num = await nextOrderNumber(db as never);
    expect(num).toBe("ORD-0001");
    const counter = await db.counter.findUnique({ where: { name: "ORD" } });
    expect(counter!.value).toBe(1);
  });

  it("increments an existing counter", async () => {
    await nextOrderNumber(db as never); // 1
    await nextOrderNumber(db as never); // 2
    const num = await nextOrderNumber(db as never); // 3
    expect(num).toBe("ORD-0003");
  });

  it("supports custom prefixes (separate sequences)", async () => {
    await nextOrderNumber(db as never, "SYNC-SHOPIFY");
    await nextOrderNumber(db as never, "SYNC-SHOPIFY");
    const ordNum = await nextOrderNumber(db as never, "ORD");
    const shopifyNum = await nextOrderNumber(db as never, "SYNC-SHOPIFY");
    expect(ordNum).toBe("ORD-0001");
    expect(shopifyNum).toBe("SYNC-SHOPIFY-0003");
  });

  it("is atomic — concurrent calls get distinct values", async () => {
    // Fire 10 concurrent nextOrderNumber calls
    const results = await Promise.all(
      Array.from({ length: 10 }, () => nextOrderNumber(db as never)),
    );
    const nums = results.map((r) => parseInt(r.split("-")[1]!, 10));
    const unique = new Set(nums);
    expect(unique.size).toBe(10); // all distinct
    expect(Math.max(...nums)).toBe(10);
  });
});

describe("withServiceError", () => {
  it("returns the result on success", async () => {
    const result = await withServiceError(async () => 42, "Test");
    expect(result).toBe(42);
  });

  it("lets SahelFlowError pass through", async () => {
    await expect(
      withServiceError(async () => {
        throw new NotFoundError("Widget", "abc");
      }, "Widget"),
    ).rejects.toThrow(NotFoundError);
  });

  it("converts ZodError to ValidationError", async () => {
    await expect(
      withServiceError(async () => {
        const err = new Error("Invalid input");
        err.name = "ZodError";
        throw err;
      }, "Test"),
    ).rejects.toThrow(ValidationError);
  });

  it("converts Prisma 'Record to update not found' to NotFoundError", async () => {
    await expect(
      withServiceError(async () => {
        throw new Error("Record to update not found");
      }, "Widget"),
    ).rejects.toThrow(NotFoundError);
  });

  it("wraps unknown errors in SahelFlowError", async () => {
    await expect(
      withServiceError(async () => {
        throw new Error("Something broke");
      }, "Widget"),
    ).rejects.toThrow(SahelFlowError);
  });
});
