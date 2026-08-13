import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  executeBusinessCommand,
  type BusinessTransaction,
} from "@/lib/business-truth/command-kernel";
import type {
  BusinessCommandResult,
  CloseReservationFact,
  CompensationFact,
  FinancialMovementFact,
  InventoryMovementFact,
  ReturnLifecycleState,
} from "@/lib/business-truth/contracts";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { normalizeDeliveryProvider } from "@/lib/integrations/delivery/types";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

const actionSchema = z.enum([
  "cancel",
  "delivery_failed",
  "delivery_refused",
  "return_in_transit",
  "receive_return",
  "inspect_return",
]);
const dispositionSchema = z.enum([
  "available",
  "damaged",
  "quarantine",
  "lost",
]);
const reasonCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/i)
  .transform((value) => value.toLowerCase());
const idempotencyKeySchema = z.string().trim().min(8).max(200);
const correlationIdSchema = z.string().trim().min(1).max(200).optional();
const expectedVersionSchema = z.number().int().positive().safe();

const inspectionItemSchema = z.object({
  orderItemId: z.string().trim().min(1),
  quantity: z.number().int().positive().safe(),
  disposition: dispositionSchema,
});

export const canonicalOrderRecoverySchema = z
  .object({
    orderId: z.string().trim().min(1),
    action: actionSchema,
    expectedVersion: expectedVersionSchema,
    reasonCode: reasonCodeSchema,
    providerEventId: z.string().trim().min(1).max(240).optional(),
    occurredAt: z.coerce.date(),
    items: z.array(inspectionItemSchema).max(500).optional(),
    idempotencyKey: idempotencyKeySchema,
    correlationId: correlationIdSchema,
  })
  .superRefine((input, context) => {
    if (input.action === "inspect_return" && (!input.items || input.items.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Physical return inspection requires every returned order item",
      });
    }
    if (input.action !== "inspect_return" && input.items !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Inspection items are accepted only for physical return inspection",
      });
    }
    if (
      !["delivery_failed", "delivery_refused", "return_in_transit", "receive_return"].includes(
        input.action,
      ) &&
      input.providerEventId !== undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerEventId"],
        message: "Provider event identity is valid only for delivery/return transitions",
      });
    }
  });

export type CanonicalOrderRecoveryInput = z.infer<
  typeof canonicalOrderRecoverySchema
>;
export type CanonicalOrderRecoveryAction = z.infer<typeof actionSchema>;
export type CanonicalReturnDisposition = z.infer<typeof dispositionSchema>;

type RecoveryStates = {
  status: string;
  fulfillmentState: string;
  deliveryState: string;
  inventoryState: string;
  codState: string;
  returnState: ReturnLifecycleState;
  refundState: string;
};

interface ReservationRow {
  id: string;
  orderItemId: string | null;
  productId: string;
  productVariantId: string | null;
  quantity: number | bigint;
  state: string;
}

interface RecoveryOrderProjection {
  id: string;
  orderNumber: string;
  source: string;
  sourceMetadata: string | null;
  status: string;
  version: number | bigint;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  returnState: string | null;
  refundState: string | null;
}

interface RecoveryOrderItem {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  product: { cost: number | null } | null;
}

interface RecoveryOrder
  extends Omit<RecoveryOrderProjection, "version"> {
  version: number;
  items: RecoveryOrderItem[];
  delivery: {
    id: string;
    provider: string;
    status: string;
    deletedAt: Date | null;
  } | null;
}

interface ReturnCaseRow {
  id: string;
  origin: string;
  currentState: string;
  reasonCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalOrderRecoveryResult {
  readonly [key: string]: unknown;
  orderId: string;
  orderNumber: string;
  version: number;
  status: string;
  fulfillmentState: string;
  deliveryState: string;
  inventoryState: string;
  codState: string;
  returnState: ReturnLifecycleState;
  refundState: string;
  returnCaseId: string | null;
  action: CanonicalOrderRecoveryAction;
  availableQuantity: number;
  damagedQuantity: number;
  quarantineQuantity: number;
  lostQuantity: number;
  recordedLossAmount: number;
}

export interface CanonicalOrderRecoveryPosition {
  orderId: string;
  orderNumber: string;
  orderVersion: number;
  status: string;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  returnState: string | null;
  refundState: string | null;
  deliveryProvider: string | null;
  returnCase: {
    id: string;
    origin: string;
    currentState: string;
    reasonCode: string;
    createdAt: string;
    updatedAt: string;
  } | null;
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string | null;
    quantity: number;
  }>;
  inspections: Array<{
    orderItemId: string;
    quantity: number;
    disposition: CanonicalReturnDisposition;
    unitCost: number | null;
    lossAmount: number | null;
    reasonCode: string;
    occurredAt: string;
  }>;
  availableActions: CanonicalOrderRecoveryAction[];
}

