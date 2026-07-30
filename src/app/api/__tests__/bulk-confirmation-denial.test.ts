process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, expect, it, vi } from "vitest";

import { getJson, mockPost } from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

import { POST as bulkOrders } from "@/app/api/orders/bulk/route";

describe("bulk confirmation authority", () => {
  it("rejects confirmed before any bulk mutation executes", async () => {
    const response = await bulkOrders(
      mockPost("http://localhost/api/orders/bulk", {
        ids: ["legacy-order"],
        status: "confirmed",
      }),
    );

    expect(response.status).toBe(400);
    expect(await getJson(response)).toMatchObject({
      error: "Validation failed",
    });
  });
});
