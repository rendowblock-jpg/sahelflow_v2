import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { isSellerTypedOrderAuthority } from "@/lib/orders/manual-order-authority";
import {
  resolveCatalogLine,
  type CatalogLine,
} from "@/lib/orders/manual-order-catalog-line";
import { redactPii } from "@/lib/redact-pii";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";

/**
 * order.manual.editLines.v1 (S03a-03B): correct the LINES of a pending order the
 * seller typed in himself. Before this command a wrong product, quantity or price on
 * such an order could only be fixed by rejecting it and typing it again.
 *
 * Why it is safe for this kind of order and no other: a pending manual order holds no
 * stock (inventoryState "unreserved", no reservation, no inventory movement); the
 * confirmation that follows reads the lines as they are then and reserves exactly
 * those. A hosted-storefront order is different: its stock is delegated at the
 * storefront and the receipt is bound to its lines, so it answers a coded 409.
 * Imported and legacy orders answer the same 409 until their own paths are read.
 *
 * The new list REPLACES the old one:
 *  - a line with `id` is an existing line; only its quantity and, if given, its unit
 *    price change (its product cannot, and a price not given stays as it was written:
 *    the catalog price is NOT applied again, so an edit never re-prices what it was
 *    not asked to);
 *  - a line with `productId` (and the exact variant when the product has variants)
 *    is a new line, named and priced from the catalog unless a price is given;
 *  - an existing line left out of the list is removed; at least one line must remain.
 * The total is recomputed from the lines plus the stored delivery fee.
 *
 * Concurrency: version-checked against Order.version and bumps it, like
 * order.manual.edit.v1, so a confirmation opened on the old screen fails with a
 * version conflict. The kernel claims one aggregate per (order, version).
 */

const MAX_ORDER_TOTAL = 2_147_483_647; // Order.totalPrice is a 32-bit Int