function integer(value: number | bigint, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return result;
}

function projectionKeys(orderId: string): string[] {
  return [
    "orders:list",
    `orders:${orderId}`,
    "dashboard:orders",
    "deliveries:list",
    "returns:list",
    "inventory:list",
    "products:list",
    "accounting:profitability",
  ];
}

async function reservationRows(
  tx: BusinessTransaction,
  orderId: string,
  state: "active" | "consumed",
): Promise<ReservationRow[]> {
  return tx.$queryRaw<ReservationRow[]>`
    SELECT "id", "orderItemId", "productId", "productVariantId", "quantity", "state"
    FROM "InventoryReservation"
    WHERE "orderId" = ${orderId}
      AND "state" = ${state}
    ORDER BY "orderItemId" ASC, "id" ASC
  `;
}

function assertReservationsMatchItems(
  rows: readonly ReservationRow[],
  items: readonly RecoveryOrderItem[],
  expectedState: "active" | "consumed",
): void {
  if (rows.length !== items.length) {
    throw new ConflictError(
      `Order inventory authority requires ${items.length} ${expectedState} reservations, found ${rows.length}`,
    );
  }
  const byItem = new Map(rows.map((row) => [row.orderItemId, row]));
  if (byItem.size !== rows.length) {
    throw new ConflictError("Order inventory authority contains duplicate item reservations");
  }
  for (const item of items) {
    if (!item.productId) {
      throw new ValidationError(
        `Order item '${item.id}' has no product identity`,
        "items.productId",
      );
    }
    const reservation = byItem.get(item.id);
    if (
      !reservation ||
      reservation.state !== expectedState ||
      reservation.productId !== item.productId ||
      reservation.productVariantId !== item.productVariantId ||
      Number(reservation.quantity) !== item.quantity
    ) {
      throw new ConflictError(
        `Reservation authority does not exactly match order item '${item.id}'`,
      );
    }
  }
}

