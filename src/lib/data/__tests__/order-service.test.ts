import { describe, it, expect, vi } from "vitest";
import { findExistingOrderByExternalId } from "../order-service";

describe("Webhook dedup", () => {
  it("returns existing order when external_id already exists", async () => {
    const mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      is: vi.fn(() => mockSupabase),
      limit: vi.fn(() => mockSupabase),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "order-123" } }),
    } as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;

    const result = await findExistingOrderByExternalId(
      mockSupabase,
      "seller-1",
      "ext-456",
    );
    expect(result).toEqual({ id: "order-123" });
  });

  it("returns null when external_id is new", async () => {
    const mockSupabase = {
      from: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      is: vi.fn(() => mockSupabase),
      limit: vi.fn(() => mockSupabase),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    } as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;

    const result = await findExistingOrderByExternalId(
      mockSupabase,
      "seller-1",
      "ext-new",
    );
    expect(result).toBeNull();
  });
});