export const manualOrderLinesEditSchema = z
  .object({
    orderId: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    lines: z
      .array(
        z
          .object({
            id: z.string().min(1).optional(),
            productId: z.string().min(1).optional(),
            productVariantId: z.string().min(1).nullable().optional(),
            quantity: z.number().int().min(1).max(100_000),
            unitPrice: z.number().int().nonnegative().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export type ManualOrderLinesEditInput = z.infer<typeof manualOrderLinesEditSchema>;

export interface ManualOrderLinesEditResult {
  orderId: string;
  orderNumber: string;
  status: string;
  version: number;
  itemsTotal: number;
  deliveryCost: number;
  totalPrice: number;
  /** Lines created, lines removed, existing lines whose quantity or price changed. */
  added: number;
  removed: number;
  changed: number;
}

type StoredLine = {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  quantity: number;
  unitPrice: number;
};

function lineKey(productId: string | null, variantId: string | null, rowId: string): string {
  // A line whose product was deleted keeps its own identity: it can never collide.
  return `${productId ?? `row:${rowId}`}\u0000${variantId ?? ""}`;
}

export async function executeManualOrderLinesEdit(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<ManualOrderLinesEditResult>> {
  const data = manualOrderLinesEditSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  // Shape rules that need no database.
  const idsSeen = new Set<string>();
  for (const line of data.lines) {
    if (line.id) {
      if (line.productId !== undefined || line.productVariantId !== undefined) {
        throw new ValidationError(
          "A line names either an existing line (id) or a product to add, not both",
          "lines",
        );
      }
      if (idsSeen.has(line.id)) {
        throw new ValidationError("A line cannot appear more than once", "lines.id");
      }
      idsSeen.add(line.id);
    } else if (!line.productId) {
      throw new ValidationError("Each line needs a line id or a product", "lines");
    }
  }

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.manual.editLines.v1",
      aggregate: {
        type: "manual-order-lines-edit",
        id: `${data.orderId}:v${data.expectedVersion}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: {
        orderId: data.orderId,
        expectedVersion: data.expectedVersion,
        lines: data.lines,
      },
    },
    async ({ tx, commandId, aggregateVersion, principal }) => {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, deletedAt: null },
        include: { items: true },
      });
      if (!order) throw new NotFoundError("Order", data.orderId);
      if (!isSellerTypedOrderAuthority(order.source, order.sourceMetadata)) {
        throw new SahelFlowError(
          "The lines of this order cannot be edited here: only an order typed in by the seller can",
          "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE",
          409,
        );
      }
      if (order.status !== "pending") {
        throw new ConflictError(
          `Order edit requires pending status; current status is '${order.status}'`,
        );
      }
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (order.inventoryState !== null && order.inventoryState !== "unreserved") {
        throw new ConflictError(
          `Order ${order.id} already holds stock (${order.inventoryState}); its lines cannot be edited`,
        );
      }

      const stored = new Map<string, StoredLine>(
        order.items.map((row) => [
          row.id,
          {
            id: row.id,
            productId: row.productId,
            productVariantId: row.productVariantId,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
          },
        ]),
      );

      // New lines come from the catalog, exactly as order.manual.create.v1 reads it.
      const newProductIds = [
        ...new Set(
          data.lines.filter((line) => !line.id).map((line) => line.productId as string),
        ),
      ];
      const products = newProductIds.length
        ? await tx.product.findMany({
            where: { id: { in: newProductIds }, isActive: true, deletedAt: null },
            include: { productVariants: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
          })
        : [];
      const productById = new Map(products.map((product) => [product.id, product]));

      const updates: Array<{ id: string; quantity: number; unitPrice: number }> = [];
      const creates: CatalogLine[] = [];
      const keptIds = new Set<string>();
      const keys = new Set<string>();
      let unchanged = 0;

      for (const line of data.lines) {
        let key: string;
        if (line.id) {
          const row = stored.get(line.id);
          if (!row) {
            throw new ValidationError(
              `Line ${line.id} does not belong to this order`,
              "lines.id",
            );
          }
          keptIds.add(row.id);
          const unitPrice = line.unitPrice ?? row.unitPrice;
          if (line.quantity === row.quantity && unitPrice === row.unitPrice) {
            unchanged += 1;
          } else {
            updates.push({ id: row.id, quantity: line.quantity, unitPrice });
          }
          key = lineKey(row.productId, row.productVariantId, row.id);
        } else {
          const product = productById.get(line.productId as string);
          if (!product) throw new NotFoundError("Product", line.productId as string);
          const resolved = resolveCatalogLine(product, {
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          });
          creates.push({
            ...resolved,
            unitPrice: line.unitPrice ?? resolved.unitPrice,
          });
          key = lineKey(resolved.productId, resolved.productVariantId, "");
        }
        if (keys.has(key)) {
          throw new ValidationError(
            "The same product and variant cannot be on the order more than once",
            "lines",
          );
        }
        keys.add(key);
      }

      const removedRows = order.items.filter((row) => !keptIds.has(row.id));
      if (updates.length === 0 && creates.length === 0 && removedRows.length === 0) {
        throw new ValidationError("Nothing to change", "order.lines");
      }

      const finalLines = [
        ...order.items
          .filter((row) => keptIds.has(row.id))
          .map((row) => {
            const update = updates.find((candidate) => candidate.id === row.id);
            return {
              quantity: update?.quantity ?? row.quantity,
              unitPrice: update?.unitPrice ?? row.unitPrice,
            };
          }),
        ...creates,
      ];
      const itemsTotal = finalLines.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0,
      );
      const deliveryCost = order.deliveryCost ?? 0;
      const totalPrice = itemsTotal + deliveryCost;
      if (!Number.isSafeInteger(totalPrice) || totalPrice > MAX_ORDER_TOTAL) {
        throw new ValidationError("The order total is too large", "lines");
      }
      const orderVersion = data.expectedVersion + 1;

      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "pending",
          version: data.expectedVersion,
          deletedAt: null,
        },
        data: { totalPrice, version: orderVersion },
      });
      if (claimed.count !== 1) {
        throw new ConflictError(
          `Order ${order.id} changed while the lines edit command was running`,
        );
      }

      if (removedRows.length > 0) {
        await tx.orderItem.deleteMany({
          where: { orderId: order.id, id: { in: removedRows.map((row) => row.id) } },
        });
      }
      for (const update of updates) {
        await tx.orderItem.update({
          where: { id: update.id },
          data: {
            quantity: update.quantity,
            unitPrice: update.unitPrice,
            total: update.quantity * update.unitPrice,
          },
        });
      }
      for (const line of creates) {
        await tx.orderItem.create({
          data: { ...line, orderId: order.id, total: line.unitPrice * line.quantity },
        });
      }

      const counts = {
        added: creates.length,
        removed: removedRows.length,
        changed: updates.length,
      };
      const itemCountFrom = order.items.length;
      const itemCountTo = finalLines.length;

      // Counts and totals only: the ledger must not carry product names.
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: "confirmed",
          actionType: "edit",
          actor: principal.auditActor,
          payload: JSON.stringify(
            redactPii({
              linesEdited: true,
              ...counts,
              itemCountFrom,
              itemCountTo,
              totalFrom: order.totalPrice,
              totalTo: totalPrice,
              commandId,
              editVersion: aggregateVersion,
              orderVersion,
              authority: "manual-lines-edit-v1",
            }),
          ),
        },
      });

      const result: ManualOrderLinesEditResult = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        version: orderVersion,
        itemsTotal,
        deliveryCost,
        totalPrice,
        ...counts,
      };

      return {
        result,
        audit: {
          action: "order.manual.lines.edited.v1",
          entity: "order",
          entityId: order.id,
          before: {
            status: order.status,
            version: order.version,
            itemCount: itemCountFrom,
            totalPrice: order.totalPrice,
          },
          after: {
            status: order.status,
            version: orderVersion,
            itemCount: itemCountTo,
            totalPrice,
            ...counts,
          },
          metadata: { authority: "manual-lines-edit-v1", unchangedLines: unchanged },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.manual.lines.edited.v1",
            payload: {
              orderId: order.id,
              orderNumber: order.orderNumber,
              orderVersion,
              editVersion: aggregateVersion,
              totalPrice,
              ...counts,
            },
          },
        ],
        projectionInvalidations: [
          "orders:list",
          `orders:${order.id}`,
          "dashboard:orders",
        ],
      };
    },
  );
}
