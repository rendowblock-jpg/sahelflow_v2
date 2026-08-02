import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CodFinancialState,
  CompensationFact,
  FinancialMovementFact,
  InventoryMovementFact,
  RefundLifecycleState,
  ReturnLifecycleState,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { recordOrderChangeInTx } from "@/lib/data/order-change-service";
import { nextOrderNumber } from "@/lib/data/service-base";
import {
  appendCanonicalReturnEvent,
  assertDeliveredReturnAuthority,
  canonicalReturnCaseForOrder,
  loadCanonicalReturnOrder,
  returnProjectionKeys,
  setCanonicalReturnCaseState,
  updateCanonicalReturnProjection,
  type CanonicalReturnCaseAuthority,
  type CanonicalReturnOrder,
  type CanonicalReturnOrderItem,
} from "@/lib/orders/canonical-return-authority";
import { TRUSTED_MANUAL_ORDER_AUTHORITY } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const idempotencyKeySchema = z.string().trim().min(8).max(200);
const correlationIdSchema = z.string().trim().min(1).max(200).optional();
const expectedVersionSchema = z.number().int().positive().safe();
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i)
  .transform((value) => value.toLowerCase());
const occurredAtSchema = z.coerce.date();

const requestedItemSchema = z.object({
  orderItemId: z.string().trim().min(1),
  quantity: z.number().int().positive().safe(),
});

const exchangeItemSchema = z.object({
  productId: z.string().trim().min(1),
  productVariantId: z.string().trim().min(1).nullable().optional(),
  quantity: z.number().int().positive().safe(),
});

const inspectionItemSchema = z.object({
  orderItemId: z.string().trim().min(1),
  quantity: z.number().int().positive().safe(),
  disposition: z.enum(["available", "damaged", "quarantine", "lost"]),
});

export const canonicalCustomerReturnRequestSchema = z
  .object({
    orderId: z.string().trim().min(1),
    expectedVersion: expectedVersionSchema,
    caseType: z.enum(["return", "exchange"]),
    reasonCode: reasonCodeSchema,
    items: z.array(requestedItemSchema).min(1).max(500),
    exchangeItems: z.array(exchangeItemSchema).min(1).max(500).optional(),
    exchangeDeliveryCost: z.number().int().nonnegative().safe().default(0),
    occurredAt: occurredAtSchema,
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    const orderItemIds = new Set<string>();
    input.items.forEach((item, index) => {
      if (orderItemIds.has(item.orderItemId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "orderItemId"],
          message: "A return request can include an order item only once",
        });
      }
      orderItemIds.add(item.orderItemId);
    });

    if (input.caseType === "exchange" && !input.exchangeItems?.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exchangeItems"],
        message: "Exchange requests require replacement catalog items",
      });
    }
    if (input.caseType === "return" && input.exchangeItems !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exchangeItems"],
        message: "Return requests cannot contain replacement items",
      });
    }
    if (input.caseType === "return" && input.exchangeDeliveryCost !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exchangeDeliveryCost"],
        message: "Return requests cannot contain an exchange delivery charge",
      });
    }
  });

export const canonicalCustomerReturnTransitionSchema = z
  .object({
    orderId: z.string().trim().min(1),
    returnId: z.string().trim().min(1),
    action: z.enum([
      "approve",
      "reject",
      "cancel",
      "mark_in_transit",
      "receive",
      "inspect",
      "complete",
    ]),
    expectedVersion: expectedVersionSchema,
    reasonCode: reasonCodeSchema,
    occurredAt: occurredAtSchema,
    items: z.array(inspectionItemSchema).max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    if (input.action === "inspect" && (!input.items || input.items.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Return inspection requires every requested item",
      });
    }
    if (input.action !== "inspect" && input.items !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Inspection items are accepted only by the inspect action",
      });
    }
  });

export type CanonicalCustomerReturnRequestInput = z.infer<
  typeof canonicalCustomerReturnRequestSchema
>;
export type CanonicalCustomerReturnTransitionInput = z.infer<
  typeof canonicalCustomerReturnTransitionSchema
>;
export type CanonicalCustomerReturnAction =
  CanonicalCustomerReturnTransitionInput["action"];
export type CanonicalCustomerReturnDisposition = z.infer<
  typeof inspectionItemSchema
>["disposition"];

interface RequestedReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  productVariantId: string | null;
  quantity: number;
}

