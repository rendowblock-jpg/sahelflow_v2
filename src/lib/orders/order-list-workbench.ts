import "server-only";

import type { Prisma } from "@prisma/client";

import { db, shopContext } from "@/lib/db";
import { deriveExistingShopBlindIndex } from "@/lib/crypto/protected-record";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import {
  isImportPendingOrderAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import { batchAssessOrdersForWorkbench } from "@/lib/orders/order-risk-workbench";
import type { OrderStatus } from "@/types/domain";
import type {
  MutationAuthority,
  OrdersWorkbenchAppliedFilters,
  OrdersWorkbenchResponse,
  WorkbenchFieldAccess,
} from "@/types/workbench";
import wilayasData from "../../../data/wilayas.json";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type OrdersWorkbenchSort =
  | "createdAt.desc"
  | "createdAt.asc"
  | "orderNumber.desc"
  | "orderNumber.asc"
  | "totalPrice.desc"
  | "totalPrice.asc";

/**
 * Operational list filters shared by the RSC first paint, /api/orders GET and
 * the filtered CSV/XLSX export. `q` reuses the command-palette search
 * semantics: OR-contains across order number plus (contact-gated) wilaya,
 * phone blind index and customer-name blind index, with a plaintext fallback
 * under NODE_ENV=test.
 */
export interface OrdersWorkbenchFilters {
  status?: OrderStatus;
  /** Free text: order number, customer name, phone, wilaya. */
  q?: string | null;
  /** Algerian wilaya code (1-58) resolved to the stored English wilaya name. */
  wilayaCode?: number | null;
  /** Inclusive createdAt lower bound. Date-only strings cover the whole UTC day. */
  dateFrom?: string | null;
  /** Inclusive createdAt upper bound. Date-only strings cover the whole UTC day. */
  dateTo?: string | null;
  /** Total-price floor. Ignored without orders.financials.read. */
  minTotal?: number | null;
  /** Total-price ceiling. Ignored without orders.financials.read. */
  maxTotal?: number | null;
}

export interface OrdersWorkbenchQuery extends OrdersWorkbenchFilters {
  page?: number;
  pageSize?: number;
  sort?: string | null;
}

interface OrderListSourceRow {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice?: number;
  wilaya?: string;
  phone?: string;
  createdAt: Date;
  source: unknown;
  sourceMetadata: unknown;
  items: Array<{ id: string }>;
  customer?: { name: string | null; phone: string | null } | null;
}

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

export function resolveOrdersWorkbenchAccess(
  actorContext: TrustedActorContext,
): WorkbenchFieldAccess {
  assertTrustedAction(actorContext, "orders.read", {
    shopId: actorContext.shop.shopId,
  });
  const contact = allowed(actorContext, "customers.contact.read");
  const financials = allowed(actorContext, "orders.financials.read");
  const risk =
    allowed(actorContext, "risk.read") &&
    allowed(actorContext, "customers.read") &&
    contact &&
    financials;
  return Object.freeze({
    contact,
    financials,
    risk,
    update: allowed(actorContext, "orders.update"),
    delete: allowed(actorContext, "orders.delete"),
  });
}

function clampPage(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : 1;
}

function clampPageSize(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(value!, MAX_PAGE_SIZE);
}

function normalizedSort(
  raw: string | null | undefined,
  canReadFinancials: boolean,
): OrdersWorkbenchSort {
  switch (raw) {
    case "createdAt.asc":
    case "createdAt.desc":
    case "orderNumber.asc":
    case "orderNumber.desc":
      return raw;
    case "totalPrice.asc":
    case "totalPrice.desc":
      return canReadFinancials ? raw : "createdAt.desc";
    default:
      return "createdAt.desc";
  }
}

function orderByFor(
  sort: OrdersWorkbenchSort,
): Prisma.OrderOrderByWithRelationInput[] {
  const [field, direction] = sort.split(".") as [
    "createdAt" | "orderNumber" | "totalPrice",
    "asc" | "desc",
  ];
  if (field === "orderNumber") {
    return [{ orderNumber: direction }, { id: direction }];
  }
  if (field === "totalPrice") {
    return [{ totalPrice: direction }, { id: direction }];
  }
  return [{ createdAt: direction }, { id: direction }];
}

/** Resolve a raw sort string into the deterministic server order-by clause. */
export function ordersWorkbenchOrderBy(
  raw: string | null | undefined,
  canReadFinancials: boolean,
): Prisma.OrderOrderByWithRelationInput[] {
  return orderByFor(normalizedSort(raw, canReadFinancials));
}

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndex>[0];

const WILAYA_NAMES_BY_CODE = new Map<number, string>(
  (wilayasData as Array<{ code: number; name: string }>).map((wilaya) => [
    wilaya.code,
    wilaya.name,
  ]),
);

async function orderSearchIndexes(q: string) {
  const [phoneIndex, nameIndex] = await Promise.all([
    deriveExistingShopBlindIndex(
      db as unknown as BlindIndexClient,
      q,
      { recordType: "Order", field: "phone" },
      { shopContext },
    ),
    deriveExistingShopBlindIndex(
      db as unknown as BlindIndexClient,
      q.toLowerCase(),
      { recordType: "Customer", field: "name" },
      { shopContext },
    ),
  ]);
  return {
    phoneIndexes: phoneIndex ? [phoneIndex] : [],
    nameIndexes: nameIndex ? [nameIndex] : [],
  };
}

/**
 * Parse a date filter bound. Date-only values (yyyy-mm-dd) resolve to UTC day
 * bounds: start-of-day for the lower edge and exclusive next-day for the upper
 * edge so a seller filtering "to 2026-08-29" keeps that entire day. Full ISO
 * timestamps are used as-is.
 */
function parseDateBound(
  raw: string | null | undefined,
  edge: "start" | "end",
): Date | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const parsed = dateOnly
    ? new Date(`${trimmed}T00:00:00.000Z`)
    : new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!dateOnly || edge === "start") return parsed;
  return new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
}

