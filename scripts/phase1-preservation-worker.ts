import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

import {
  issueCanonicalRefund,
  reverseCanonicalRefund,
} from "@/lib/accounting/canonical-refund";
import {
  postCanonicalCodSettlement,
  recordCanonicalCodCollection,
} from "@/lib/accounting/canonical-cod";
import { getCanonicalCodWorkspaceSummary } from "@/lib/accounting/canonical-cod-projections";
import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import {
  testAuthenticatedOwnerBusinessPrincipal,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import {
  drainDueCourierBookings,
  getCanonicalCourierPosition,
  ingestCanonicalCourierTrackingEvent,
  queueCanonicalCourierBooking,
} from "@/lib/delivery/canonical-courier";
import {
  requestCanonicalCustomerReturn,
  transitionCanonicalCustomerReturn,
} from "@/lib/orders/canonical-customer-return";
import { getCanonicalCustomerReturnPosition } from "@/lib/orders/canonical-customer-return-projections";
import { executeCanonicalFulfillment } from "@/lib/orders/canonical-fulfillment";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import type { ShopContext } from "@/lib/shops/context";

const CORE_TABLES = [
  "AuditLog",
  "BusinessAggregateVersion",
  "BusinessCommand",
  "CanonicalDeliveryEvent",
  "CanonicalExchangeOrder",
  "CanonicalExchangeRequest",
  "CanonicalExchangeRequestItem",
  "CanonicalRefund",
  "CanonicalRefundReversal",
  "CanonicalReturnCase",
  "CanonicalReturnEvent",
  "CanonicalReturnInspection",
  "CanonicalReturnItem",
  "CodCollection",
  "CodCollectionCorrection",
  "CodSettlement",
  "CodSettlementCorrection",
  "CodSettlementLine",
  "CodSettlementLineMatch",
  "CompensationFact",
  "Customer",
  "Delivery",
  "DomainEvent",
  "FinancialMovement",
  "InventoryMovement",
  "InventoryReservation",
  "Order",
  "OrderItem",
  "OutboxIntent",
  "Product",
  "ProductVariant",
  "ProjectionInvalidation",
  "WhatsAppOutboundEffect",
] as const;

const SENSITIVE_VALUES = [
  "Preservation Customer",
  "0555000999",
  "1 Preservation Street",
] as const;

interface RefundReplayInput {
  orderId: string;
  returnId: string;
  expectedVersion: number;
  amount: number;
  method: "cash";
  reasonCode: string;
  occurredAt: string;
  idempotencyKey: string;
}

interface TrackingReplayInput {
  deliveryId: string;
  provider: "yalidine";
  providerEventId: string;
  status: "delivered";
  occurredAt: string;
  reasonCode: string;
  expectedVersion: number;
  idempotencyKey: string;
}

interface PreservationState {
  orderId: string;
  orderItemId: string;
  deliveryId: string;
  returnId: string;
  refundId: string;
  coreDigest: string;
  coreCounts: Record<string, number>;
  refundReplayInput: RefundReplayInput;
  trackingReplayInput: TrackingReplayInput;
  expected: {
    grossRevenue: number;
    netRevenue: number;
    cogs: number;
    courierFees: number;
    settlementAdjustments: number;
    netProfit: number;
    effectiveRefundAmount: number;
  };
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

const stage = required(process.argv[2], "stage");
const statePath = required(process.argv[3], "state path");
const datasourceUrl = required(process.env.DATABASE_URL, "DATABASE_URL");

const shop: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "preservation",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 1,
  databaseFileId: "preservation.db",
  migrationSetSha256: "d".repeat(64),
});

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

async function tableRows(db: PrismaClient, table: string): Promise<unknown[]> {
  return db.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${table}" ORDER BY rowid`);
}

async function coreSnapshot(db: PrismaClient): Promise<{
  digest: string;
  counts: Record<string, number>;
}> {
  const snapshot: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of CORE_TABLES) {
    const rows = await tableRows(db, table);
    snapshot[table] = rows.map(normalize) as unknown[];
    counts[table] = rows.length;
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
  return { digest, counts };
}

