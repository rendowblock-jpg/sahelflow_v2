import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findExistingOrderByExternalId,
  getOrders,
  getOrder,
  deleteOrder,
  restoreOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
} from "../order-service";

function chain(result: any) {
  const c: any = {
    from: () => c,
    select: () => c,
    insert: () => c,
    update: () => c,
    delete: () => c,
    eq: () => c,
    is: () => c,
    not: () => c,
    order: () => c,
    range: () => c,
    upsert: () => c,
    limit: () => c,
    maybeSingle: () => Promise.resolve({ data: result.data || null, error: result.error || null }),
    single: () => Promise.resolve(result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return c;
}

vi.mock("@/lib/data/supabase-helpers", () => ({
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/data/auth-service", () => {
  const mockGetCurrentUser = vi.fn();
  return {
    getCurrentUser: mockGetCurrentUser,
    getActiveSellerId: vi.fn(async () => {
      const user = await mockGetCurrentUser();
      if (!user) throw new Error("Not authenticated");
      return user.id;
    }),
  };
});

vi.mock("@/lib/automation/executor", () => ({
  executeRecipes: vi.fn().mockResolvedValue(undefined),
}));

import { getSupabase } from "@/lib/data/supabase-helpers";
import { getCurrentUser } from "@/lib/data/auth-service";
import { executeRecipes } from "@/lib/automation/executor";

describe("order-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "seller-1" } as any);
  });

  describe("Webhook dedup", () => {
    it("returns existing order when external_id already exists", async () => {
      const mockSupabase = {
        from: vi.fn(() => mockSupabase),
        select: vi.fn(() => mockSupabase),
        eq: vi.fn(() => mockSupabase),
        is: vi.fn(() => mockSupabase),
        limit: vi.fn(() => mockSupabase),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: "order-123" } }),
      } as any;

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
      } as any;

      const result = await findExistingOrderByExternalId(
        mockSupabase,
        "seller-1",
        "ext-new",
      );
      expect(result).toBeNull();
    });
  });

  describe("getOrders", () => {
    it("returns orders with default limit and offset", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: [{ id: "o1" }], count: 1, error: null })
      );
      const result = await getOrders();
      expect(result.data).toEqual([{ id: "o1" }]);
      expect(result.total).toBe(1);
    });

    it("handles filter by status", async () => {
      let eqCalledWith: any[] = [];
      const client = chain({ data: [{ id: "o1" }], count: 1, error: null });
      client.eq = (...args: any[]) => {
        eqCalledWith = args;
        return client;
      };
      vi.mocked(getSupabase).mockReturnValue(client);
      const result = await getOrders({ status: "pending" });
      expect(result.data).toEqual([{ id: "o1" }]);
      expect(eqCalledWith).toEqual(["status", "pending"]);
    });

    it("does not call eq for 'all' status", async () => {
      let eqCalled = false;
      const client = chain({ data: [{ id: "o1" }], count: 1, error: null });
      client.eq = () => {
        eqCalled = true;
        return client;
      };
      vi.mocked(getSupabase).mockReturnValue(client);
      await getOrders({ status: "all" });
      expect(eqCalled).toBe(false);
    });

    it("returns empty array when data is null", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, count: null, error: null })
      );
      const result = await getOrders();
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("throws error when query fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, error: new Error("query error") })
      );
      await expect(getOrders()).rejects.toThrow("query error");
    });
  });

  describe("getOrder", () => {
    it("returns a single order", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: { id: "o1" }, error: null })
      );
      const result = await getOrder("o1");
      expect(result).toEqual({ id: "o1" });
    });

    it("throws error when fetching fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, error: new Error("fetch error") })
      );
      await expect(getOrder("o1")).rejects.toThrow("fetch error");
    });
  });

  describe("deleteOrder", () => {
    it("soft-deletes order successfully", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ error: null })
      );
      await expect(deleteOrder("o1")).resolves.toBeUndefined();
    });

    it("throws error when soft-delete fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ error: new Error("delete error") })
      );
      await expect(deleteOrder("o1")).rejects.toThrow("delete error");
    });
  });

  describe("restoreOrder", () => {
    it("restores order successfully", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: { id: "o1", deleted_at: null }, error: null })
      );
      const result = await restoreOrder("o1");
      expect(result.deleted_at).toBeNull();
    });

    it("throws error when restore fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, error: new Error("restore error") })
      );
      await expect(restoreOrder("o1")).rejects.toThrow("restore error");
    });
  });

  describe("createOrder", () => {
    it("creates order with active seller ID", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: { id: "o1", seller_id: "seller-1" }, error: null })
      );
      const result = await createOrder({ items: [], total_price: 100 });
      expect(result.seller_id).toBe("seller-1");
    });

    it("throws when not authenticated", async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      await expect(createOrder({ items: [], total_price: 100 })).rejects.toThrow("Not authenticated");
    });

    it("throws when insert fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, error: new Error("insert error") })
      );
      await expect(createOrder({ items: [], total_price: 100 })).rejects.toThrow("insert error");
    });
  });

  describe("updateOrder", () => {
    it("updates order successfully", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: { id: "o1", notes: "updated notes" }, error: null })
      );
      const result = await updateOrder("o1", { notes: "updated notes" });
      expect(result.notes).toBe("updated notes");
    });

    it("throws when update fails", async () => {
      vi.mocked(getSupabase).mockReturnValue(
        chain({ data: null, error: new Error("update error") })
      );
      await expect(updateOrder("o1", { notes: "updated" })).rejects.toThrow("update error");
    });
  });

  describe("updateOrderStatus", () => {
    it("throws when RPC fails", async () => {
      const client = chain({});
      client.rpc = vi.fn().mockResolvedValue({ error: new Error("rpc error") });
      vi.mocked(getSupabase).mockReturnValue(client);

      await expect(updateOrderStatus("o1", "confirmed")).rejects.toThrow("rpc error");
    });

    it("throws when fetch order after RPC fails", async () => {
      const client = chain({});
      client.rpc = vi.fn().mockResolvedValue({ error: null });
      const clientWithFailFetch = chain({ data: null, error: new Error("fetch error") });
      clientWithFailFetch.rpc = client.rpc;
      vi.mocked(getSupabase).mockReturnValue(clientWithFailFetch);

      await expect(updateOrderStatus("o1", "confirmed")).rejects.toThrow("fetch error");
    });

    it("handles non-terminal status transitions, executes recipes, does not update risk score", async () => {
      const orderData = {
        id: "o1",
        total_price: 500,
        wilaya: "Alger",
        customer: { id: "c1" }
      };

      const client = chain({ data: orderData, error: null });
      client.rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabase).mockReturnValue(client);

      const result = await updateOrderStatus("o1", "confirmed");
      expect(result).toEqual(orderData);
      expect(executeRecipes).toHaveBeenCalledWith({
        type: "order.confirmed",
        sellerId: "seller-1",
        data: {
          order_id: "o1",
          customer_id: "c1",
          risk_score: 0,
          status: "confirmed",
          total_price: 500,
          wilaya: "Alger"
        }
      });
    });

    it("skips automations and logs if no seller ID found", async () => {
      const orderData = {
        id: "o1",
        total_price: 500,
        wilaya: "Alger",
        customer: { id: "c1" }
      };

      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const client = chain({ data: orderData, error: null });
      client.rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabase).mockReturnValue(client);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await updateOrderStatus("o1", "confirmed");
      expect(executeRecipes).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("automation_skipped"));
      logSpy.mockRestore();
    });

    it("logs error and does not throw when automations fail", async () => {
      const orderData = {
        id: "o1",
        total_price: 500,
        wilaya: "Alger",
        customer: { id: "c1" }
      };

      vi.mocked(executeRecipes).mockRejectedValueOnce(new Error("automation error"));

      const client = chain({ data: orderData, error: null });
      client.rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabase).mockReturnValue(client);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const result = await updateOrderStatus("o1", "confirmed");
      expect(result).toEqual(orderData);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("automation_executor_error"));
      logSpy.mockRestore();
    });

    it("handles null customer, null total_price, and null wilaya when executing recipes", async () => {
      const orderData = {
        id: "o1",
        total_price: null,
        wilaya: null,
        customer: null
      };

      const client = chain({ data: orderData, error: null });
      client.rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(getSupabase).mockReturnValue(client);

      const result = await updateOrderStatus("o1", "confirmed");
      expect(result).toEqual(orderData);
      expect(executeRecipes).toHaveBeenCalledWith({
        type: "order.confirmed",
        sellerId: "seller-1",
        data: {
          order_id: "o1",
          customer_id: undefined,
          risk_score: 0,
          status: "confirmed",
          total_price: 0,
          wilaya: ""
        }
      });
    });

    describe("customer risk score calculation (T5 — assertions added)", () => {
      const orderData = {
        id: "o1",
        total_price: 500,
        wilaya: "Alger",
        customer: { id: "c1" }
      };

      // Helper: build a mock supabase client that returns custOrders for the
      // customer_id query, and captures the risk_score update call.
      function buildRiskScoreMock(custOrders: any[] | null) {
        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        });
        const rpcMock = vi.fn().mockResolvedValue({ error: null });
        vi.mocked(getSupabase).mockImplementation(() => {
          const mockSub: any = chain({ data: orderData, error: null });
          mockSub.rpc = rpcMock;
          mockSub.select = vi.fn(() => mockSub);
          mockSub.update = updateMock;
          mockSub.eq = vi.fn((field: string, val: any) => {
            if (field === "customer_id" && val === "c1") {
              return chain({ data: custOrders, error: null });
            }
            return mockSub;
          });
          return mockSub;
        });
        return { updateMock, rpcMock };
      }

      it("calculates high return rate risk score (>= 0.5) → 35 (T5)", async () => {
        // 2 returned / 3 total = 0.667 >= 0.5 → +35
        // cancelled=0 → +0; delivered=1 (not 0, not >=3); total<5
        // Expected: 35
        const custOrders = [
          { status: "returned", total_price: 100 },
          { status: "returned", total_price: 100 },
          { status: "delivered", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 35 });
      });

      it("calculates medium return rate risk score (>= 0.25) → 10 (T5)", async () => {
        // 1 returned / 4 total = 0.25 >= 0.25 → +20
        // cancelled=0 → +0; delivered=3 >=3 → -10
        // Expected: 20 - 10 = 10
        const custOrders = [
          { status: "returned", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 10 });
      });

      it("calculates low return rate risk score (> 0 but < 0.25) → 0 (clamped) (T5)", async () => {
        // 1 returned / 5 total = 0.2 < 0.25 but returned>0 → +8
        // cancelled=0 → +0; delivered=4 >=3 → -10
        // 8 - 10 = -2 → clamped to 0
        const custOrders = [
          { status: "returned", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 0 });
      });

      it("calculates risk score for cancelled rate >= 0.4 → 20 (T5)", async () => {
        // returned=0 → +0; 2 cancelled / 3 total = 0.667 >= 0.4 → +20
        // delivered=1 (not 0, not >=3); total<5
        // Expected: 20
        const custOrders = [
          { status: "cancelled", total_price: 100 },
          { status: "cancelled", total_price: 100 },
          { status: "delivered", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "cancelled");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 20 });
      });

      it("calculates risk score for cancelled rate < 0.4 but > 0 → 0 (clamped) (T5)", async () => {
        // returned=0 → +0; 1 cancelled / 4 total = 0.25 < 0.4 but >0 → +10
        // delivered=3 >=3 → -10
        // 10 - 10 = 0
        const custOrders = [
          { status: "cancelled", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "cancelled");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 0 });
      });

      it("calculates risk score when total >= 2 and delivered === 0 → 55 (T5)", async () => {
        // 2 returned / 2 total = 1.0 >= 0.5 → +35
        // cancelled=0 → +0; total>=2 && delivered==0 → +20
        // Expected: 35 + 20 = 55
        const custOrders = [
          { status: "returned", total_price: 100 },
          { status: "returned", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 55 });
      });

      it("decreases risk score when delivered >= 3 → 10 (T5)", async () => {
        // 1 returned / 4 total = 0.25 >= 0.25 → +20
        // cancelled=0 → +0; delivered=3 >=3 → -10
        // 20 - 10 = 10
        const custOrders = [
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "returned", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 10 });
      });

      it("decreases risk score when total >= 5 and return rate < 0.1 → 0 (clamped) (T5)", async () => {
        // returned=0 → +0; 1 cancelled / 5 total = 0.2 < 0.4 but >0 → +10
        // delivered=4 >=3 → -10; total>=5 && returnRate<0.1 (0 < 0.1) → -10
        // 10 - 10 - 10 = -10 → clamped to 0
        const custOrders = [
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "delivered", total_price: 100 },
          { status: "cancelled", total_price: 100 },
        ];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "cancelled");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 0 });
      });

      it("calculates risk score when customer has 0 orders → 0 (T5)", async () => {
        // total=0, returned=0, returnRate=0 → +0
        // cancelled=0 → +0; total<2; delivered<3; total<5
        // Expected: 0
        const custOrders: any[] = [];
        const { updateMock } = buildRiskScoreMock(custOrders);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).toHaveBeenCalledWith({ risk_score: 0 });
      });

      it("does not update risk score when custOrders is null (T5)", async () => {
        // When custOrders is null, the `if (custOrders)` guard skips the entire block.
        // No update call should be made.
        const { updateMock } = buildRiskScoreMock(null);

        await updateOrderStatus("o1", "returned");

        expect(updateMock).not.toHaveBeenCalled();
      });

      it("logs error and does not throw when customer orders fetch fails", async () => {
        const client = chain({ data: orderData, error: null });
        client.rpc = vi.fn().mockResolvedValue({ error: null });

        vi.mocked(getSupabase).mockImplementation(() => {
          const mockSub = chain({ data: orderData, error: null });
          mockSub.rpc = client.rpc;
          mockSub.eq = vi.fn((field, val) => {
            if (field === "customer_id" && val === "c1") {
              throw new Error("DB Error");
            }
            return mockSub;
          });
          return mockSub;
        });

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const result = await updateOrderStatus("o1", "returned");
        expect(result).toEqual(orderData);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("customer_risk_score_update_error"));
        logSpy.mockRestore();
      });
    });
  });
});
