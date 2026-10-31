import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveDashboardFieldAccess } from "@/lib/identity/dashboard-projection";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { getConfirmationWorkbenchPage } from "@/lib/orders/confirmation-workbench";
import type { ConnectedPlatformClient } from "./client";
import {
  ORDERS_MAX_ROWS,
  ORDERS_PLAINTEXT_BUDGET,
  ORDERS_WINDOW_DAYS,
  ORDER_ITEMS_PER_ROW,
  type OrderProjectionRow,
  type OrdersProjection,
} from "./contracts";
import {
  PROJECTION_TTL_MS,
  assertSealable,
  nextProjectionSequence,
  resolveRemoteDevice,
  sealAndPutProjection,
} from "./desktop-projection";
import type { ConnectedKeyPair } from "./payload-crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");

export type NoteEntityType = "order" | "conversation";

/** How many internal notes each entity has. A number only, never the text. */
export async function readNoteCounts(
  entityType: NoteEntityType,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await db.collaborationComment.groupBy({
    by: ["entityId"],
    where: { entityType, entityId: { in: [...ids] } },
    _count: { _all: true },
  });
  for (const row of rows) counts.set(row.entityId, row._count._all);
  return counts;
}

/** The comment-aggregate version the phone must send back with a note. */
export async function readNoteVersions(
  entityType: NoteEntityType,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const versions = new Map<string, number>();
  if (ids.length === 0) return versions;
  const keys = ids.map((id) => `${entityType}:${id}`);
  const rows = await db.$queryRaw<Array<{ aggregateId: string; version: number | bigint }>>(
    Prisma.sql`SELECT "aggregateId", "version" FROM "BusinessAggregateVersion"
      WHERE "aggregateType" = 'collaboration-comments' AND "aggregateId" IN (${Prisma.join(keys)})`,
  );
  for (const row of rows) versions.set(row.aggregateId.slice(entityType.length + 1), Number(row.version));
  return versions;
}

type OrderAccess = Readonly<{ contact: boolean; financials: boolean }>;

type OrderSourceRow = Readonly<{
  id: string;
  orderNumber: string;
  status: string;
  version: number;
  createdAt: Date;
  source: unknown;
  wilaya?: string | null;
  phone?: string | null;
  address?: string | null;
  totalPrice?: number | null;
  customer?: Readonly<{ name: string | null }> | null;
  items: ReadonlyArray<Readonly<{ productName: string; quantity: number }>>;
}>;

// A column the member may not see is not selected, so it is never read.
function orderSelect(access: OrderAccess) {
  return {
    id: true,
    orderNumber: true,
    status: true,
    version: true,
    createdAt: true,
    source: true,
    items: { select: { productName: true, quantity: true } },
    wilaya: access.contact,
    phone: access.contact,
    address: access.contact,
    totalPrice: access.financials,
    customer: access.contact ? { select: { name: true } } : false,
  };
}

function toRow(
  src: OrderSourceRow,
  access: OrderAccess,
  counts: ReadonlyMap<string, number>,
  versions: ReadonlyMap<string, number>,
): OrderProjectionRow {
  return {
    id: src.id,
    orderNumber: src.orderNumber,
    status: src.status,
    version: src.version,
    createdAt: src.createdAt.toISOString(),
    ...(access.contact && src.wilaya ? { wilaya: src.wilaya } : {}),
    items: src.items.slice(0, ORDER_ITEMS_PER_ROW).map((item) => ({ name: item.productName, qty: item.quantity })),
    moreCount: Math.max(0, src.items.length - ORDER_ITEMS_PER_ROW),
    source: String(src.source),
    ...(access.financials && typeof src.totalPrice === "number" ? { totalPrice: src.totalPrice } : {}),
    ...(access.contact && src.customer?.name ? { customerName: src.customer.name } : {}),
    ...(access.contact && src.phone ? { phone: src.phone } : {}),
    ...(access.contact && src.address ? { address: src.address } : {}),
    noteCount: counts.get(src.id) ?? 0,
    noteVersion: versions.get(src.id) ?? 0,
  };
}

const EMPTY: OrdersProjection = { orders: [], window: { shown: 0, pendingTotal: 0, truncated: false } };

async function buildOrdersProjection(
  actorContext: TrustedActorContext,
  access: OrderAccess,
  now: Date,
): Promise<OrdersProjection> {
  // The queue already decides what "pending" means and who may see it.
  const queue = await getConfirmationWorkbenchPage(actorContext, { page: 1, pageSize: ORDERS_MAX_ROWS });
  const pendingIds = queue.queue.map((item) => item.id);
  const room = Math.max(0, ORDERS_MAX_ROWS - pendingIds.length);
  const select = orderSelect(access);
  const since = new Date(now.getTime() - ORDERS_WINDOW_DAYS * DAY_MS);
  const [pendingFound, othersFound] = (await Promise.all([
    pendingIds.length > 0 ? db.order.findMany({ where: { id: { in: pendingIds } }, select }) : [],
    // One extra row tells us whether anything was left out.
    db.order.findMany({
      where: { deletedAt: null, status: { notIn: ["pending", "draft"] }, createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: room + 1,
      select,
    }),
  ])) as unknown as [OrderSourceRow[], OrderSourceRow[]];
  const byId = new Map(pendingFound.map((row) => [row.id, row]));
  const pending = pendingIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const others = othersFound.slice(0, room);
  const all = [...pending, ...others];
  const ids = all.map((row) => row.id);
  const [counts, versions] = await Promise.all([
    readNoteCounts("order", ids),
    readNoteVersions("order", ids),
  ]);
  return {
    orders: all.map((row) => toRow(row, access, counts, versions)),
    window: {
      shown: all.length,
      pendingTotal: queue.total,
      truncated: queue.total > pending.length || othersFound.length > room,
    },
  };
}

/** Drops rows from the end (oldest others first) until the payload fits; the window says so. */
export function trimOrdersToBudget(projection: OrdersProjection, budget: number): OrdersProjection {
  if (bytesOf(projection) <= budget) return projection;
  const build = (n: number): OrdersProjection => ({
    orders: projection.orders.slice(0, n),
    window: { shown: n, pendingTotal: projection.window.pendingTotal, truncated: true },
  });
  for (let n = projection.orders.length - 1; n > 0; n -= 1) {
    const candidate = build(n);
    if (bytesOf(candidate) <= budget) return candidate;
  }
  return build(0);
}

export async function publishRemoteOrdersProjection(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  actorContext: TrustedActorContext;
  deviceId: string;
  now?: Date;
}>): Promise<Readonly<{ sequence: number }>> {
  const device = await resolveRemoteDevice(input.client, input.actorContext, input.deviceId);
  const fieldAccess = resolveDashboardFieldAccess(input.actorContext);
  const issuedAt = input.now ?? new Date();
  // No orders.read: nothing is queried; an empty window replaces any older one.
  const built = fieldAccess.orders
    ? await buildOrdersProjection(
        input.actorContext,
        { contact: fieldAccess.customerContact, financials: fieldAccess.orderFinancials },
        issuedAt,
      )
    : EMPTY;
  const payload = trimOrdersToBudget(built, ORDERS_PLAINTEXT_BUDGET);
  assertSealable(payload);
  const sequence = await nextProjectionSequence("orders", device.deviceId);
  await sealAndPutProjection({
    client: input.client,
    desktopKeys: input.desktopKeys,
    actorContext: input.actorContext,
    device,
    kind: "orders",
    payload,
    sequence,
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + PROJECTION_TTL_MS),
  });
  return Object.freeze({ sequence });
}