async function assertEncryptedBusinessPayloads(db: PrismaClient): Promise<void> {
  const commandRows = await db.$queryRawUnsafe<Array<{ resultJson: string | null }>>(
    'SELECT "resultJson" FROM "BusinessCommand" ORDER BY rowid',
  );
  const eventRows = await db.$queryRawUnsafe<Array<{ payload: string }>>(
    'SELECT "payloadJson" AS "payload" FROM "DomainEvent" ORDER BY rowid',
  );
  const outboxRows = await db.$queryRawUnsafe<Array<{ payload: string }>>(
    'SELECT "payloadJson" AS "payload" FROM "OutboxIntent" ORDER BY rowid',
  );
  const payloads = [
    ...commandRows.flatMap((row) => (row.resultJson ? [row.resultJson] : [])),
    ...eventRows.map((row) => row.payload),
    ...outboxRows.map((row) => row.payload),
  ];
  if (payloads.length === 0) throw new Error("Expected encrypted business payloads");
  for (const payload of payloads) {
    for (const sensitive of SENSITIVE_VALUES) {
      if (payload.includes(sensitive)) {
        throw new Error(`Sensitive value leaked into persisted business payload: ${sensitive}`);
      }
    }
    const envelope = JSON.parse(payload) as {
      algorithm?: string;
      format?: string;
    };
    if (envelope.algorithm !== "aes-256-gcm" || !envelope.format) {
      throw new Error("Persisted business payload is not a SahelFlow AES-256-GCM envelope");
    }
  }
}