function assertInspectionItems(
  submitted: readonly z.infer<typeof inspectionItemSchema>[],
  orderItems: readonly RecoveryOrderItem[],
): Map<string, z.infer<typeof inspectionItemSchema>> {
  if (submitted.length !== orderItems.length) {
    throw new ValidationError(
      "Physical return inspection must account for every order item exactly once",
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
  for (const orderItem of orderItems) {
    const item = byId.get(orderItem.id);
    if (!item || item.quantity !== orderItem.quantity) {
      throw new ValidationError(
        `Inspection quantity must exactly match order item '${orderItem.id}'`,
        "items.quantity",
      );
    }
  }
  return byId;
}

async function loadOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<RecoveryOrder> {
  const rows = await tx.$queryRaw<RecoveryOrderProjection[]>`
    SELECT
      "id", "orderNumber", "source", "sourceMetadata", "status", "version",
      "fulfillmentState", "deliveryState", "inventoryState", "codState",
      "returnState", "refundState"
    FROM "Order"
    WHERE "id" = ${orderId}
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const projection = rows[0];
  if (!projection) throw new NotFoundError("Order", orderId);
  if (!isTrustedManualOrderAuthority(projection.source, projection.sourceMetadata)) {
    throw new ValidationError(
      "Canonical recovery commands currently govern trusted manual orders only",
      "order.authority",
    );
  }

  const [items, delivery] = await Promise.all([
    tx.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { cost: true } } },
      orderBy: { id: "asc" },
    }),
    tx.delivery.findUnique({
      where: { orderId },
      select: { id: true, provider: true, status: true, deletedAt: true },
    }),
  ]);

  return {
    ...projection,
    version: integer(projection.version, "order version"),
    items,
    delivery,
  };
}

function stateDescription(order: RecoveryOrder): string {
  return [
    order.status,
    order.fulfillmentState ?? "legacy-fulfillment",
    order.deliveryState ?? "legacy-delivery",
    order.inventoryState ?? "legacy-inventory",
    order.codState ?? "legacy-cod",
    order.returnState ?? "legacy-return",
  ].join("/");
}

function stateConflict(action: string, order: RecoveryOrder): ConflictError {
  return new ConflictError(
    `Canonical ${action} cannot run from '${stateDescription(order)}'`,
  );
}

async function updateOrderProjection(
  tx: BusinessTransaction,
  order: RecoveryOrder,
  input: RecoveryStates & { expectedVersion: number },
): Promise<number> {
  const nextVersion = input.expectedVersion + 1;
  const updated = await tx.$executeRaw`
    UPDATE "Order"
    SET
      "version" = ${nextVersion},
      "status" = ${input.status},
      "fulfillmentState" = ${input.fulfillmentState},
      "deliveryState" = ${input.deliveryState},
      "inventoryState" = ${input.inventoryState},
      "codState" = ${input.codState},
      "returnState" = ${input.returnState},
      "refundState" = ${input.refundState},
      "codCollected" = 0,
      "codCollectedAt" = NULL,
      "codRemitted" = 0,
      "codRemittedAt" = NULL,
      "codRemittanceRef" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${order.id}
      AND "version" = ${input.expectedVersion}
      AND "status" = ${order.status}
      AND "deletedAt" IS NULL
  `;
  if (updated !== 1) {
    throw new ConflictError(
      `Order ${order.id} changed while the recovery command was committed`,
    );
  }
  return nextVersion;
}

async function updateDelivery(
  tx: BusinessTransaction,
  order: RecoveryOrder,
  expectedStatus: readonly string[],
  nextStatus: string,
): Promise<void> {
  if (!order.delivery || order.delivery.deletedAt) {
    throw new ConflictError("Canonical delivery authority is missing");
  }
  const updated = await tx.delivery.updateMany({
    where: {
      id: order.delivery.id,
      status: { in: [...expectedStatus] },
      deletedAt: null,
    },
    data: { status: nextStatus },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      "Delivery changed while the recovery command was committed",
    );
  }
}

async function returnCaseForOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<ReturnCaseRow | null> {
  return tx.canonicalReturnCase.findUnique({
    where: { orderId },
    select: {
      id: true,
      origin: true,
      currentState: true,
      reasonCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function appendDeliveryEvent(
  tx: BusinessTransaction,
  input: {
    commandId: string;
    order: RecoveryOrder;
    eventType: string;
    reasonCode: string;
    occurredAt: Date;
    providerEventId?: string;
  },
): Promise<void> {
  const storedProvider = input.order.delivery?.provider;
  await tx.canonicalDeliveryEvent.create({
    data: {
      id: randomUUID(),
      eventKey: `${input.commandId}:delivery-event`,
      orderId: input.order.id,
      deliveryId: input.order.delivery?.id,
      eventType: input.eventType,
      provider: storedProvider
        ? (normalizeDeliveryProvider(storedProvider) ?? storedProvider)
        : "manual",
      providerEventId: input.providerEventId,
      reasonCode: input.reasonCode,
      occurredAt: input.occurredAt,
      createdByCommandId: input.commandId,
    },
  });
}

async function appendReturnEvent(
  tx: BusinessTransaction,
  input: {
    commandId: string;
    returnId: string;
    orderId: string;
    eventType: string;
    fromState: string | null;
    toState: ReturnLifecycleState;
    reasonCode: string;
    occurredAt: Date;
  },
): Promise<void> {
  await tx.canonicalReturnEvent.create({
    data: {
      id: randomUUID(),
      eventKey: `${input.commandId}:return-event`,
      returnId: input.returnId,
      orderId: input.orderId,
      eventType: input.eventType,
      fromState: input.fromState,
      toState: input.toState,
      reasonCode: input.reasonCode,
      occurredAt: input.occurredAt,
      createdByCommandId: input.commandId,
    },
  });
}

async function setReturnCaseState(
  tx: BusinessTransaction,
  returnCase: ReturnCaseRow,
  expectedState: readonly string[],
  nextState: ReturnLifecycleState,
): Promise<void> {
  const updated = await tx.canonicalReturnCase.updateMany({
    where: {
      id: returnCase.id,
      currentState: { in: [...expectedState] },
    },
    data: { currentState: nextState },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      "Return case changed while the command was committed",
    );
  }
}

async function restoreAvailableStock(
  tx: BusinessTransaction,
  reservations: readonly ReservationRow[],
): Promise<void> {
  for (const reservation of reservations) {
    const quantity = integer(reservation.quantity, "reservation quantity");
    if (reservation.productVariantId) {
      const variant = await tx.productVariant.updateMany({
        where: {
          id: reservation.productVariantId,
          productId: reservation.productId,
        },
        data: { stock: { increment: quantity } },
      });
      if (variant.count !== 1) {
        throw new ConflictError(
          `Variant '${reservation.productVariantId}' is missing during cancellation`,
        );
      }
      const available = await tx.productVariant.aggregate({
        where: { productId: reservation.productId, isActive: true },
        _sum: { stock: true },
      });
      const product = await tx.product.updateMany({
        where: { id: reservation.productId, deletedAt: null },
        data: { stock: available._sum.stock ?? 0 },
      });
      if (product.count !== 1) {
        throw new ConflictError(
          `Product '${reservation.productId}' is missing during cancellation`,
        );
      }
    } else {
      const product = await tx.product.updateMany({
        where: { id: reservation.productId, deletedAt: null },
        data: { stock: { increment: quantity } },
      });
      if (product.count !== 1) {
        throw new ConflictError(
          `Product '${reservation.productId}' is missing during cancellation`,
        );
      }
    }
  }
}

function movementForReservation(
  commandId: string,
  reservation: ReservationRow,
  movementType: string,
  fromPosition: string,
  toPosition: string,
  reason: string,
  occurredAt: Date,
): InventoryMovementFact {
  return {
    movementKey: `${commandId}:${movementType}:${reservation.id}`,
    movementType,
    orderId: undefined,
    orderItemId: reservation.orderItemId ?? undefined,
    reservationId: reservation.id,
    productId: reservation.productId,
    productVariantId: reservation.productVariantId ?? undefined,
    quantity: integer(reservation.quantity, "reservation quantity"),
    fromPosition,
    toPosition,
    reason,
    occurredAt,
  };
}

function resultFrom(
  order: RecoveryOrder,
  action: CanonicalOrderRecoveryAction,
  version: number,
  states: RecoveryStates,
  returnCaseId: string | null,
  disposition?: {
    availableQuantity: number;
    damagedQuantity: number;
    quarantineQuantity: number;
    lostQuantity: number;
    recordedLossAmount: number;
  },
): CanonicalOrderRecoveryResult {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    version,
    ...states,
    returnCaseId,
    action,
    availableQuantity: disposition?.availableQuantity ?? 0,
    damagedQuantity: disposition?.damagedQuantity ?? 0,
    quarantineQuantity: disposition?.quarantineQuantity ?? 0,
    lostQuantity: disposition?.lostQuantity ?? 0,
    recordedLossAmount: disposition?.recordedLossAmount ?? 0,
  };
}

export async function executeCanonicalOrderRecovery(
  context: BusinessPrincipalContext,
  input: unknown,
): Promise<BusinessCommandResult<CanonicalOrderRecoveryResult>> {
  const data = canonicalOrderRecoverySchema.parse(input);
  const correlationId = data.correlationId ?? randomUUID();

  return executeBusinessCommand(
    context,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `order.recovery.${data.action}.v1`,
      aggregate: {
        type: "canonical-order-recovery-transition",
        id: `${data.orderId}:${data.action}`,
        expectedVersion: 0,
      },
      actor: "authenticated-owner",
      correlationId,
      payload: data,
    },
    async ({ tx, commandId, principal }) => {
      const order = await loadOrder(tx, data.orderId);
      if (order.version !== data.expectedVersion) {
        throw new ConflictError(
          `Order ${order.id} version conflict: expected ${data.expectedVersion}, current ${order.version}`,
        );
      }

      const before = {
        status: order.status,
        version: order.version,
        fulfillmentState: order.fulfillmentState,
        deliveryState: order.deliveryState,
        inventoryState: order.inventoryState,
        codState: order.codState,
        returnState: order.returnState,
        refundState: order.refundState,
      };
      const compensationFacts: CompensationFact[] = [];
      const financialMovements: FinancialMovementFact[] = [];
      const inventoryMovements: InventoryMovementFact[] = [];
      let reservations: CloseReservationFact[] = [];
      let returnCaseId: string | null = null;
      let states: RecoveryStates;
      const dispositionSummary = {
        availableQuantity: 0,
        damagedQuantity: 0,
        quarantineQuantity: 0,
        lostQuantity: 0,
        recordedLossAmount: 0,
      };

      if (data.action === "cancel") {
        if (
          order.status !== "confirmed" ||
          !["unfulfilled", "ready"].includes(order.fulfillmentState ?? "") ||
          order.deliveryState !== "not_created" ||
          order.inventoryState !== "reserved" ||
          order.codState !== "not_expected"
        ) {
          throw stateConflict(data.action, order);
        }
        if (await returnCaseForOrder(tx, order.id)) {
          throw new ConflictError(
            "A cancellation cannot bypass an existing return case",
          );
        }
        const active = await reservationRows(tx, order.id, "active");
        assertReservationsMatchItems(active, order.items, "active");
        await restoreAvailableStock(tx, active);
        reservations = active.map((reservation) => ({
          operation: "release",
          id: reservation.id,
        }));
        inventoryMovements.push(
          ...active.map((reservation) => ({
            ...movementForReservation(
              commandId,
              reservation,
              "reservation_released_on_cancellation",
              "reserved",
              "available",
              `Pre-shipment cancellation restored reserved stock for order ${order.id}`,
              data.occurredAt,
            ),
            orderId: order.id,
          })),
        );
        states = {
          status: "cancelled",
          fulfillmentState: "closed",
          deliveryState: "not_created",
          inventoryState: "settled",
          codState: "not_expected",
          returnState: "none",
          refundState: "none",
        };
        compensationFacts.push({
          key: `${commandId}:reservation-release`,
          type: "order.pre-shipment-cancellation.v1",
          payload: {
            orderId: order.id,
            releasedReservationIds: active.map((entry) => entry.id),
            restoredQuantity: active.reduce(
              (sum, entry) => sum + integer(entry.quantity, "reservation quantity"),
              0,
            ),
            reasonCode: data.reasonCode,
          },
        });
      } else if (
        data.action === "delivery_failed" ||
        data.action === "delivery_refused"
      ) {
        if (
          order.status !== "shipped" ||
          order.fulfillmentState !== "shipped" ||
          !["in_transit", "out_for_delivery"].includes(order.deliveryState ?? "") ||
          order.inventoryState !== "outbound" ||
          order.codState !== "not_expected"
        ) {
          throw stateConflict(data.action, order);
        }
        if (await returnCaseForOrder(tx, order.id)) {
          throw new ConflictError(
            "This order already has a canonical return case",
          );
        }
        const consumed = await reservationRows(tx, order.id, "consumed");
        assertReservationsMatchItems(consumed, order.items, "consumed");
        await updateDelivery(
          tx,
          order,
          ["in_transit", "out_for_delivery"],
          data.action === "delivery_failed" ? "failed" : "refused",
        );
        await appendDeliveryEvent(tx, {
          commandId,
          order,
          eventType:
            data.action === "delivery_failed"
              ? "delivery.failed.v1"
              : "delivery.refused.v1",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          providerEventId: data.providerEventId,
        });
        returnCaseId = randomUUID();
        const origin =
          data.action === "delivery_failed"
            ? "delivery_failure"
            : "delivery_refusal";
        await tx.canonicalReturnCase.create({
          data: {
            id: returnCaseId,
            returnKey: `${commandId}:return-case`,
            orderId: order.id,
            origin,
            caseType: "return",
            currentState: "awaiting_return",
            reasonCode: data.reasonCode,
            createdByCommandId: commandId,
          },
        });
        await appendReturnEvent(tx, {
          commandId,
          returnId: returnCaseId,
          orderId: order.id,
          eventType: "return.awaiting-physical-return.v1",
          fromState: null,
          toState: "awaiting_return",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
        });
        inventoryMovements.push(
          ...consumed.map((reservation) => ({
            ...movementForReservation(
              commandId,
              reservation,
              "delivery_exception_awaiting_return",
              "outbound",
              "return_pending_receipt",
              `Delivery exception kept stock unavailable pending physical return for order ${order.id}`,
              data.occurredAt,
            ),
            orderId: order.id,
          })),
        );
        states = {
          status: "shipped",
          fulfillmentState: "closed",
          deliveryState:
            data.action === "delivery_failed" ? "failed" : "refused",
          inventoryState: "return_pending_receipt",
          codState: "not_expected",
          returnState: "awaiting_return",
          refundState: "none",
        };
        compensationFacts.push({
          key: `${commandId}:return-pending`,
          type: "delivery.exception.awaiting-physical-return.v1",
          payload: {
            orderId: order.id,
            returnCaseId,
            origin,
            stockRestored: false,
            reasonCode: data.reasonCode,
          },
        });
      } else if (data.action === "return_in_transit") {
        if (
          order.status !== "shipped" ||
          !["failed", "refused"].includes(order.deliveryState ?? "") ||
          order.inventoryState !== "return_pending_receipt" ||
          order.returnState !== "awaiting_return"
        ) {
          throw stateConflict(data.action, order);
        }
        const returnCase = await returnCaseForOrder(tx, order.id);
        if (!returnCase) {
          throw new ConflictError("Canonical return case is missing");
        }
        const consumed = await reservationRows(tx, order.id, "consumed");
        assertReservationsMatchItems(consumed, order.items, "consumed");
        returnCaseId = returnCase.id;
        await updateDelivery(
          tx,
          order,
          ["failed", "refused"],
          "return_in_transit",
        );
        await appendDeliveryEvent(tx, {
          commandId,
          order,
          eventType: "delivery.return-in-transit.v1",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          providerEventId: data.providerEventId,
        });
        await setReturnCaseState(
          tx,
          returnCase,
          ["awaiting_return"],
          "in_transit",
        );
        await appendReturnEvent(tx, {
          commandId,
          returnId: returnCase.id,
          orderId: order.id,
          eventType: "return.in-transit.v1",
          fromState: returnCase.currentState,
          toState: "in_transit",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
        });
        inventoryMovements.push(
          ...consumed.map((reservation) => ({
            ...movementForReservation(
              commandId,
              reservation,
              "physical_return_in_transit",
              "return_pending_receipt",
              "return_in_transit",
              `Carrier return entered transit for order ${order.id}`,
              data.occurredAt,
            ),
            orderId: order.id,
          })),
        );
        states = {
          status: "shipped",
          fulfillmentState: "closed",
          deliveryState: "return_in_transit",
          inventoryState: "return_pending_receipt",
          codState: "not_expected",
          returnState: "in_transit",
          refundState: "none",
        };
      } else if (data.action === "receive_return") {
        if (
          order.status !== "shipped" ||
          !["failed", "refused", "return_in_transit"].includes(
            order.deliveryState ?? "",
          ) ||
          order.inventoryState !== "return_pending_receipt" ||
          !["awaiting_return", "in_transit"].includes(order.returnState ?? "")
        ) {
          throw stateConflict(data.action, order);
        }
        const returnCase = await returnCaseForOrder(tx, order.id);
        if (!returnCase) {
          throw new ConflictError("Canonical return case is missing");
        }
        returnCaseId = returnCase.id;
        const consumed = await reservationRows(tx, order.id, "consumed");
        assertReservationsMatchItems(consumed, order.items, "consumed");
        const reservationByItem = new Map(
          consumed.map((entry) => [entry.orderItemId, entry]),
        );
        await updateDelivery(
          tx,
          order,
          ["failed", "refused", "return_in_transit"],
          "returned",
        );
        await appendDeliveryEvent(tx, {
          commandId,
          order,
          eventType: "delivery.physical-return-received.v1",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
          providerEventId: data.providerEventId,
        });
        await setReturnCaseState(
          tx,
          returnCase,
          ["awaiting_return", "in_transit"],
          "received",
        );
        await appendReturnEvent(tx, {
          commandId,
          returnId: returnCase.id,
          orderId: order.id,
          eventType: "return.physically-received.v1",
          fromState: returnCase.currentState,
          toState: "received",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
        });
        inventoryMovements.push(
          ...order.items.map((item) => {
            if (!item.productId) {
              throw new ValidationError(
                `Order item '${item.id}' has no product identity`,
                "items.productId",
              );
            }
            return {
              movementKey: `${commandId}:received:${item.id}`,
              movementType: "physical_return_received_for_inspection",
              orderId: order.id,
              orderItemId: item.id,
              reservationId: reservationByItem.get(item.id)?.id,
              productId: item.productId,
              productVariantId: item.productVariantId ?? undefined,
              quantity: item.quantity,
              fromPosition:
                order.deliveryState === "return_in_transit"
                  ? "return_in_transit"
                  : "return_pending_receipt",
              toPosition: "return_pending_inspection",
              reason: `Physical carrier return received for canonical order ${order.id}`,
              occurredAt: data.occurredAt,
            } satisfies InventoryMovementFact;
          }),
        );
        states = {
          status: "returned",
          fulfillmentState: "closed",
          deliveryState: "returned",
          inventoryState: "return_pending_inspection",
          codState: "not_expected",
          returnState: "received",
          refundState: "none",
        };
        compensationFacts.push({
          key: `${commandId}:inspection-pending`,
          type: "return.physical-receipt-pending-inspection.v1",
          payload: {
            orderId: order.id,
            returnCaseId: returnCase.id,
            availableStockRestored: false,
            itemCount: order.items.length,
          },
        });
      } else {
        if (
          order.status !== "returned" ||
          order.deliveryState !== "returned" ||
          order.inventoryState !== "return_pending_inspection" ||
          order.returnState !== "received"
        ) {
          throw stateConflict(data.action, order);
        }
        const returnCase = await returnCaseForOrder(tx, order.id);
        if (!returnCase || returnCase.currentState !== "received") {
          throw new ConflictError(
            "Received canonical return case is missing",
          );
        }
        returnCaseId = returnCase.id;
        if (
          await tx.canonicalReturnInspection.count({
            where: { returnId: returnCase.id },
          })
        ) {
          throw new ConflictError(
            "This physical return was already inspected",
          );
        }
        const submitted = assertInspectionItems(data.items ?? [], order.items);

        for (const item of order.items) {
          if (!item.productId) {
            throw new ValidationError(
              `Order item '${item.id}' has no product identity`,
              "items.productId",
            );
          }
          const inspection = submitted.get(item.id)!;
          const unitCost = item.product?.cost ?? null;
          const lossAmount =
            ["damaged", "lost"].includes(inspection.disposition) &&
            unitCost !== null
              ? unitCost * item.quantity
              : null;

          await tx.canonicalReturnInspection.create({
            data: {
              id: randomUUID(),
              inspectionKey: `${commandId}:inspection:${item.id}`,
              returnId: returnCase.id,
              orderId: order.id,
              orderItemId: item.id,
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
            } else {
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
            dispositionSummary.availableQuantity += item.quantity;
          } else if (inspection.disposition === "damaged") {
            dispositionSummary.damagedQuantity += item.quantity;
          } else if (inspection.disposition === "quarantine") {
            dispositionSummary.quarantineQuantity += item.quantity;
          } else {
            dispositionSummary.lostQuantity += item.quantity;
          }

          inventoryMovements.push({
            movementKey: `${commandId}:disposition:${item.id}`,
            movementType: `return_inspected_${inspection.disposition}`,
            orderId: order.id,
            orderItemId: item.id,
            productId: item.productId,
            productVariantId: item.productVariantId ?? undefined,
            quantity: item.quantity,
            fromPosition: "return_pending_inspection",
            toPosition: inspection.disposition,
            reason: `Physical return inspection for canonical order ${order.id}`,
            occurredAt: data.occurredAt,
          });
          compensationFacts.push({
            key: `${commandId}:item:${item.id}`,
            type: "return.item.disposition.v1",
            payload: {
              orderId: order.id,
              returnCaseId: returnCase.id,
              orderItemId: item.id,
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
            dispositionSummary.recordedLossAmount += lossAmount;
            financialMovements.push({
              movementKey: `${commandId}:loss:${item.id}`,
              movementType:
                inspection.disposition === "damaged"
                  ? "returned_inventory_damaged_loss"
                  : "returned_inventory_lost_loss",
              orderId: order.id,
              amount: -lossAmount,
              currency: "DZD",
              reason: `Explicit returned inventory loss for order item ${item.id}`,
              occurredAt: data.occurredAt,
            });
          }
        }

        await setReturnCaseState(
          tx,
          returnCase,
          ["received"],
          "completed",
        );
        await appendReturnEvent(tx, {
          commandId,
          returnId: returnCase.id,
          orderId: order.id,
          eventType: "return.inspected-and-completed.v1",
          fromState: returnCase.currentState,
          toState: "completed",
          reasonCode: data.reasonCode,
          occurredAt: data.occurredAt,
        });
        states = {
          status: "returned",
          fulfillmentState: "closed",
          deliveryState: "returned",
          inventoryState: "settled",
          codState: "not_expected",
          returnState: "completed",
          refundState: "none",
        };
      }

      const nextVersion = await updateOrderProjection(tx, order, {
        expectedVersion: data.expectedVersion,
        ...states,
      });
      await tx.orderChange.create({
        data: {
          orderId: order.id,
          status: states.status,
          actionType:
            data.action === "cancel"
              ? "cancel"
              : data.action === "inspect_return"
                ? "return_inspected"
                : data.action,
          actor: principal.auditActor,
          payload: JSON.stringify({
            action: data.action,
            reasonCode: data.reasonCode,
            providerEventId: data.providerEventId ?? null,
            returnCaseId,
            from: before,
            to: { ...states, version: nextVersion },
            dispositionSummary,
            commandId,
            authority: "canonical-order-recovery-v1",
          }),
          confirmedBy: principal.auditActor,
          confirmedAt: data.occurredAt,
        },
      });

      const result = resultFrom(
        order,
        data.action,
        nextVersion,
        states,
        returnCaseId,
        dispositionSummary,
      );
      const eventType = `order.recovery.${data.action}.v1`;
      const eventPayload = {
        ...result,
        reasonCode: data.reasonCode,
        providerEventId: data.providerEventId ?? null,
        occurredAt: data.occurredAt.toISOString(),
      };

      return {
        result,
        audit: {
          action: eventType,
          entity: "order",
          entityId: order.id,
          before,
          after: result,
          metadata: {
            reasonCode: data.reasonCode,
            authority: "canonical-order-recovery-v1",
          },
        },
        events: [
          {
            key: `${commandId}:event`,
            type: eventType,
            payload: eventPayload,
            occurredAt: data.occurredAt,
          },
        ],
        outbox: [
          {
            effectKey: `${commandId}:projection`,
            effectType: eventType,
            payload: eventPayload,
          },
        ],
        reservations,
        inventoryMovements,
        financialMovements,
        compensationFacts,
        projectionInvalidations: projectionKeys(order.id),
      };
    },
  );
}

function availableActions(order: RecoveryOrder): CanonicalOrderRecoveryAction[] {
  if (
    order.status === "confirmed" &&
    ["unfulfilled", "ready"].includes(order.fulfillmentState ?? "") &&
    order.deliveryState === "not_created" &&
    order.inventoryState === "reserved"
  ) {
    return ["cancel"];
  }
  if (
    order.status === "shipped" &&
    order.fulfillmentState === "shipped" &&
    ["in_transit", "out_for_delivery"].includes(order.deliveryState ?? "") &&
    order.inventoryState === "outbound"
  ) {
    return ["delivery_failed", "delivery_refused"];
  }
  if (
    order.status === "shipped" &&
    ["failed", "refused"].includes(order.deliveryState ?? "") &&
    order.inventoryState === "return_pending_receipt"
  ) {
    return ["return_in_transit", "receive_return"];
  }
  if (
    order.status === "shipped" &&
    order.deliveryState === "return_in_transit" &&
    order.inventoryState === "return_pending_receipt"
  ) {
    return ["receive_return"];
  }
  if (
    order.status === "returned" &&
    order.deliveryState === "returned" &&
    order.inventoryState === "return_pending_inspection" &&
    order.returnState === "received"
  ) {
    return ["inspect_return"];
  }
  return [];
}

export async function getCanonicalOrderRecoveryPosition(
  context: BusinessPrincipalContext,
  orderId: string,
): Promise<CanonicalOrderRecoveryPosition> {
  const order = await loadOrder(
    context.prisma as BusinessTransaction,
    orderId,
  );
  const returnCase = await context.prisma.canonicalReturnCase.findUnique({
    where: { orderId },
    select: {
      id: true,
      origin: true,
      currentState: true,
      reasonCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const inspections = returnCase
    ? await context.prisma.canonicalReturnInspection.findMany({
        where: { returnId: returnCase.id },
        orderBy: { occurredAt: "asc" },
        select: {
          orderItemId: true,
          quantity: true,
          disposition: true,
          unitCost: true,
          lossAmount: true,
          reasonCode: true,
          occurredAt: true,
        },
      })
    : [];

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderVersion: order.version,
    status: order.status,
    fulfillmentState: order.fulfillmentState,
    deliveryState: order.deliveryState,
    inventoryState: order.inventoryState,
    codState: order.codState,
    returnState: order.returnState,
    refundState: order.refundState,
    deliveryProvider: order.delivery?.provider ?? null,
    returnCase: returnCase
      ? {
          id: returnCase.id,
          origin: returnCase.origin,
          currentState: returnCase.currentState,
          reasonCode: returnCase.reasonCode,
          createdAt: returnCase.createdAt.toISOString(),
          updatedAt: returnCase.updatedAt.toISOString(),
        }
      : null,
    items: order.items.map((item) => ({
      orderItemId: item.id,
      productName: item.productName,
      variantName: item.productVariantName,
      quantity: item.quantity,
    })),
    inspections: inspections.map((inspection) => ({
      orderItemId: inspection.orderItemId,
      quantity: inspection.quantity,
      disposition: inspection.disposition as CanonicalReturnDisposition,
      unitCost: inspection.unitCost,
      lossAmount: inspection.lossAmount,
      reasonCode: inspection.reasonCode,
      occurredAt: inspection.occurredAt.toISOString(),
    })),
    availableActions: availableActions(order),
  };
}
