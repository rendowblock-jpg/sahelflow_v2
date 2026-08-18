import "server-only";

import { db } from "@/lib/db";
import {
  compactSearchText,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
} from "@/lib/search/universal-search";
import {
  subscribeSearchProjectionMutations,
  type SearchProjectionModel,
} from "@/lib/search/search-projection-events";

const DEFAULT_CANDIDATE_LIMIT = 48;
const MAX_PREFIX_LENGTH = 40;
const GRAM_SIZE = 4;
const CUSTOMER_PROJECTION_PAGE_SIZE = 400;

type ProjectedCandidate = UniversalSearchCandidate & {
  entityId: string;
  customerId?: string;
};

interface SearchIndex {
  records: Map<string, ProjectedCandidate>;
  keys: Map<string, Set<string>>;
  byCustomerId: Map<string, Set<string>>;
}

interface ShopProjectionCache {
  customer?: Promise<SearchIndex>;
  product?: Promise<SearchIndex>;
  order?: Promise<SearchIndex>;
  delivery?: Promise<SearchIndex>;
  return?: Promise<SearchIndex>;
}

export interface SearchProjectionWarmScope {
  customer: boolean;
  product: boolean;
  order: boolean;
  delivery: boolean;
  return: boolean;
}

const globalSearchProjection = globalThis as unknown as {
  sahelflowLocalSearchProjection?: Map<string, ShopProjectionCache>;
  sahelflowLocalSearchProjectionSubscribed?: boolean;
};

function cacheRoot(): Map<string, ShopProjectionCache> {
  return (globalSearchProjection.sahelflowLocalSearchProjection ??= new Map());
}

function shopCache(shopId: string): ShopProjectionCache {
  const root = cacheRoot();
  const current = root.get(shopId);
  if (current) return current;
  const created: ShopProjectionCache = {};
  root.set(shopId, created);
  return created;
}

function projectionSlot(model: SearchProjectionModel): keyof ShopProjectionCache {
  switch (model) {
    case "Customer":
      return "customer";
    case "Product":
      return "product";
    case "Order":
      return "order";
    case "Delivery":
      return "delivery";
    case "Return":
      return "return";
  }
}

function invalidateDependentProjection(
  cache: ShopProjectionCache,
  model: SearchProjectionModel,
): void {
  cache[projectionSlot(model)] = undefined;
  if (model === "Order") {
    cache.delivery = undefined;
    cache.return = undefined;
  }
}

if (!globalSearchProjection.sahelflowLocalSearchProjectionSubscribed) {
  globalSearchProjection.sahelflowLocalSearchProjectionSubscribed = true;
  subscribeSearchProjectionMutations(({ shopId, model }) => {
    const cache = cacheRoot().get(shopId);
    if (cache) invalidateDependentProjection(cache, model);
  });
}

function emptyIndex(): SearchIndex {
  return {
    records: new Map(),
    keys: new Map(),
    byCustomerId: new Map(),
  };
}

function addKey(index: SearchIndex, key: string, id: string): void {
  if (!key) return;
  const bucket = index.keys.get(key);
  if (bucket) bucket.add(id);
  else index.keys.set(key, new Set([id]));
}

function prefixes(value: string): string[] {
  const output: string[] = [];
  const end = Math.min(value.length, MAX_PREFIX_LENGTH);
  for (let length = 2; length <= end; length += 1) {
    output.push(value.slice(0, length));
  }
  return output;
}

function grams(value: string): string[] {
  if (value.length < GRAM_SIZE) return [];
  const output: string[] = [];
  for (let offset = 0; offset <= value.length - GRAM_SIZE; offset += 1) {
    output.push(value.slice(offset, offset + GRAM_SIZE));
  }
  return output;
}

function indexValue(index: SearchIndex, id: string, rawValue: string): void {
  const normalized = normalizeSearchText(rawValue);
  if (!normalized) return;

  for (const word of normalized.split(/\s+/u)) {
    if (word.length < 2) continue;
    for (const prefix of prefixes(word)) addKey(index, `w:${prefix}`, id);
  }

  const compact = compactSearchText(normalized);
  if (compact.length >= 2) {
    for (const prefix of prefixes(compact)) addKey(index, `c:${prefix}`, id);
    for (const gram of grams(compact)) addKey(index, `g:${gram}`, id);
  }
}

