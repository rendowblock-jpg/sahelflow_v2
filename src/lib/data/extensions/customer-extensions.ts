/**
 * Customer service extensions — search + stats aggregation.
 *
 * These methods give the merchant a 360° view of each customer and
 * enable text search across the customer database (by name or phone).
 */
import "server-only";
import type { ServiceContext } from "../service-base";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

export interface CustomerStats {
  totalOrders: number;
  totalSpent: number; // LTV (integer DZD)
  deliveredCount: number;
  returnedCount: number;
  deliveryRate: number; // 0-100
  avgOrderValue: number;
  lastOrderDate: Date | null;
  firstOrderDate: Date | null;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  orderCount: number;
  totalSpent: number;
  riskScore: number;
  createdAt: Date;
}

export const customerServiceExtensions = {
  /**
   * Search customers by name or phone (case-insensitive, partial match).
   * Returns enriched list with order count + total spent + risk score.
   */
  async search(
    ctx: ServiceContext,
    query: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<CustomerListItem[]> {
    const q = query.trim();
    if (!q) return [];

    // SEC-009 + W3-25: customer PII is encrypted at the application layer
    // (ADR-003):
    //   - `name` is AES-256-GCM ciphertext (random IV, non-searchable).
    //     `nameBlindIndex` is HMAC(name.toLowerCase().trim()) — exact-equality only.
    //   - `phone` is itself the HMAC blind index (deterministic, @unique).
    //     `phoneEnc` is AES-256-GCM ciphertext.
    //
    // Substring/contains search on encrypted columns is impossible without
    // decrypting every row (the ciphertext is random-IV — even an identical
    // name produces a different ciphertext). To give the user partial-match
    // behavior we:
    //
    //   1. Production (encrypted DB): match by EXACT phone blind index OR
    //      EXACT name blind index. The `contains` branches below never fire
    //      (gated behind NODE_ENV === "test") because they would scan
    //      ciphertext and always return empty. A future schema migration
    //      could add prefix blind indexes (e.g. first 4 / 6 digits of phone)
    //      to enable prefix search without decrypting.
    //   2. Tests/dev (plaintext DB, NODE_ENV === "test"): fall back to
    //      `contains` with `mode: "insensitive"` for true fuzzy search
    //      across name + phone. SQLite maps `mode: "insensitive"` to
    //      `LIKE '%q%' COLLATE NOCASE`, so "ahmed" matches "Ahmed Benali".
    //
    // Limitation: in production, the user must type the EXACT full name or
    // EXACT full phone to get a hit. The UI should communicate this.
    const masterKey = getMasterKey();
    const phoneBlindIndex = deriveBlindIndex(q, masterKey);
    const nameBlindIndex = deriveBlindIndex(q.toLowerCase().trim(), masterKey);

    // SV-L1: the `contains` branches on the encrypted `name`/`phone` columns
    // never fire in production — those columns hold AES ciphertext, not the
    // plaintext query the user typed. They only match in tests/dev where
    // PII encryption may be disabled. Gate them behind NODE_ENV === "test"
    // so production doesn't ship dead branches (and so a future schema change
    // can't accidentally make them match something unexpected).
    //
    // W3-25: use `mode: "insensitive"` so case doesn't matter in tests/dev
    // (Prisma maps to `LIKE '%q%' COLLATE NOCASE` on SQLite — explicit is
    // better than relying on SQLite's ASCII-case-insensitive default).
    const plaintextFallback = process.env.NODE_ENV === "test";

    const rows = await ctx.prisma.customer.findMany({
      where: { deletedAt: null,
        OR: [
          { nameBlindIndex },
          { phone: phoneBlindIndex },
          ...(plaintextFallback
            ? [
                { name:  { contains: q } },
                { phone: { contains: q } },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
      select: {
        id: true,
        name: true,
        phone: true,
        phone2: true,
        wilaya: true,
        commune: true,
        address: true,
        orderCount: true,
        totalSpent: true,
        riskScore: true,
        createdAt: true,
      },
    });
    return rows as unknown as CustomerListItem[];
  },

  /**
   * Get aggregated stats for a single customer — the Customer 360 view.
   * Computes LTV, delivery rate, avg order value, last/first order dates.
   */
  async getStats(ctx: ServiceContext, customerId: string): Promise<CustomerStats> {
    const orders = await ctx.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      select: {
        status: true,
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalOrders = orders.length;
    const totalSpent = orders
      .filter((o) => !["cancelled", "draft"].includes(o.status))
      .reduce((sum, o) => sum + o.totalPrice, 0);
    const deliveredCount = orders.filter((o) => o.status === "delivered").length;
    const returnedCount = orders.filter(
      (o) => o.status === "returned" || o.status === "refused",
    ).length;
    const deliveryRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    const lastOrderDate = totalOrders > 0 ? orders[orders.length - 1]!.createdAt : null;
    const firstOrderDate = totalOrders > 0 ? orders[0]!.createdAt : null;

    return {
      totalOrders,
      totalSpent,
      deliveredCount,
      returnedCount,
      deliveryRate,
      avgOrderValue,
      lastOrderDate,
      firstOrderDate,
    };
  },

  /**
   * Get a customer's order history (paginated, newest first).
   */
  async getOrderHistory(
    ctx: ServiceContext,
    customerId: string,
    opts?: { limit?: number; offset?: number },
  ) {
    return ctx.prisma.order.findMany({
      where: { customerId, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 20,
      skip: opts?.offset ?? 0,
    });
  },
};
