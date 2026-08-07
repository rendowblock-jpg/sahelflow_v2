/**
 * Delivery service — shipment management.
 *
 * The actual delivery adapters (Yalidine, ZR Express, Maystro) will be
 * rebuilt fresh in Phase 0 item #16. For now, this service manages the
 * Delivery records in the DB (status tracking, cost, tracking number).
 *
 * Adapter integration (createShipment API calls) comes later.
 */
import type { Prisma } from "@prisma/client";
import type { Delivery, DeliveryStatus } from "@/types/domain";
import { NotFoundError } from "@/types/errors";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomain(row: Record<string, unknown>): Delivery {
  return row as unknown as Delivery;
}

export const deliveryService = {
  async list(ctx: ServiceContext, opts?: {
    limit?: number;
    offset?: number;
    status?: DeliveryStatus | readonly DeliveryStatus[];
    include?: Prisma.DeliveryInclude;
  }): Promise<Delivery[]> {
    const statusFilter =
      typeof opts?.status === "string"
        ? { status: opts.status }
        : opts?.status
          ? { status: { in: [...opts.status] } }
          : {};
    const rows = await ctx.prisma.delivery.findMany({
      where: { ...statusFilter, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
      ...(opts?.include ? { include: opts.include } : {}),
    });
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },

  async getById(ctx: ServiceContext, id: string): Promise<Delivery> {
    return withServiceError(async () => {
      const row = await ctx.prisma.delivery.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundError("Delivery", id);
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Delivery");
  },

  async getByOrderId(ctx: ServiceContext, orderId: string): Promise<Delivery | null> {
    const row = await ctx.prisma.delivery.findFirst({ where: { orderId, deletedAt: null } });
    return row ? toDomain(row as unknown as Record<string, unknown>) : null;
  },

  // (Phase 5) `create` + `updateStatus` removed — they were only ever called
  // from delivery-service.test.ts. Production write paths go through:
  //   - POST /api/delivery/create    (delivery.upsert + order state machine)
  //   - POST /api/delivery/sync      (delivery.update + order state machine)
  //   - PATCH /api/delivery/[id]     (delivery.update + orderService.updateStatus)
  // Each route inlines the write logic in its own $transaction so it can
  // keep the delivery update + order transition atomic. Centralizing the
  // writes back into the service would either (a) split the tx or (b) force
  // every caller to pass a tx handle — neither pays for itself given that
  // the routes are the only callers.

  /** List deliveries with active (non-terminal) status. */
  async listActive(ctx: ServiceContext): Promise<Delivery[]> {
    const rows = await ctx.prisma.delivery.findMany({
      where: {
        status: { in: ["pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery"] },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toDomain(r as unknown as Record<string, unknown>));
  },
};