function addCandidate(index: SearchIndex, row: ProjectedCandidate): void {
  index.records.set(row.id, row);
  indexValue(index, row.id, row.label);
  if (row.sublabel) indexValue(index, row.id, row.sublabel);
  for (const keyword of row.keywords ?? []) indexValue(index, row.id, keyword);
  if (row.customerId) {
    const bucket = index.byCustomerId.get(row.customerId);
    if (bucket) bucket.add(row.id);
    else index.byCustomerId.set(row.customerId, new Set([row.id]));
  }
}

function createIndex(rows: readonly ProjectedCandidate[]): SearchIndex {
  const index = emptyIndex();
  for (const row of rows) addCandidate(index, row);
  return index;
}

function intersect(left: Set<string>, right: Set<string>): Set<string> {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  return new Set([...small].filter((value) => large.has(value)));
}

function candidateIdsForQuery(index: SearchIndex, rawQuery: string): string[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) return [];

  const buckets: Set<string>[] = [];
  for (const token of query.split(/\s+/u)) {
    if (token.length < 2) continue;
    const bucket = index.keys.get(`w:${token}`);
    if (bucket) buckets.push(bucket);
  }

  const compact = compactSearchText(query);
  if (compact.length >= 2) {
    const compactBucket = index.keys.get(`c:${compact}`);
    if (compactBucket) buckets.push(compactBucket);
  }

  if (buckets.length > 0) {
    let ids = new Set(buckets[0]);
    for (const bucket of buckets.slice(1)) ids = intersect(ids, bucket);
    if (ids.size > 0) {
      return [...ids].slice(0, DEFAULT_CANDIDATE_LIMIT * 4);
    }
  }

  if (compact.length >= GRAM_SIZE) {
    const gramBuckets = grams(compact)
      .map((gram) => index.keys.get(`g:${gram}`))
      .filter((bucket): bucket is Set<string> => Boolean(bucket));
    if (gramBuckets.length > 0) {
      let ids = new Set(gramBuckets[0]);
      for (const bucket of gramBuckets.slice(1)) ids = intersect(ids, bucket);
      return [...ids].slice(0, DEFAULT_CANDIDATE_LIMIT * 4);
    }
  }

  return [];
}

function queryIndex(
  index: SearchIndex,
  query: string,
  limit = DEFAULT_CANDIDATE_LIMIT,
): Array<ProjectedCandidate & { score: number }> {
  const candidates = candidateIdsForQuery(index, query)
    .map((id) => index.records.get(id))
    .filter((row): row is ProjectedCandidate => Boolean(row));
  return rankUniversalSearchCandidates(query, candidates, limit);
}

async function buildCustomerIndex(): Promise<SearchIndex> {
  const index = emptyIndex();
  let cursor: string | undefined;

  while (true) {
    const rows = await db.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        wilaya: true,
        commune: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
      take: CUSTOMER_PROJECTION_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const customer of rows) {
      addCandidate(index, {
        id: `customer:${customer.id}`,
        entityId: customer.id,
        kind: "customer",
        label: customer.name,
        sublabel: customer.phone,
        href: `/customers/${customer.id}`,
        keywords: [customer.wilaya ?? "", customer.commune ?? ""],
        updatedAt: customer.updatedAt,
      });
    }

    if (rows.length < CUSTOMER_PROJECTION_PAGE_SIZE) break;
    cursor = rows.at(-1)?.id;
    if (!cursor) break;
  }

  return index;
}

async function buildProductIndex(): Promise<SearchIndex> {
  const rows = await db.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, sku: true, updatedAt: true },
  });
  return createIndex(
    rows.map((product) => ({
      id: `product:${product.id}`,
      entityId: product.id,
      kind: "product" as const,
      label: product.name,
      sublabel: product.sku ?? undefined,
      href: `/products/${product.id}`,
      updatedAt: product.updatedAt,
    })),
  );
}