function normalizeAmount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Compose the operational list `where` clause from the shared filter contract.
 * Contact-gated branches (wilaya, phone, customer name) only apply when the
 * actor may read contact data, and total bounds only apply with financials
 * read, so a restricted actor can never confirm protected values through
 * filter behaviour or counts.
 */
export async function buildOrdersWorkbenchWhere(
  access: Pick<WorkbenchFieldAccess, "contact" | "financials">,
  filters: OrdersWorkbenchFilters,
): Promise<Prisma.OrderWhereInput> {
  const where: Prisma.OrderWhereInput = { deletedAt: null };
  if (filters.status) {
    where.status = filters.status;
  }

  const q = filters.q?.trim() ?? "";
  if (q) {
    const { phoneIndexes, nameIndexes } = await orderSearchIndexes(q);
    const plaintextFallback = process.env.NODE_ENV === "test";
    const branches: Prisma.OrderWhereInput[] = [
      { orderNumber: { contains: q } },
    ];
    if (access.contact) {
      branches.push(
        { wilaya: { contains: q } },
        { phoneBlindIndex: { in: phoneIndexes } },
        { customer: { nameBlindIndex: { in: nameIndexes } } },
      );
      if (plaintextFallback) {
        branches.push(
          { phone: { contains: q } },
          { customer: { name: { contains: q } } },
        );
      }
    }
    const existingAnd = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [...existingAnd, { OR: branches }];
  }

  if (filters.wilayaCode != null && Number.isFinite(filters.wilayaCode)) {
    const wilayaName = WILAYA_NAMES_BY_CODE.get(filters.wilayaCode);
    if (wilayaName) {
      where.wilaya = wilayaName;
    }
  }

  const dateFrom = parseDateBound(filters.dateFrom, "start");
  const dateTo = parseDateBound(filters.dateTo, "end");
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }

  if (access.financials) {
    const minTotal = normalizeAmount(filters.minTotal);
    const maxTotal = normalizeAmount(filters.maxTotal);
    if (minTotal != null || maxTotal != null) {
      where.totalPrice = {
        ...(minTotal != null ? { gte: minTotal } : {}),
        ...(maxTotal != null ? { lte: maxTotal } : {}),
      };
    }
  }

  return where;
}