async function seed(db: PrismaClient, context: BusinessPrincipalContext): Promise<void> {
  const category = await db.category.create({
    data: { name: "Preservation Category" },
  });
  const product = await db.product.create({
    data: {
      name: "Preservation Product",
      price: 2500,
      cost: 900,
      stock: 10,
      categoryId: category.id,
      isActive: true,
    },
  });

  const created = await createCanonicalSourceOrder(context, {
    idempotencyKey: "phase1-preservation-create",
    source: "storefront",
    sourceIdentity: "phase1-preservation-store",
    sourceOrderId: "phase1-preservation-order",
    newCustomer: {
      name: SENSITIVE_VALUES[0],
      phone: SENSITIVE_VALUES[1],
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: SENSITIVE_VALUES[2],
    },
    items: [{ productId: product.id, quantity: 2 }],
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: SENSITIVE_VALUES[2],
    phone: SENSITIVE_VALUES[1],
    deliveryCost: 500,
  });
  const orderId = created.result.order.id;
  const orderItem = await db.orderItem.findFirstOrThrow({ where: { orderId } });

  const confirmed = await executeManualOrderDecision(context, {
    orderId,
    decision: "confirm",
    expectedVersion: created.result.order.version,
    idempotencyKey: "phase1-preservation-confirm",
  });
  const packed = await executeCanonicalFulfillment(context, {
    orderId,
    action: "pack",
    expectedVersion: confirmed.result.version,
    idempotencyKey: "phase1-preservation-pack",
  });
  const booking = await queueCanonicalCourierBooking(context, {
    orderId,
    provider: "yalidine",
    expectedVersion: packed.result.version,
    idempotencyKey: "phase1-preservation-booking",
  });
  const drained = await drainDueCourierBookings(context, 1, async () => ({
    success: true,
    trackingId: "YAL-PRESERVATION-1",
    labelUrl: "https://labels.invalid/YAL-PRESERVATION-1.pdf",
    estimatedDelivery: "2026-08-04T10:00:00.000Z",
    cost: 650,
  }));
  if (drained !== 1) throw new Error("Courier booking receipt was not committed");

  let courier = await getCanonicalCourierPosition(context, orderId);
  await ingestCanonicalCourierTrackingEvent(context, {
    deliveryId: booking.result.deliveryId,
    provider: "yalidine",
    providerEventId: "yal-preservation-picked-up",
    status: "picked_up",
    occurredAt: "2026-08-01T08:00:00.000Z",
    reasonCode: "provider-yalidine-picked-up",
    expectedVersion: courier.orderVersion,
    idempotencyKey: "phase1-preservation-pickup",
  });
  courier = await getCanonicalCourierPosition(context, orderId);
  const trackingReplayInput: TrackingReplayInput = {
    deliveryId: booking.result.deliveryId,
    provider: "yalidine",
    providerEventId: "yal-preservation-delivered",
    status: "delivered",
    occurredAt: "2026-08-02T08:00:00.000Z",
    reasonCode: "provider-yalidine-delivered",
    expectedVersion: courier.orderVersion,
    idempotencyKey: "phase1-preservation-delivered",
  };
  await ingestCanonicalCourierTrackingEvent(context, trackingReplayInput);

  courier = await getCanonicalCourierPosition(context, orderId);
  const collected = await recordCanonicalCodCollection(context, {
    orderId,
    expectedVersion: courier.orderVersion,
    amount: 5500,
    provider: "yalidine",
    reference: "COL-PRESERVATION-1",
    collectedAt: new Date("2026-08-03T08:00:00.000Z"),
    idempotencyKey: "phase1-preservation-collection",
  });
  const settlement = await postCanonicalCodSettlement(context, {
    provider: "yalidine",
    externalReference: "REM-PRESERVATION-1",
    receivedAt: new Date("2026-08-04T08:00:00.000Z"),
    idempotencyKey: "phase1-preservation-settlement",
    lines: [
      {
        providerLineReference: "REM-PRESERVATION-LINE-1",
        orderId,
        expectedVersion: collected.result.version,
        grossRemittedAmount: 5500,
        feeAmount: 300,
        adjustmentAmount: 50,
        isFinal: true,
      },
    ],
  });
  const settledVersion = settlement.result.lines[0]?.orderVersion;
  if (!settledVersion) throw new Error("Settlement did not return an order version");

  const requested = await requestCanonicalCustomerReturn(context, {
    orderId,
    expectedVersion: settledVersion,
    caseType: "return",
    reasonCode: "customer-requested-return",
    items: [{ orderItemId: orderItem.id, quantity: 1 }],
    occurredAt: new Date("2026-08-05T08:00:00.000Z"),
    idempotencyKey: "phase1-preservation-return-request",
  });
  let returnVersion = requested.result.orderVersion;
  for (const transition of [
    ["approve", "phase1-preservation-return-approve"],
    ["mark_in_transit", "phase1-preservation-return-transit"],
    ["receive", "phase1-preservation-return-receive"],
  ] as const) {
    const result = await transitionCanonicalCustomerReturn(context, {
      orderId,
      returnId: requested.result.returnId,
      action: transition[0],
      expectedVersion: returnVersion,
      reasonCode: transition[1],
      occurredAt: new Date("2026-08-05T09:00:00.000Z"),
      idempotencyKey: transition[1],
    });
    returnVersion = result.result.orderVersion;
  }
  const inspected = await transitionCanonicalCustomerReturn(context, {
    orderId,
    returnId: requested.result.returnId,
    action: "inspect",
    expectedVersion: returnVersion,
    reasonCode: "phase1-preservation-return-inspect",
    occurredAt: new Date("2026-08-05T10:00:00.000Z"),
    items: [
      {
        orderItemId: orderItem.id,
        quantity: 1,
        disposition: "available",
      },
    ],
    idempotencyKey: "phase1-preservation-return-inspect",
  });
  const completed = await transitionCanonicalCustomerReturn(context, {
    orderId,
    returnId: requested.result.returnId,
    action: "complete",
    expectedVersion: inspected.result.orderVersion,
    reasonCode: "phase1-preservation-return-complete",
    occurredAt: new Date("2026-08-05T11:00:00.000Z"),
    idempotencyKey: "phase1-preservation-return-complete",
  });

  const refundReplayInput: RefundReplayInput = {
    orderId,
    returnId: requested.result.returnId,
    expectedVersion: completed.result.orderVersion,
    amount: 1000,
    method: "cash",
    reasonCode: "phase1-preservation-refund",
    occurredAt: "2026-08-06T08:00:00.000Z",
    idempotencyKey: "phase1-preservation-refund",
  };
  const refund = await issueCanonicalRefund(context, {
    ...refundReplayInput,
    occurredAt: new Date(refundReplayInput.occurredAt),
  });
  await reverseCanonicalRefund(context, {
    orderId,
    refundId: refund.result.refundId,
    expectedVersion: refund.result.orderVersion,
    amount: 400,
    reasonCode: "phase1-preservation-refund-reversal",
    occurredAt: new Date("2026-08-06T09:00:00.000Z"),
    idempotencyKey: "phase1-preservation-refund-reversal",
  });

  await assertEncryptedBusinessPayloads(db);
  const core = await coreSnapshot(db);
  const state: PreservationState = {
    orderId,
    orderItemId: orderItem.id,
    deliveryId: booking.result.deliveryId,
    returnId: requested.result.returnId,
    refundId: refund.result.refundId,
    coreDigest: core.digest,
    coreCounts: core.counts,
    refundReplayInput,
    trackingReplayInput,
    expected: {
      grossRevenue: 5500,
      netRevenue: 4900,
      cogs: 900,
      courierFees: 300,
      settlementAdjustments: 50,
      netProfit: 3750,
      effectiveRefundAmount: 600,
    },
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function verify(
  db: PrismaClient,
  context: BusinessPrincipalContext,
  afterUpdate: boolean,
): Promise<void> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as PreservationState;
  const beforeReplay = await coreSnapshot(db);
  if (beforeReplay.digest !== state.coreDigest) {
    throw new Error(
      `Canonical core digest changed across restart/update: ${beforeReplay.digest} !== ${state.coreDigest}`,
    );
  }
  if (JSON.stringify(beforeReplay.counts) !== JSON.stringify(state.coreCounts)) {
    throw new Error("Canonical fact counts changed across restart/update");
  }

  await assertEncryptedBusinessPayloads(db);
  const cod = await getCanonicalCodWorkspaceSummary(context);
  if (cod.counts.remitted !== 1 || cod.totals.grossRemitted !== 5500) {
    throw new Error("Canonical COD projection did not survive restart/update");
  }
  const returns = await getCanonicalCustomerReturnPosition(context, state.orderId);
  if (
    returns.returnCase?.currentState !== "completed" ||
    returns.effectiveRefundAmount !== state.expected.effectiveRefundAmount
  ) {
    throw new Error("Canonical return/refund projection did not survive restart/update");
  }
  const courier = await getCanonicalCourierPosition(context, state.orderId);
  if (
    courier.delivery?.trackingNumber !== "YAL-PRESERVATION-1" ||
    courier.effect?.state !== "succeeded" ||
    courier.deliveryState !== "delivered"
  ) {
    throw new Error("Courier receipt/effect did not survive restart/update");
  }

  const refundReplay = await issueCanonicalRefund(context, {
    ...state.refundReplayInput,
    occurredAt: new Date(state.refundReplayInput.occurredAt),
  });
  if (!refundReplay.replayed || refundReplay.result.refundId !== state.refundId) {
    throw new Error("Refund command replay failed after restart/update");
  }
  const trackingReplay = await ingestCanonicalCourierTrackingEvent(
    context,
    state.trackingReplayInput,
  );
  if (!trackingReplay.replayed) {
    throw new Error("Provider tracking command replay failed after restart/update");
  }
  const afterReplay = await coreSnapshot(db);
  if (afterReplay.digest !== state.coreDigest) {
    throw new Error("Exact command replay mutated canonical facts after restart/update");
  }

  if (afterUpdate) {
    const snapshots = await db.profitabilityCostSnapshot.findMany({
      where: { orderId: state.orderId },
    });
    if (
      snapshots.length !== 1 ||
      snapshots[0]?.orderItemId !== state.orderItemId ||
      snapshots[0]?.unitCost !== 900 ||
      snapshots[0]?.isExact !== false ||
      snapshots[0]?.costBasis !== "legacy_backfill_current_catalog_v1"
    ) {
      throw new Error("In-place profitability migration did not backfill preserved delivery cost");
    }
    const profitability = await getProfitabilityProjection(db as never, {
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2027-01-01T00:00:00.000Z"),
    });
    for (const [key, expected] of Object.entries(state.expected)) {
      if (key === "effectiveRefundAmount") continue;
      if (profitability[key as keyof typeof profitability] !== expected) {
        throw new Error(
          `Profitability projection ${key} changed after update: ${String(
            profitability[key as keyof typeof profitability],
          )} !== ${expected}`,
        );
      }
    }
    if (profitability.estimatedCostItemCount <= 0 || profitability.profitabilityComplete) {
      throw new Error("Backfilled cost quality was not surfaced explicitly");
    }
  }
}

const db = new PrismaClient({ datasourceUrl });
const context: BusinessPrincipalContext = {
  prisma: db as never,
  shop,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "phase1-preservation-owner",
  ),
};

try {
  if (stage === "seed") await seed(db, context);
  else if (stage === "verify-pre-update") await verify(db, context, false);
  else if (stage === "verify-post-update") await verify(db, context, true);
  else throw new Error(`Unknown preservation worker stage: ${stage}`);
} finally {
  await db.$disconnect();
}
