import { ValidationError } from "@/types/errors";

export const ORDER_LIFECYCLE_STATES = [
  "draft",
  "submitted",
  "active",
  "completed",
  "cancelled",
] as const;
export type OrderLifecycleState = (typeof ORDER_LIFECYCLE_STATES)[number];

export const CONFIRMATION_STATES = [
  "not_requested",
  "pending",
  "confirmed",
  "rejected",
] as const;
export type ConfirmationState = (typeof CONFIRMATION_STATES)[number];

export const FULFILLMENT_STATES = [
  "unfulfilled",
  "preparing",
  "ready",
  "shipped",
  "closed",
] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

export const DELIVERY_STATES = [
  "not_created",
  "pending",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "refused",
  "return_in_transit",
  "returned",
] as const;
export type CanonicalDeliveryState = (typeof DELIVERY_STATES)[number];

export const INVENTORY_STATES = [
  "unreserved",
  "reserved",
  "outbound",
  "return_pending_receipt",
  "return_pending_inspection",
  "settled",
] as const;
export type OrderInventoryState = (typeof INVENTORY_STATES)[number];

export const COD_STATES = [
  "not_expected",
  "receivable",
  "collected",
  "partially_remitted",
  "remitted",
  "disputed",
  "partially_refunded",
  "refunded",
  "corrected",
] as const;
export type CodFinancialState = (typeof COD_STATES)[number];

export const RETURN_STATES = [
  "none",
  "awaiting_return",
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "in_transit",
  "received",
  "inspected",
  "completed",
] as const;
export type ReturnLifecycleState = (typeof RETURN_STATES)[number];

export const REFUND_STATES = [
  "none",
  "pending",
  "partially_refunded",
  "refunded",
  "partially_reversed",
  "reversed",
] as const;
export type RefundLifecycleState = (typeof REFUND_STATES)[number];

export interface CanonicalBusinessState {
  order: OrderLifecycleState;
  confirmation: ConfirmationState;
  fulfillment: FulfillmentState;
  delivery: CanonicalDeliveryState;
  inventory: OrderInventoryState;
  cod: CodFinancialState;
  returns: ReturnLifecycleState;
  refund: RefundLifecycleState;
}

export interface BusinessAggregateRef {
  type: string;
  id: string;
  expectedVersion: number;
}