/**
 * Echo applied filters in the normalized form the client compares with URL
 * state. Total bounds echo as null when the actor lacks financials read — the
 * server never applied them, so the echo must not claim it did.
 */
function echoAppliedFilters(
  access: Pick<WorkbenchFieldAccess, "contact" | "financials">,
  filters: OrdersWorkbenchFilters,
): OrdersWorkbenchAppliedFilters {
  return {
    q: filters.q?.trim() || null,
    wilaya:
      filters.wilayaCode != null && Number.isFinite(filters.wilayaCode)
        ? String(filters.wilayaCode)
        : null,
    dateFrom: filters.dateFrom?.trim() || null,
    dateTo: filters.dateTo?.trim() || null,
    minTotal: access.financials ? normalizeAmount(filters.minTotal) : null,
    maxTotal: access.financials ? normalizeAmount(filters.maxTotal) : null,
  };
}

/**
 * Live per-status counts for the status tabs, respecting the active list
 * filters so the badges stay truthful while a seller drills into a scoped
 * view. `all` is the filtered total (sum of groups, since status is
 * non-nullable).
 */
export async function getOrdersWorkbenchStatusCounts(
  actorContext: TrustedActorContext,
  filters: OrdersWorkbenchFilters = {},
): Promise<{ counts: Record<string, number>; total: number }> {
  const access = resolveOrdersWorkbenchAccess(actorContext);
  const where = await buildOrdersWorkbenchWhere(access, {
    ...filters,
    status: undefined,
  });
  const groups = await db.order.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const group of groups) {
    counts[group.status] = group._count._all;
    total += group._count._all;
  }
  counts.all = total;
  return { counts, total };
}

function mutationAuthority(
  source: unknown,
  sourceMetadata: unknown,
): MutationAuthority {
  if (isTrustedManualOrderAuthority(source, sourceMetadata)) {
    return "canonical_v1";
  }
  if (isImportPendingOrderAuthority(source, sourceMetadata)) {
    return "confirmation_blocked";
  }
  return "legacy_compatibility";
}

export async function getOrdersWorkbenchPage(
  actorContext: TrustedActorContext,
  query: OrdersWorkbenchQuery = {},
): Promise<OrdersWorkbenchResponse> {
  const access = resolveOrdersWorkbenchAccess(actorContext);
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  const sort = normalizedSort(query.sort, access.financials);
  const where = await buildOrdersWorkbenchWhere(access, query);

  const [sourceRows, total] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalPrice: access.financials,
        wilaya: access.contact,
        phone: access.contact,
        createdAt: true,
        source: true,
        sourceMetadata: true,
        items: { select: { id: true } },
        customer: access.contact
          ? { select: { name: true, phone: true } }
          : false,
      },
      orderBy: orderByFor(sort),
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.order.count({ where }),
  ]);

  const rows = sourceRows as unknown as OrderListSourceRow[];
  const orders = rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    totalPrice: access.financials ? (row.totalPrice ?? null) : null,
    wilaya: access.contact ? (row.wilaya ?? null) : null,
    phone: access.contact ? (row.phone ?? null) : null,
    createdAt: row.createdAt,
    items: row.items,
    customer: access.contact
      ? {
          name: row.customer?.name ?? null,
          phone: row.customer?.phone ?? null,
        }
      : null,
    mutationAuthority: mutationAuthority(row.source, row.sourceMetadata),
  }));

  let riskData: OrdersWorkbenchResponse["riskData"];
  if (access.risk && rows.length > 0) {
    const assessments = await batchAssessOrdersForWorkbench(
      { prisma: db, shop: shopContext },
      rows.map((row) => row.id),
    );
    riskData = Object.fromEntries(
      [...assessments.entries()].map(([orderId, assessment]) => [
        orderId,
        { level: assessment.level, score: assessment.score },
      ]),
    );
  }

  return {
    orders,
    ...(riskData ? { riskData } : {}),
    fieldAccess: access,
    appliedFilters: echoAppliedFilters(access, query),
    total,
    hasNextPage: page * pageSize < total,
    page,
    pageSize,
    sort,
  };
}