interface ReplacementSnapshot {
  productId: string;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
}

export interface CanonicalCustomerReturnResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  returnId: string;
  caseType: "return" | "exchange";
  returnState: ReturnLifecycleState;
  status: string;
  inventoryState: string;
  fullOrderReturn: boolean;
  replacementOrderId: string | null;
  availableQuantity: number;
  damagedQuantity: number;
  quarantineQuantity: number;
  lostQuantity: number;
  recordedLossAmount: number;
}

function currentCodState(order: CanonicalReturnOrder): CodFinancialState {
  if (!order.codState || order.codState === "not_expected") {
    throw new ConflictError("Delivered order has no canonical COD state");
  }
  return order.codState as CodFinancialState;
}

function currentRefundState(order: CanonicalReturnOrder): RefundLifecycleState {
  return (order.refundState ?? "none") as RefundLifecycleState;
}

function exactRequestedItems(
  requested: readonly z.infer<typeof requestedItemSchema>[],
  orderItems: readonly CanonicalReturnOrderItem[],
): Array<{
  orderItem: CanonicalReturnOrderItem;
  quantity: number;
}> {
  const orderById = new Map(orderItems.map((item) => [item.id, item]));
  const result: Array<{
    orderItem: CanonicalReturnOrderItem;
    quantity: number;
  }> = [];
  for (const item of requested) {
    const orderItem = orderById.get(item.orderItemId);
    if (!orderItem) {
      throw new ValidationError(
        `Return item '${item.orderItemId}' does not belong to the order`,
        "items.orderItemId",
      );
    }
    if (!orderItem.productId) {
      throw new ValidationError(
        `Order item '${orderItem.id}' has no product identity`,
        "items.productId",
      );
    }
    if (item.quantity > orderItem.quantity) {
      throw new ValidationError(
        `Return quantity exceeds purchased quantity for order item '${orderItem.id}'`,
        "items.quantity",
      );
    }
    result.push({ orderItem, quantity: item.quantity });
  }
  return result;
}

function isFullOrderReturn(
  requested: readonly RequestedReturnItem[],
  orderItems: readonly CanonicalReturnOrderItem[],
): boolean {
  if (requested.length !== orderItems.length) return false;
  const byItem = new Map(requested.map((item) => [item.orderItemId, item]));
  return orderItems.every(
    (item) => byItem.get(item.id)?.quantity === item.quantity,
  );
}

