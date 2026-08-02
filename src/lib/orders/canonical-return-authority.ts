import "server-only";

import { randomUUID } from "node:crypto";

import type { BusinessTransaction } from "@/lib/business-truth/command-kernel";
import type {
  CodFinancialState,
  RefundLifecycleState,
  ReturnLifecycleState,
} from "@/lib/business-truth/contracts";
import { isTrustedManualOrderAuthority } from "@/lib/orders/manual-order-authority";
import { ConflictError, NotFoundError, ValidationError } from "@/types/errors";

interface ReturnOrderProjectionRow {
  id: string;
  orderNumber: string;
  customerId: string;
  source: string;
  sourceMetadata: string | null;
  status: string;
  version: number | bigint;
  totalPrice: number | bigint;
  deliveryCost: number | bigint | null;
  wilaya: string;
  commune: string;
  address: string;
  phone: string;
  notes: string | null;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  returnState: string | null;
  refundState: string | null;
}

export interface CanonicalReturnOrderItem {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  product: { cost: number | null } | null;
}

export interface CanonicalReturnOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  source: string;
  sourceMetadata: string | null;
  status: string;
  version: number;
  totalPrice: number;
  deliveryCost: number;
  wilaya: string;
  commune: string;
  address: string;
  phone: string;
  notes: string | null;
  fulfillmentState: string | null;
  deliveryState: string | null;
  inventoryState: string | null;
  codState: string | null;
  returnState: string | null;
  refundState: string | null;
  customer: {
    id: string;
    name: string;
    totalSpent: number;
    orderCount: number;
  };
  items: CanonicalReturnOrderItem[];
}

