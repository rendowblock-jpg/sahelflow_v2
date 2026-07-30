import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import { nextOrderNumber } from "@/lib/data/service-base";
import { normalizePhone } from "@/lib/import/fields";
import {
  CANONICAL_ORDER_SOURCES,
  canonicalSourceOrderSourceMetadata,
  type CanonicalOrderSource,
} from "@/lib/orders/manual-order-authority";
import type { Order } from "@/types/domain";
import { NotFoundError, ValidationError } from "@/types/errors";

const sourceSchema = z.enum(CANONICAL_ORDER_SOURCES);

const sourceOrderItemSchema = z.object({
  productId: z.string().min(1),
  productVariantId: z.string().min(1).nullable().optional(),
  quantity: z.number().int().positive().max(999),
});

const newCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  wilaya: z.string().trim().min(1).max(120),
  commune: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
});

export const canonicalSourceOrderSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    source: sourceSchema,
    sourceIdentity: z.string().trim().min(1).max(200),
    sourceOrderId: z.string().trim().min(1).max(200),
    customerId: z.string().min(1).optional(),
    newCustomer: newCustomerSchema.optional(),
    items: z.array(sourceOrderItemSchema).min(1).max(200),
    wilaya: z.string().trim().min(1).max(120),
    commune: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(500),
    phone: z.string().trim().min(1).max(40),
    deliveryCost: z.number().int().nonnegative().default(0),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.customerId) === Boolean(value.newCustomer)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Provide exactly one of customerId or newCustomer",
      });
    }
  });

export type CanonicalSourceOrderInput = z.infer<typeof canonicalSourceOrderSchema>;

export interface CanonicalSourceOrderResult {
  order: Order;
  customerCreated: boolean;
  source: CanonicalOrderSource;
  sourceOrderId: string;
  automation: {
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    totalPrice: number;
    wilaya: string;
  };
}

function canonicalAlgerianPhone(value: string, field: string): string {
  const normalized = normalizePhone(value);
  if (!/^0[5-7]\d{8}$/.test(normalized)) {
    throw new ValidationError(
      "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)",
      field,
    );
  }
  return normalized;
}