async function buildOrderIndex(): Promise<SearchIndex> {
  const rows = await db.order.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      wilaya: true,
      customerId: true,
      updatedAt: true,
    },
  });
  return createIndex(
    rows.map((order) => ({
      id: `order:${order.id}`,
      entityId: order.id,
      customerId: order.customerId,
      kind: "order" as const,
      label: order.orderNumber,
      sublabel: order.wilaya,
      href: `/orders/${order.id}`,
      updatedAt: order.updatedAt,
      rankBoost: 12,
    })),
  );
}

async function buildDeliveryIndex(): Promise<SearchIndex> {
  const rows = await db.delivery.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      provider: true,
      trackingNumber: true,
      updatedAt: true,
      order: { select: { orderNumber: true } },
    },
  });
  return createIndex(
    rows.map((delivery) => ({
      id: `delivery:${delivery.id}`,
      entityId: delivery.id,
      kind: "delivery" as const,
      label:
        delivery.trackingNumber ??
        delivery.order.orderNumber ??
        delivery.id.slice(-8),
      sublabel: [delivery.provider, delivery.order.orderNumber]
        .filter(Boolean)
        .join(" · "),
      href: `/deliveries/${delivery.id}`,
      updatedAt: delivery.updatedAt,
    })),
  );
}

async function buildReturnIndex(): Promise<SearchIndex> {
  const rows = await db.return.findMany({
    select: {
      id: true,
      type: true,
      status: true,
      updatedAt: true,
      order: { select: { orderNumber: true } },
    },
  });
  return createIndex(
    rows.map((returnRecord) => ({
      id: `return:${returnRecord.id}`,
      entityId: returnRecord.id,
      kind: "return" as const,
      label: returnRecord.order.orderNumber,
      sublabel: `${returnRecord.type} · ${returnRecord.status}`,
      href: `/returns/${returnRecord.id}`,
      updatedAt: returnRecord.updatedAt,
    })),
  );
}

function cached(
  shopId: string,
  slot: keyof ShopProjectionCache,
  build: () => Promise<SearchIndex>,
): Promise<SearchIndex> {
  const cache = shopCache(shopId);
  const existing = cache[slot];
  if (existing) return existing;
  const pending = build().catch((error) => {
    if (cache[slot] === pending) cache[slot] = undefined;
    throw error;
  });
  cache[slot] = pending;
  return pending;
}

export async function searchProjectedCustomers(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(
    await cached(shopId, "customer", buildCustomerIndex),
    query,
    limit,
  );
}

export async function searchProjectedProducts(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(
    await cached(shopId, "product", buildProductIndex),
    query,
    limit,
  );
}

export async function searchProjectedOrders(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(await cached(shopId, "order", buildOrderIndex), query, limit);
}

export async function projectedOrdersForCustomers(
  shopId: string,
  customerIds: readonly string[],
): Promise<ProjectedCandidate[]> {
  if (customerIds.length === 0) return [];
  const index = await cached(shopId, "order", buildOrderIndex);
  const ids = new Set<string>();
  for (const customerId of customerIds) {
    for (const id of index.byCustomerId.get(customerId) ?? []) ids.add(id);
  }
  return [...ids]
    .slice(0, DEFAULT_CANDIDATE_LIMIT * 2)
    .map((id) => index.records.get(id))
    .filter((row): row is ProjectedCandidate => Boolean(row));
}

export async function searchProjectedDeliveries(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(
    await cached(shopId, "delivery", buildDeliveryIndex),
    query,
    limit,
  );
}

export async function searchProjectedReturns(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(
    await cached(shopId, "return", buildReturnIndex),
    query,
    limit,
  );
}

export async function warmLocalSearchProjection(
  shopId: string,
  scope: SearchProjectionWarmScope,
): Promise<void> {
  const work: Promise<unknown>[] = [];
  if (scope.customer) work.push(cached(shopId, "customer", buildCustomerIndex));
  if (scope.product) work.push(cached(shopId, "product", buildProductIndex));
  if (scope.order) work.push(cached(shopId, "order", buildOrderIndex));
  if (scope.delivery) work.push(cached(shopId, "delivery", buildDeliveryIndex));
  if (scope.return) work.push(cached(shopId, "return", buildReturnIndex));
  await Promise.allSettled(work);
}