export interface CanonicalReturnCaseAuthority {
  id: string;
  orderId: string;
  origin: string;
  caseType: string;
  currentState: string;
  reasonCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CanonicalReturnProjectionState {
  status: string;
  fulfillmentState: string;
  deliveryState: string;
  inventoryState: string;
  codState: CodFinancialState;
  returnState: ReturnLifecycleState;
  refundState: RefundLifecycleState;
}

interface AmountRow {
  amount: number | bigint | null;
}

function integer(
  value: number | bigint | null | undefined,
  field: string,
): number {
  const output = Number(value ?? 0);
  if (!Number.isSafeInteger(output)) {
    throw new ConflictError(`${field} is outside the supported integer range`);
  }
  return output;
}

export async function loadCanonicalReturnOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<CanonicalReturnOrder> {
  const rows = await tx.$queryRaw<ReturnOrderProjectionRow[]>`
    SELECT
      "id", "orderNumber", "customerId", "source", "sourceMetadata",
      "status", "version", "totalPrice", "deliveryCost", "wilaya",
      "commune", "address", "phone", "notes", "fulfillmentState",
      "deliveryState", "inventoryState", "codState", "returnState",
      "refundState"
    FROM "Order"
    WHERE "id" = ${orderId}
      AND "deletedAt" IS NULL
    LIMIT 1
  `;
  const projection = rows[0];
  if (!projection) throw new NotFoundError("Order", orderId);
  if (!isTrustedManualOrderAuthority(projection.source, projection.sourceMetadata)) {
    throw new ValidationError(
      "Canonical return and refund commands currently govern trusted manual orders only",
      "order.authority",
    );
  }

  const [items, customer] = await Promise.all([
    tx.orderItem.findMany({
      where: { orderId },
      include: { product: { select: { cost: true } } },
      orderBy: { id: "asc" },
    }),
    tx.customer.findFirst({
      where: { id: projection.customerId, deletedAt: null },
      select: {
        id: true,
        name: true,
        totalSpent: true,
        orderCount: true,
      },
    }),
  ]);
  if (!customer) {
    throw new ConflictError("Customer authority is missing for canonical return");
  }

  return {
    ...projection,
    version: integer(projection.version, "order version"),
    totalPrice: integer(projection.totalPrice, "order total"),
    deliveryCost: integer(projection.deliveryCost, "delivery cost"),
    customer,
    items,
  };
}

const RETURN_INVENTORY_STATE: Readonly<Record<string, string>> = {
  none: "settled",
  requested: "settled",
  approved: "settled",
  rejected: "settled",
  cancelled: "settled",
  in_transit: "return_pending_receipt",
  received: "return_pending_inspection",
  inspected: "settled",
  completed: "settled",
};

export function assertDeliveredReturnAuthority(
  order: CanonicalReturnOrder,
): void {
  const returnState = order.returnState ?? "none";
  const expectedInventoryState = RETURN_INVENTORY_STATE[returnState];
  const statusIsValid =
    returnState === "completed"
      ? ["delivered", "returned"].includes(order.status)
      : order.status === "delivered";

  if (
    expectedInventoryState === undefined ||
    !statusIsValid ||
    order.fulfillmentState !== "closed" ||
    order.deliveryState !== "delivered" ||
    order.inventoryState !== expectedInventoryState ||
    !order.codState ||
    order.codState === "not_expected"
  ) {
    throw new ConflictError(
      "Customer return authority has an inconsistent delivery, inventory or return projection",
    );
  }
}

export async function canonicalReceivableAmount(
  tx: BusinessTransaction,
  orderId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<AmountRow[]>`
    SELECT COALESCE(SUM("amount"), 0) AS "amount"
    FROM "FinancialMovement"
    WHERE "orderId" = ${orderId}
      AND "movementType" = 'cod_receivable_created'
      AND "currency" = 'DZD'
  `;
  const amount = integer(rows[0]?.amount, "canonical COD receivable");
  if (amount <= 0) {
    throw new ConflictError(
      "Canonical delivered order has no positive DZD receivable authority",
    );
  }
  return amount;
}

export async function canonicalReturnCaseForOrder(
  tx: BusinessTransaction,
  orderId: string,
): Promise<CanonicalReturnCaseAuthority | null> {
  return tx.canonicalReturnCase.findUnique({
    where: { orderId },
    select: {
      id: true,
      orderId: true,
      origin: true,
      caseType: true,
      currentState: true,
      reasonCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateCanonicalReturnProjection(
  tx: BusinessTransaction,
  order: CanonicalReturnOrder,
  expectedVersion: number,
  next: CanonicalReturnProjectionState,
): Promise<number> {
  const nextVersion = expectedVersion + 1;
  const updated = await tx.$executeRaw`
    UPDATE "Order"
    SET
      "version" = ${nextVersion},
      "status" = ${next.status},
      "fulfillmentState" = ${next.fulfillmentState},
      "deliveryState" = ${next.deliveryState},
      "inventoryState" = ${next.inventoryState},
      "codState" = ${next.codState},
      "returnState" = ${next.returnState},
      "refundState" = ${next.refundState},
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${order.id}
      AND "version" = ${expectedVersion}
      AND "status" = ${order.status}
      AND "deletedAt" IS NULL
  `;
  if (updated !== 1) {
    throw new ConflictError(
      `Order ${order.id} changed while the canonical return command was committed`,
    );
  }
  return nextVersion;
}

export async function setCanonicalReturnCaseState(
  tx: BusinessTransaction,
  returnCase: CanonicalReturnCaseAuthority,
  expectedStates: readonly string[],
  nextState: ReturnLifecycleState,
): Promise<void> {
  const updated = await tx.canonicalReturnCase.updateMany({
    where: {
      id: returnCase.id,
      currentState: { in: [...expectedStates] },
    },
    data: { currentState: nextState },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      "Return case changed while the canonical command was committed",
    );
  }
}

export async function appendCanonicalReturnEvent(
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

export async function effectiveRefundAmount(
  tx: BusinessTransaction,
  orderId: string,
): Promise<{
  issued: number;
  reversed: number;
  effective: number;
}> {
  const rows = await tx.$queryRaw<
    Array<{
      issued: number | bigint | null;
      reversed: number | bigint | null;
    }>
  >`
    SELECT
      COALESCE((
        SELECT SUM(refund."amount")
        FROM "CanonicalRefund" refund
        WHERE refund."orderId" = ${orderId}
      ), 0) AS "issued",
      COALESCE((
        SELECT SUM(reversal."amount")
        FROM "CanonicalRefundReversal" reversal
        INNER JOIN "CanonicalRefund" refund ON refund."id" = reversal."refundId"
        WHERE refund."orderId" = ${orderId}
      ), 0) AS "reversed"
  `;
  const issued = integer(rows[0]?.issued, "issued refund total");
  const reversed = integer(rows[0]?.reversed, "reversed refund total");
  const effective = issued - reversed;
  if (effective < 0) {
    throw new ConflictError("Canonical refund authority has a negative balance");
  }
  return { issued, reversed, effective };
}

export function refundProjectionState(
  effective: number,
  receivable: number,
  reversed: number,
): RefundLifecycleState {
  if (effective === 0) return reversed > 0 ? "reversed" : "none";
  if (effective >= receivable) return "refunded";
  return reversed > 0 ? "partially_reversed" : "partially_refunded";
}

export function returnProjectionKeys(orderId: string): string[] {
  return [
    "orders:list",
    `orders:${orderId}`,
    "returns:list",
    "dashboard:orders",
    "dashboard:accounting",
    "accounting:cod",
    "accounting:profitability",
    "customers:list",
    "products:list",
  ];
}