async function priceReplacementItems(
  tx: Parameters<Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]>[0],
  requested: readonly z.infer<typeof exchangeItemSchema>[],
): Promise<ReplacementSnapshot[]> {
  const productIds = [...new Set(requested.map((item) => item.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, isActive: true, deletedAt: null },
    include: {
      productVariants: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return requested.map((item) => {
    const product = byId.get(item.productId);
    if (!product) throw new NotFoundError("Product", item.productId);
    const activeVariants = product.productVariants.filter(
      (variant) => variant.isActive,
    );
    if (activeVariants.length > 0) {
      const variant = item.productVariantId
        ? activeVariants.find((candidate) => candidate.id === item.productVariantId)
        : undefined;
      if (!variant) {
        throw new ValidationError(
          `Product '${product.name}' requires one exact active replacement variant`,
          "exchangeItems.productVariantId",
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
        "exchangeItems.productVariantId",
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
}

function result(
  order: CanonicalReturnOrder,
  returnCase: {
    id: string;
    caseType: string;
  },
  orderVersion: number,
  returnState: ReturnLifecycleState,
  status: string,
  inventoryState: string,
  fullOrderReturn: boolean,
  replacementOrderId: string | null,
  disposition?: {
    availableQuantity: number;
    damagedQuantity: number;
    quarantineQuantity: number;
    lostQuantity: number;
    recordedLossAmount: number;
  },
): CanonicalCustomerReturnResult {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderVersion,
    returnId: returnCase.id,
    caseType: returnCase.caseType as "return" | "exchange",
    returnState,
    status,
    inventoryState,
    fullOrderReturn,
    replacementOrderId,
    availableQuantity: disposition?.availableQuantity ?? 0,
    damagedQuantity: disposition?.damagedQuantity ?? 0,
    quarantineQuantity: disposition?.quarantineQuantity ?? 0,
    lostQuantity: disposition?.lostQuantity ?? 0,
    recordedLossAmount: disposition?.recordedLossAmount ?? 0,
  };
}

export async function requestCanonicalCustomerReturn(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCustomerReturnResult>> {
  const data = canonicalCustomerReturnRequestSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "order.customer-return.request.v1",
      aggregate: {
        type: "canonical-customer-return-request",
        id: data.orderId,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalReturnOrder(tx, data.orderId);
      assertDeliveredReturnAuthority(order);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      if (await canonicalReturnCaseForOrder(tx, order.id)) {
        throw new ConflictError(
          "This order already has a canonical return or exchange case",
        );
      }
      if (![null, "none"].includes(order.returnState)) {
        throw new ConflictError(
          `Order return projection is already '${String(order.returnState)}'`,
        );
      }

      const requested = exactRequestedItems(data.items, order.items);
      const replacementItems =
        data.caseType === "exchange"
          ? await priceReplacementItems(tx, data.exchangeItems ?? [])
          : [];
      const returnId = randomUUID();

      await tx.canonicalReturnCase.create({
        data: {
          id: returnId,
          returnKey: `${commandId}:return-case`,
          orderId: order.id,
          origin: "customer_return",
          caseType: data.caseType,
          currentState: "requested",
          reasonCode: data.reasonCode,
          createdByCommandId: commandId,
        },
      });
      for (const [index, item] of requested.entries()) {
        await tx.canonicalReturnItem.create({
          data: {
            id: randomUUID(),
            itemKey: `${commandId}:return-item:${index}`,
            returnId,
            orderId: order.id,
            orderItemId: item.orderItem.id,
            productId: item.orderItem.productId!,
            productVariantId: item.orderItem.productVariantId,
            quantity: item.quantity,
            createdByCommandId: commandId,
          },
        });
      }

      if (data.caseType === "exchange") {
        await tx.canonicalExchangeRequest.create({
          data: {
            id: randomUUID(),
            requestKey: `${commandId}:exchange-request`,
            returnId,
            deliveryCost: data.exchangeDeliveryCost,
            createdByCommandId: commandId,
          },
        });
        for (const [index, item] of replacementItems.entries()) {
          await tx.canonicalExchangeRequestItem.create({
            data: {
              id: randomUUID(),
              itemKey: `${commandId}:exchange-item:${index}`,
              returnId,
              ...item,
              createdByCommandId: commandId,
            },
          });
        }
      }

      await appendCanonicalReturnEvent(tx, {
        commandId,
        returnId,
        orderId: order.id,
        eventType: "customer-return.requested.v1",
        fromState: null,
        toState: "requested",
        reasonCode: data.reasonCode,
        occurredAt: data.occurredAt,
      });

      const nextVersion = await updateCanonicalReturnProjection(
        tx,
        order,
        data.expectedVersion,
        {
          status: order.status,
          fulfillmentState: "closed",
          deliveryState: "delivered",
          inventoryState: "settled",
          codState: currentCodState(order),
          returnState: "requested",
          refundState: currentRefundState(order),
        },
      );
      const fullOrderReturn =
        requested.length === order.items.length &&
        requested.every(
          (entry) => entry.quantity === entry.orderItem.quantity,
        );

      await recordOrderChangeInTx(tx, {
        orderId: order.id,
        actionType:
          data.caseType === "exchange" ? "exchange_requested" : "return_requested",
        actor: principal.auditActor,
        payload: {
          returnId,
          caseType: data.caseType,
          reasonCode: data.reasonCode,
          requestedItemCount: requested.length,
          fullOrderReturn,
          replacementItemCount: replacementItems.length,
          exchangeDeliveryCost: data.exchangeDeliveryCost,
          orderVersion: nextVersion,
          commandId,
          authority: "canonical-customer-return-v1",
        },
      });

      const output = result(
        order,
        { id: returnId, caseType: data.caseType },
        nextVersion,
        "requested",
        order.status,
        "settled",
        fullOrderReturn,
        null,
      );
      const eventPayload = {
        ...output,
        requestedItems: requested.map((entry) => ({
          orderItemId: entry.orderItem.id,
          quantity: entry.quantity,
        })),
        replacementItems: replacementItems.map((entry) => ({
          productId: entry.productId,
          productVariantId: entry.productVariantId,
          quantity: entry.quantity,
          unitPrice: entry.unitPrice,
        })),
        reasonCode: data.reasonCode,
      };

      return {
        result: output,
        audit: {
          action: "customer-return.requested.v1",
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            returnState: order.returnState,
          },
          after: output,
          metadata: {
            caseType: data.caseType,
            authority: "canonical-customer-return-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: "customer-return.requested.v1",
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: "customer-return.requested.v1",
            payload: eventPayload,
          },
        ],
        projectionInvalidations: returnProjectionKeys(order.id),
      };
    },
  );
}

async function requestedReturnItems(
  tx: Parameters<Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]>[0],
  returnId: string,
): Promise<RequestedReturnItem[]> {
  return tx.canonicalReturnItem.findMany({
    where: { returnId },
    select: {
      id: true,
      orderItemId: true,
      productId: true,
      productVariantId: true,
      quantity: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

function exactInspectionItems(
  submitted: readonly z.infer<typeof inspectionItemSchema>[],
  requested: readonly RequestedReturnItem[],
): Map<string, z.infer<typeof inspectionItemSchema>> {
  if (submitted.length !== requested.length) {
    throw new ValidationError(
      "Inspection must account for every requested return item exactly once",
      "items",
    );
  }
  const byId = new Map<string, z.infer<typeof inspectionItemSchema>>();
  for (const item of submitted) {
    if (byId.has(item.orderItemId)) {
      throw new ValidationError(
        `Inspection contains duplicate order item '${item.orderItemId}'`,
        "items.orderItemId",
      );
    }
    byId.set(item.orderItemId, item);
  }
  for (const item of requested) {
    const inspection = byId.get(item.orderItemId);
    if (!inspection || inspection.quantity !== item.quantity) {
      throw new ValidationError(
        `Inspection quantity must match requested quantity for '${item.orderItemId}'`,
        "items.quantity",
      );
    }
  }
  return byId;
}

async function restoreAvailableStock(
  tx: Parameters<Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]>[0],
  item: RequestedReturnItem,
): Promise<void> {
  if (item.productVariantId) {
    const variant = await tx.productVariant.updateMany({
      where: {
        id: item.productVariantId,
        productId: item.productId,
      },
      data: { stock: { increment: item.quantity } },
    });
    if (variant.count !== 1) {
      throw new ConflictError(
        `Product variant '${item.productVariantId}' is missing during return inspection`,
      );
    }
    const aggregate = await tx.productVariant.aggregate({
      where: { productId: item.productId, isActive: true },
      _sum: { stock: true },
    });
    const product = await tx.product.updateMany({
      where: { id: item.productId, deletedAt: null },
      data: { stock: aggregate._sum.stock ?? 0 },
    });
    if (product.count !== 1) {
      throw new ConflictError(
        `Product '${item.productId}' is missing during return inspection`,
      );
    }
    return;
  }

  const product = await tx.product.updateMany({
    where: { id: item.productId, deletedAt: null },
    data: { stock: { increment: item.quantity } },
  });
  if (product.count !== 1) {
    throw new ConflictError(
      `Product '${item.productId}' is missing during return inspection`,
    );
  }
}

async function createReplacementOrder(
  tx: Parameters<Parameters<BusinessPrincipalContext["prisma"]["$transaction"]>[0]>[0],
  input: {
    commandId: string;
    principalActor: string;
    order: CanonicalReturnOrder;
    returnCase: CanonicalReturnCaseAuthority;
  },
): Promise<string> {
  const [agreement, items, existing] = await Promise.all([
    tx.canonicalExchangeRequest.findUnique({
      where: { returnId: input.returnCase.id },
      select: { deliveryCost: true },
    }),
    tx.canonicalExchangeRequestItem.findMany({
      where: { returnId: input.returnCase.id },
      orderBy: { createdAt: "asc" },
    }),
    tx.canonicalExchangeOrder.findUnique({
      where: { returnId: input.returnCase.id },
      select: { replacementOrderId: true },
    }),
  ]);
  if (existing) return existing.replacementOrderId;
  if (!agreement || items.length === 0) {
    throw new ConflictError(
      "Exchange agreement is missing its replacement item authority",
    );
  }

  const orderNumber = await nextOrderNumber(
    tx as unknown as BusinessPrincipalContext["prisma"],
    "EXC",
  );
  const totalPrice =
    items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) +
    agreement.deliveryCost;
  const replacement = await tx.order.create({
    data: {
      orderNumber,
      status: "pending",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId: input.order.customerId,
      totalPrice,
      deliveryCost: agreement.deliveryCost,
      wilaya: input.order.wilaya,
      commune: input.order.commune,
      address: input.order.address,
      phone: input.order.phone,
      source: "manual",
      sourceMetadata: JSON.stringify({
        authority: TRUSTED_MANUAL_ORDER_AUTHORITY,
        exchangeOf: input.order.id,
        returnCaseId: input.returnCase.id,
      }),
      notes: `Exchange replacement for ${input.order.orderNumber}`,
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          productName: item.productName,
          productVariantName: item.productVariantName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.unitPrice * item.quantity,
        })),
      },
    },
  });
  await tx.canonicalExchangeOrder.create({
    data: {
      id: randomUUID(),
      exchangeKey: `${input.commandId}:exchange-order`,
      returnId: input.returnCase.id,
      sourceOrderId: input.order.id,
      replacementOrderId: replacement.id,
      createdByCommandId: input.commandId,
    },
  });
  await recordOrderChangeInTx(tx, {
    orderId: replacement.id,
    actionType: "created",
    actor: input.principalActor,
    payload: {
      orderNumber,
      status: "pending",
      totalPrice,
      exchangeOf: input.order.id,
      returnCaseId: input.returnCase.id,
      commandId: input.commandId,
      authority: "canonical-exchange-v1",
    },
  });
  return replacement.id;
}

export async function transitionCanonicalCustomerReturn(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalCustomerReturnResult>> {
  const data = canonicalCustomerReturnTransitionSchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `order.customer-return.${data.action}.v1`,
      aggregate: {
        type: "canonical-customer-return-transition",
        id: `${data.returnId}:${data.action}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadCanonicalReturnOrder(tx, data.orderId);
      assertDeliveredReturnAuthority(order);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }
      const returnCase = await canonicalReturnCaseForOrder(tx, order.id);
      if (!returnCase || returnCase.id !== data.returnId) {
        throw new NotFoundError("Canonical return case", data.returnId);
      }
      if (returnCase.origin !== "customer_return") {
        throw new ConflictError(
          "Delivery-exception returns use the canonical recovery command",
        );
      }
      const requested = await requestedReturnItems(tx, returnCase.id);
      if (requested.length === 0) {
        throw new ConflictError("Canonical return case has no requested items");
      }
      const fullOrderReturn = isFullOrderReturn(requested, order.items);
      const compensationFacts: CompensationFact[] = [];
      const financialMovements: FinancialMovementFact[] = [];
      const inventoryMovements: InventoryMovementFact[] = [];
      const disposition = {
        availableQuantity: 0,
        damagedQuantity: 0,
        quarantineQuantity: 0,
        lostQuantity: 0,
        recordedLossAmount: 0,
      };
      let nextState: ReturnLifecycleState;
      let status = order.status;
      let inventoryState = order.inventoryState ?? "settled";
      let replacementOrderId: string | null = null;

      if (data.action === "approve") {
        if (returnCase.currentState !== "requested") {
          throw new ConflictError(
            `Return approval requires requested state; current state is '${returnCase.currentState}'`,
          );
        }
        nextState = "approved";
      } else if (data.action === "reject") {
        if (returnCase.currentState !== "requested") {
          throw new ConflictError(
            `Return rejection requires requested state; current state is '${returnCase.currentState}'`,
          );
        }
        nextState = "rejected";
      } else if (data.action === "cancel") {
        if (!["requested", "approved"].includes(returnCase.currentState)) {
          throw new ConflictError(
            `Return cancellation cannot run from '${returnCase.currentState}'`,
          );
        }
        nextState = "cancelled";
      } else if (data.action === "mark_in_transit") {
        if (returnCase.currentState !== "approved") {
          throw new ConflictError(
            `Return transit requires approved state; current state is '${returnCase.currentState}'`,
          );
        }
        nextState = "in_transit";
        inventoryState = "return_pending_receipt";
      } else if (data.action === "receive") {
        if (!["approved", "in_transit"].includes(returnCase.currentState)) {
          throw new ConflictError(
            `Physical receipt cannot run from '${returnCase.currentState}'`,
          );
        }
        nextState = "received";
        inventoryState = "return_pending_inspection";
        inventoryMovements.push(
          ...requested.map((item) => ({
            movementKey: `${commandId}:received:${item.orderItemId}`,
            movementType: "customer_return_received_for_inspection",
            orderId: order.id,
            orderItemId: item.orderItemId,
            productId: item.productId,
            productVariantId: item.productVariantId ?? undefined,
            quantity: item.quantity,
            fromPosition:
              returnCase.currentState === "in_transit"
                ? "return_in_transit"
                : "customer_possession",
            toPosition: "return_pending_inspection",
            reason: `Customer return received for inspection for order ${order.id}`,
            occurredAt: data.occurredAt,
          })),
        );
        compensationFacts.push({
          key: `${commandId}:physical-receipt`,
          type: "customer-return.physical-receipt.v1",
          payload: {
            orderId: order.id,
            returnId: returnCase.id,
            availableStockRestored: false,
            returnedQuantity: requested.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
          },
        });
      } else if (data.action === "inspect") {
        if (returnCase.currentState !== "received") {
          throw new ConflictError(
            `Return inspection requires received state; current state is '${returnCase.currentState}'`,
          );
        }
        if (
          await tx.canonicalReturnInspection.count({
            where: { returnId: returnCase.id },
          })
        ) {
          throw new ConflictError("This return was already inspected");
        }
        const submitted = exactInspectionItems(data.items ?? [], requested);
        const orderItemsById = new Map(order.items.map((item) => [item.id, item]));

        for (const item of requested) {
          const orderItem = orderItemsById.get(item.orderItemId);
          if (!orderItem) {
            throw new ConflictError(
              `Requested return item '${item.orderItemId}' no longer exists`,
            );
          }
          const inspection = submitted.get(item.orderItemId)!;
          const unitCost = orderItem.product?.cost ?? null;
          const lossAmount =
            ["damaged", "lost"].includes(inspection.disposition) &&
            unitCost !== null
              ? unitCost * item.quantity
              : null;

          await tx.canonicalReturnInspection.create({
            data: {
              id: randomUUID(),
              inspectionKey: `${commandId}:inspection:${item.orderItemId}`,
              returnId: returnCase.id,
              orderId: order.id,
              orderItemId: item.orderItemId,
              productId: item.productId,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              disposition: inspection.disposition,
              unitCost,
              lossAmount,
              reasonCode: data.reasonCode,
              occurredAt: data.occurredAt,
              createdByCommandId: commandId,
            },
          });

          if (inspection.disposition === "available") {
            await restoreAvailableStock(tx, item);
            disposition.availableQuantity += item.quantity;
          } else if (inspection.disposition === "damaged") {
            disposition.damagedQuantity += item.quantity;
          } else if (inspection.disposition === "quarantine") {
            disposition.quarantineQuantity += item.quantity;
          } else {
            disposition.lostQuantity += item.quantity;
          }
          inventoryMovements.push({
            movementKey: `${commandId}:disposition:${item.orderItemId}`,
            movementType: `customer_return_inspected_${inspection.disposition}`,
            orderId: order.id,
            orderItemId: item.orderItemId,
            productId: item.productId,
            productVariantId: item.productVariantId ?? undefined,
            quantity: item.quantity,
            fromPosition: "return_pending_inspection",
            toPosition: inspection.disposition,
            reason: `Customer return inspection for order ${order.id}`,
            occurredAt: data.occurredAt,
          });
          compensationFacts.push({
            key: `${commandId}:item:${item.orderItemId}`,
            type: "customer-return.item-disposition.v1",
            payload: {
              orderId: order.id,
              returnId: returnCase.id,
              orderItemId: item.orderItemId,
              productId: item.productId,
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              disposition: inspection.disposition,
              unitCost,
              lossAmount,
              reasonCode: data.reasonCode,
            },
          });
          if (lossAmount !== null && lossAmount > 0) {
            disposition.recordedLossAmount += lossAmount;
            financialMovements.push({
              movementKey: `${commandId}:loss:${item.orderItemId}`,
              movementType:
                inspection.disposition === "damaged"
                  ? "customer_return_damaged_loss"
                  : "customer_return_lost_loss",
              orderId: order.id,
              amount: -lossAmount,
              currency: "DZD",
              reason: `Explicit customer-return inventory loss for order item ${item.orderItemId}`,
              occurredAt: data.occurredAt,
            });
          }
        }
        nextState = "inspected";
        inventoryState = "settled";
      } else if (data.action === "complete") {
        if (returnCase.currentState !== "inspected") {
          throw new ConflictError(
            `Return completion requires inspected state; current state is '${returnCase.currentState}'`,
          );
        }
        nextState = "completed";
        inventoryState = "settled";
        status = fullOrderReturn ? "returned" : "delivered";
        if (fullOrderReturn) {
          const adjusted = await tx.customer.updateMany({
            where: {
              id: order.customerId,
              deletedAt: null,
              orderCount: { gt: 0 },
            },
            data: { orderCount: { decrement: 1 } },
          });
          if (adjusted.count !== 1) {
            throw new ConflictError(
              "Customer order-count projection cannot be reversed safely",
            );
          }
          compensationFacts.push({
            key: `${commandId}:customer-order-count`,
            type: "customer-return.full-order-count-reversal.v1",
            payload: {
              orderId: order.id,
              returnId: returnCase.id,
              delta: -1,
            },
          });
        }
        if (returnCase.caseType === "exchange") {
          replacementOrderId = await createReplacementOrder(tx, {
            commandId,
            principalActor: principal.auditActor,
            order,
            returnCase,
          });
        }
      } else {
        throw new ValidationError("Unsupported canonical return action", "action");
      }

      await setCanonicalReturnCaseState(
        tx,
        returnCase,
        [returnCase.currentState],
        nextState,
      );
      await appendCanonicalReturnEvent(tx, {
        commandId,
        returnId: returnCase.id,
        orderId: order.id,
        eventType: `customer-return.${data.action}.v1`,
        fromState: returnCase.currentState,
        toState: nextState,
        reasonCode: data.reasonCode,
        occurredAt: data.occurredAt,
      });
      const nextVersion = await updateCanonicalReturnProjection(
        tx,
        order,
        data.expectedVersion,
        {
          status,
          fulfillmentState: "closed",
          deliveryState: "delivered",
          inventoryState,
          codState: currentCodState(order),
          returnState: nextState,
          refundState: currentRefundState(order),
        },
      );
      await recordOrderChangeInTx(tx, {
        orderId: order.id,
        actionType: `return_${data.action}`,
        actor: principal.auditActor,
        payload: {
          returnId: returnCase.id,
          caseType: returnCase.caseType,
          fromState: returnCase.currentState,
          toState: nextState,
          reasonCode: data.reasonCode,
          fullOrderReturn,
          replacementOrderId,
          disposition,
          orderVersion: nextVersion,
          commandId,
          authority: "canonical-customer-return-v1",
        },
      });

      const output = result(
        order,
        returnCase,
        nextVersion,
        nextState,
        status,
        inventoryState,
        fullOrderReturn,
        replacementOrderId,
        disposition,
      );
      const eventPayload = {
        ...output,
        reasonCode: data.reasonCode,
        occurredAt: data.occurredAt.toISOString(),
      };

      return {
        result: output,
        audit: {
          action: `customer-return.${data.action}.v1`,
          entity: "order",
          entityId: order.id,
          before: {
            version: order.version,
            status: order.status,
            returnState: order.returnState,
            inventoryState: order.inventoryState,
          },
          after: output,
          metadata: {
            returnId: returnCase.id,
            caseType: returnCase.caseType,
            authority: "canonical-customer-return-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: `customer-return.${data.action}.v1`,
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
          ...(replacementOrderId
            ? [
                {
                  key: `${commandId}:replacement-order-event`,
                  type: "exchange.replacement-order.created.v1",
                  payload: {
                    sourceOrderId: order.id,
                    returnId: returnCase.id,
                    replacementOrderId,
                  },
                  occurredAt: data.occurredAt,
                },
              ]
            : []),
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: `customer-return.${data.action}.v1`,
            payload: eventPayload,
          },
          ...(replacementOrderId
            ? [
                {
                  effectKey: `${commandId}:replacement-order-projection`,
                  effectType: "exchange.replacement-order.created.v1",
                  payload: {
                    sourceOrderId: order.id,
                    returnId: returnCase.id,
                    replacementOrderId,
                  },
                },
              ]
            : []),
        ],
        inventoryMovements,
        financialMovements,
        compensationFacts,
        projectionInvalidations: [
          ...new Set([
            ...returnProjectionKeys(order.id),
            ...(replacementOrderId ? [`orders:${replacementOrderId}`] : []),
          ]),
        ],
      };
    },
  );
}