export interface BusinessCommandEnvelope<TPayload> {
  idempotencyKey: string;
  commandType: string;
  aggregate: BusinessAggregateRef;
  actor: string;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export interface TrustedAuditFact {
  action: string;
  entity: string;
  entityId: string;
  before?: Readonly<Record<string, unknown>> | null;
  after?: Readonly<Record<string, unknown>> | null;
  metadata?: Readonly<Record<string, unknown>> | null;
}

export interface DomainEventFact {
  key: string;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  occurredAt?: Date;
}

export interface OutboxIntentFact {
  effectKey: string;
  effectType: string;
  payload: Readonly<Record<string, unknown>>;
  nextAttemptAt?: Date;
}

export interface OpenReservationFact {
  operation: "open";
  id: string;
  reservationKey: string;
  orderId: string;
  orderItemId?: string;
  productId: string;
  productVariantId?: string;
  quantity: number;
}

export interface CloseReservationFact {
  operation: "release" | "consume" | "cancel";
  id: string;
}

export type InventoryReservationFact = OpenReservationFact | CloseReservationFact;

export interface InventoryMovementFact {
  movementKey: string;
  movementType: string;
  orderId?: string;
  orderItemId?: string;
  reservationId?: string;
  productId: string;
  productVariantId?: string;
  quantity: number;
  fromPosition?: string;
  toPosition?: string;
  reason: string;
  occurredAt?: Date;
}

export interface FinancialMovementFact {
  movementKey: string;
  movementType: string;
  orderId?: string;
  settlementId?: string;
  amount: number;
  currency: "DZD";
  counterparty?: string;
  reference?: string;
  reason: string;
  occurredAt?: Date;
}

export interface CompensationFact {
  key: string;
  type: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface BusinessCommandOutcome<TResult> {
  result: TResult;
  audit: TrustedAuditFact;
  events: readonly DomainEventFact[];
  outbox?: readonly OutboxIntentFact[];
  reservations?: readonly InventoryReservationFact[];
  inventoryMovements?: readonly InventoryMovementFact[];
  financialMovements?: readonly FinancialMovementFact[];
  projectionInvalidations?: readonly string[];
  compensationFacts?: readonly CompensationFact[];
}

export interface BusinessCommandResult<TResult> {
  commandId: string;
  aggregateVersion: number;
  replayed: boolean;
  result: TResult;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError(`${field} must not be empty`, field);
  }
}

function assertExpectedVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      "aggregate.expectedVersion must be a non-negative safe integer",
      "aggregate.expectedVersion",
    );
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${field} must be a positive safe integer`, field);
  }
}

function assertNonZeroInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new ValidationError(`${field} must be a non-zero safe integer`, field);
  }
}

function assertUnique(values: readonly string[], field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertNonEmpty(value, field);
    if (seen.has(value)) {
      throw new ValidationError(`${field} contains duplicate key '${value}'`, field);
    }
    seen.add(value);
  }
}

export function validateBusinessCommand<TPayload>(
  command: BusinessCommandEnvelope<TPayload>,
): void {
  assertNonEmpty(command.idempotencyKey, "idempotencyKey");
  assertNonEmpty(command.commandType, "commandType");
  assertNonEmpty(command.aggregate.type, "aggregate.type");
  assertNonEmpty(command.aggregate.id, "aggregate.id");
  assertExpectedVersion(command.aggregate.expectedVersion);
  assertNonEmpty(command.actor, "actor");
  assertNonEmpty(command.correlationId, "correlationId");
  if (command.causationId !== undefined) {
    assertNonEmpty(command.causationId, "causationId");
  }
}

export function validateBusinessCommandOutcome<TResult>(
  outcome: BusinessCommandOutcome<TResult>,
): void {
  assertNonEmpty(outcome.audit.action, "audit.action");
  assertNonEmpty(outcome.audit.entity, "audit.entity");
  assertNonEmpty(outcome.audit.entityId, "audit.entityId");

  if (outcome.events.length === 0) {
    throw new ValidationError(
      "A canonical business command must emit at least one domain event",
      "events",
    );
  }

  assertUnique(outcome.events.map((event) => event.key), "events.key");
  for (const event of outcome.events) {
    assertNonEmpty(event.type, "events.type");
  }

  const outbox = outcome.outbox ?? [];
  assertUnique(outbox.map((intent) => intent.effectKey), "outbox.effectKey");
  for (const intent of outbox) {
    assertNonEmpty(intent.effectType, "outbox.effectType");
  }

  const reservations = outcome.reservations ?? [];
  const openReservationKeys = reservations.flatMap((reservation) =>
    reservation.operation === "open" ? [reservation.reservationKey] : [],
  );
  assertUnique(openReservationKeys, "reservations.reservationKey");
  for (const reservation of reservations) {
    assertNonEmpty(reservation.id, "reservations.id");
    if (reservation.operation === "open") {
      assertNonEmpty(reservation.orderId, "reservations.orderId");
      assertNonEmpty(reservation.productId, "reservations.productId");
      assertPositiveInteger(reservation.quantity, "reservations.quantity");
    }
  }

  const inventory = outcome.inventoryMovements ?? [];
  assertUnique(inventory.map((movement) => movement.movementKey), "inventoryMovements.movementKey");
  for (const movement of inventory) {
    assertNonEmpty(movement.movementType, "inventoryMovements.movementType");
    assertNonEmpty(movement.productId, "inventoryMovements.productId");
    assertNonEmpty(movement.reason, "inventoryMovements.reason");
    assertPositiveInteger(movement.quantity, "inventoryMovements.quantity");
  }

  const financial = outcome.financialMovements ?? [];
  assertUnique(financial.map((movement) => movement.movementKey), "financialMovements.movementKey");
  for (const movement of financial) {
    assertNonEmpty(movement.movementType, "financialMovements.movementType");
    assertNonEmpty(movement.reason, "financialMovements.reason");
    assertNonZeroInteger(movement.amount, "financialMovements.amount");
    if (movement.currency !== "DZD") {
      throw new ValidationError("Only integer DZD movements are supported", "financialMovements.currency");
    }
  }

  assertUnique(outcome.projectionInvalidations ?? [], "projectionInvalidations");

  const compensation = outcome.compensationFacts ?? [];
  assertUnique(compensation.map((fact) => fact.key), "compensationFacts.key");
  for (const fact of compensation) {
    assertNonEmpty(fact.type, "compensationFacts.type");
  }
}
