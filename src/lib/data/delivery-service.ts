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
import { createDeliverySchema } from "@/lib/validation";
import type { ServiceContext } from "./service-base";
import { withServiceError } from "./service-base";

function toDomain(row: Record<string, unknown>): Delivery {
  return row as unknown as Delivery;
}

export const deliveryService = {
  async list(ctx: ServiceContext, opts?: {
    limit?: number;
    offset?: number;
    status?: DeliveryStatus;
    include?: Prisma.DeliveryInclude;
  }): Promise<Delivery[]> {
    const rows = await ctx.prisma.delivery.findMany({
      where: opts?.status ? { status: opts.status, deletedAt: null } : { deletedAt: null },
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

  /**
   * Create a delivery record (without calling the adapter yet).
   * The adapter integration (createShipment) is Phase 0 item #16.
   */
  async create(ctx: ServiceContext, input: unknown): Promise<Delivery> {
    return withServiceError(async () => {
      const data = createDeliverySchema.parse(input);

      // Verify order exists
      const order = await ctx.prisma.order.findFirst({ where: { id: data.orderId, deletedAt: null } });
      if (!order) throw new NotFoundError("Order", data.orderId);

      // Check no existing delivery for this order
      const existing = await ctx.prisma.delivery.findFirst({ where: { orderId: data.orderId, deletedAt: null } });
      if (existing) {
        return toDomain(existing as unknown as Record<string, unknown>);
      }

      const row = await ctx.prisma.delivery.create({
        data: {
          orderId: data.orderId,
          provider: data.provider,
          status: "pending",
        },
      });
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Delivery");
  },

  async updateStatus(
    ctx: ServiceContext,
    id: string,
    status: DeliveryStatus,
    trackingNumber?: string,
  ): Promise<Delivery> {
    return withServiceError(async () => {
      const row = await ctx.prisma.delivery.update({
        where: { id },
        data: {
          status,
          ...(trackingNumber ? { trackingNumber } : {}),
        },
      });
      return toDomain(row as unknown as Record<string, unknown>);
    }, "Delivery");
  },

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