export async function createCanonicalSourceOrder(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalSourceOrderResult>> {
  const data = canonicalSourceOrderSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();
  const aggregateId = `${data.source}:${data.sourceIdentity}:${data.sourceOrderId}`;
  const orderPhone = canonicalAlgerianPhone(data.phone, "phone");
  const normalizedNewCustomer = data.newCustomer
    ? {
        ...data.newCustomer,
        phone: canonicalAlgerianPhone(
          data.newCustomer.phone,
          "newCustomer.phone",
        ),
      }
    : undefined;

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.source.create.v1",
      aggregate: {
        type: "source-order-intake",
        id: aggregateId,
        expectedVersion: 0,
      },
      actor: "source",
      correlationId,
      payload: {
        source: data.source,
        sourceIdentity: data.sourceIdentity,
        sourceOrderId: data.sourceOrderId,
        customerId: data.customerId ?? null,
        newCustomer: normalizedNewCustomer ?? null,
        items: data.items,
        wilaya: data.wilaya,
        commune: data.commune,
        address: data.address,
        phone: orderPhone,
        deliveryCost: data.deliveryCost,
        notes: data.notes ?? null,
      },
    },
    async ({ tx, commandId, principal }) => {
      let customerCreated = false;
      let customer;

      if (data.customerId) {
        customer = await tx.customer.findFirst({
          where: { id: data.customerId, deletedAt: null },
        });
        if (!customer) throw new NotFoundError("Customer", data.customerId);
      } else {
        const requested = normalizedNewCustomer;
        if (!requested) {
          throw new ValidationError("New customer authority is missing", "newCustomer");
        }
        customer = await tx.customer.findUnique({ where: { phone: requested.phone } });
        if (customer) {
          customer = await tx.customer.update({
            where: { id: customer.id },
            data: {
              deletedAt: null,
              name: requested.name,
              wilaya: requested.wilaya,
              commune: requested.commune ?? null,
              address: requested.address ?? null,
            },
          });
        } else {
          customer = await tx.customer.create({
            data: {
              name: requested.name,
              phone: requested.phone,
              wilaya: requested.wilaya,
              commune: requested.commune ?? null,
              address: requested.address ?? null,
            },
          });
          customerCreated = true;
        }
      }

      const productIds = [...new Set(data.items.map((item) => item.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, isActive: true, deletedAt: null },
        include: {
          productVariants: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        },
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      const canonicalItems = data.items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) throw new NotFoundError("Product", item.productId);

        const allVariants = product.productVariants;
        const activeVariants = allVariants.filter((variant) => variant.isActive);
        if (allVariants.length > 0 && activeVariants.length === 0) {
          throw new ValidationError(
            `Product '${product.name}' has variants but none are active`,
            "items.productVariantId",
          );
        }

        if (activeVariants.length > 0) {
          const variant = item.productVariantId
            ? activeVariants.find((candidate) => candidate.id === item.productVariantId)
            : undefined;
          if (!variant) {
            throw new ValidationError(
              `Product '${product.name}' requires one exact active variant`,
              "items.productVariantId",
            );
          }
          return {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            productVariantName: variant.name,
            quantity: item.quantity,
            unitPrice: variant.price ?? product.price,
          };
        }

        if (item.productVariantId) {
          throw new ValidationError(
            `Product '${product.name}' has no variants`,
            "items.productVariantId",
          );
        }
        return {
          productId: product.id,
          productVariantId: null,
          productName: product.name,
          productVariantName: null,
          quantity: item.quantity,
          unitPrice: product.price,
        };
      });

      const itemsTotal = canonicalItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const totalPrice = itemsTotal + data.deliveryCost;
      const orderNumber = await nextOrderNumber(
        tx as unknown as BusinessPrincipalContext["prisma"],
        "ORD",
      );
      const sourceMetadata = canonicalSourceOrderSourceMetadata({
        source: data.source,
        sourceIdentity: data.sourceIdentity,
        sourceOrderId: data.sourceOrderId,
      });

      const order = await tx.order.create({
        data: {
          orderNumber,
          status: "pending",
          version: 1,
          fulfillmentState: "unfulfilled",
          deliveryState: "not_created",
          inventoryState: "unreserved",
          codState: "not_expected",
          customerId: customer.id,
          totalPrice,
          deliveryCost: data.deliveryCost,
          wilaya: data.wilaya,
          commune: data.commune,
          address: data.address,
          phone: orderPhone,
          source: data.source,
          sourceOrderId: data.sourceOrderId,
          sourceMetadata,
          notes: data.notes ?? null,
          items: {
            create: canonicalItems.map((item) => ({
              ...item,
              total: item.unitPrice * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      await recordOrderChangeInTx(tx, {
        orderId: order.id,
        actionType: "created",
        payload: {
          orderNumber,
          status: "pending",
          itemCount: canonicalItems.length,
          totalPrice,
          commandId,
          authority: "canonical-source-v1",
          source: data.source,
          sourceIdentity: data.sourceIdentity,
          sourceOrderId: data.sourceOrderId,
        },
      });

      const result: CanonicalSourceOrderResult = {
        order: order as unknown as Order,
        customerCreated,
        source: data.source,
        sourceOrderId: data.sourceOrderId,
        automation: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          customerName: customer.name,
          customerPhone: order.phone,
          totalPrice: order.totalPrice,
          wilaya: order.wilaya,
        },
      };
      const eventPayload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: order.status,
        version: order.version,
        totalPrice: order.totalPrice,
        source: data.source,
        sourceIdentity: data.sourceIdentity,
        sourceOrderId: data.sourceOrderId,
      };

      return {
        result,
        audit: {
          action: "order.source.created.v1",
          entity: "order",
          entityId: order.id,
          before: null,
          after: {
            orderNumber: order.orderNumber,
            status: order.status,
            version: order.version,
            customerId: order.customerId,
            totalPrice: order.totalPrice,
            itemCount: order.items.length,
            source: data.source,
          },
          metadata: {
            authority: "canonical-source-v1",
            customerCreated,
            sourceIdentity: data.sourceIdentity,
            sourceOrderId: data.sourceOrderId,
            principal: principal.auditActor,
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "order.source.created.v1",
            payload: eventPayload,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:order-created`,
            effectType: "order.source.created.v1",
            payload: eventPayload,
          },
        ],
        projectionInvalidations: [
          "orders:list",
          `orders:${order.id}`,
          "dashboard:orders",
          "customers:list",
          `customers:${customer.id}`,
        ],
      };
    },
  );
}
