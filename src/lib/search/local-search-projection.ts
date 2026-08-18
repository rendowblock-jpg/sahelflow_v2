import "server-only";

import {
  deriveExistingShopBlindIndexes,
  deriveShopBlindIndexes,
} from "@/lib/crypto/protected-record";
import { db, shopContext } from "@/lib/db";
import {
  compactSearchText,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
} from "@/lib/search/universal-search";

const DEFAULT_CANDIDATE_LIMIT = 48;
const MAX_PREFIX_LENGTH = 40;
const GRAM_SIZE = 4;
const PROJECTION_PAGE_SIZE = 400;
const CUSTOMER_RELEVANCE_BOOST = 64;
const CANDIDATE_SCAN_BUDGET = DEFAULT_CANDIDATE_LIMIT * 4;
const STABLE_BUILD_ATTEMPTS = 3;
const CUSTOMER_DIRTY_BATCH_SIZE = 64;
const CUSTOMER_WARM_BATCH_LIMIT = 1_024;
const CUSTOMER_TOKEN_FAMILY = "customer";
const CUSTOMER_TOKEN_REFERENCE = {
  recordType: "SearchProjection",
  field: "customer-token",
} as const;
const ORDER_DIRTY_BATCH_SIZE = 64;
const ORDER_WARM_BATCH_LIMIT = 1_024;
const ORDER_TOKEN_FAMILY = "order";
const ORDER_TOKEN_REFERENCE = {
  recordType: "SearchProjection",
  field: "order-token",
} as const;

type BlindIndexClient = Parameters<typeof deriveShopBlindIndexes>[0];

type ProjectedCandidate = UniversalSearchCandidate & {
  entityId: string;
  customerId?: string;
};

interface SearchIndex {
  records: Map<string, ProjectedCandidate>;
  keys: Map<string, Set<string>>;
  exactKeys: Map<string, Set<string>>;
  primaryExactKeys: Map<string, Set<string>>;
  byCustomerId: Map<string, Set<string>>;
}

type ProjectionSlot = "product" | "delivery" | "return" | "conversation";

interface CachedProjection {
  revision: number;
  promise: Promise<SearchIndex>;
}

interface ShopProjectionCache {
  product?: CachedProjection;
  delivery?: CachedProjection;
  return?: CachedProjection;
  conversation?: CachedProjection;
}

interface CustomerProjectionRow {
  id: string;
  name: string;
  phone: string;
  wilaya: string | null;
  commune: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface OrderProjectionRow {
  id: string;
  orderNumber: string;
  customerId: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface ProjectionDirtyRow {
  entityId: string;
  revision: number;
}

export interface SearchProjectionWarmScope {
  customer: boolean;
  product: boolean;
  order: boolean;
  delivery: boolean;
  return: boolean;
  conversation: boolean;
}

const globalSearchProjection = globalThis as unknown as {
  sahelflowLocalSearchProjection?: Map<string, ShopProjectionCache>;
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

function assertBoundShop(shopId: string): void {
  if (shopId !== shopContext.shopId) {
    throw new Error("Search projection shop authority mismatch");
  }
}

async function committedRevision(slot: ProjectionSlot): Promise<number> {
  const row = await db.searchProjectionRevision.findUnique({
    where: { id: slot },
    select: { revision: true },
  });
  if (!row) {
    throw new Error(`Missing committed search projection revision for ${slot}`);
  }
  return row.revision;
}

async function buildStableProjection(
  slot: ProjectionSlot,
  build: () => Promise<SearchIndex>,
): Promise<{ index: SearchIndex; revision: number }> {
  for (let attempt = 0; attempt < STABLE_BUILD_ATTEMPTS; attempt += 1) {
    const before = await committedRevision(slot);
    const index = await build();
    const after = await committedRevision(slot);
    if (before === after) return { index, revision: after };
  }
  throw new Error(`Search projection ${slot} changed continuously while building`);
}

function emptyIndex(): SearchIndex {
  return {
    records: new Map(),
    keys: new Map(),
    exactKeys: new Map(),
    primaryExactKeys: new Map(),
    byCustomerId: new Map(),
  };
}

function addMapKey(
  map: Map<string, Set<string>>,
  key: string,
  id: string,
): void {
  if (!key) return;
  const bucket = map.get(key);
  if (bucket) bucket.add(id);
  else map.set(key, new Set([id]));
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

  addMapKey(index.exactKeys, `n:${normalized}`, id);

  for (const word of normalized.split(/\s+/u)) {
    if (word.length < 2) continue;
    for (const prefix of prefixes(word)) addMapKey(index.keys, `w:${prefix}`, id);
  }

  const compact = compactSearchText(normalized);
  if (compact.length >= 2) {
    addMapKey(index.exactKeys, `c:${compact}`, id);
    for (const prefix of prefixes(compact)) addMapKey(index.keys, `c:${prefix}`, id);
    for (const gram of grams(compact)) addMapKey(index.keys, `g:${gram}`, id);
  }
}

function indexPrimaryValue(
  index: SearchIndex,
  id: string,
  rawValue: string,
): void {
  const normalized = normalizeSearchText(rawValue);
  if (!normalized) return;
  addMapKey(index.primaryExactKeys, `n:${normalized}`, id);
  const compact = compactSearchText(normalized);
  if (compact.length >= 2) {
    addMapKey(index.primaryExactKeys, `c:${compact}`, id);
  }
}

function addCandidate(index: SearchIndex, row: ProjectedCandidate): void {
  index.records.set(row.id, row);
  indexPrimaryValue(index, row.id, row.label);
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

function appendBounded(
  target: Set<string>,
  source: Iterable<string>,
  budget = CANDIDATE_SCAN_BUDGET,
): void {
  for (const id of source) {
    target.add(id);
    if (target.size >= budget) return;
  }
}

function candidateIdsForQuery(index: SearchIndex, rawQuery: string): string[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) return [];

  const compact = compactSearchText(query);
  const selected = new Set<string>();

  appendBounded(selected, index.primaryExactKeys.get(`n:${query}`) ?? []);
  if (compact.length >= 2) {
    appendBounded(selected, index.primaryExactKeys.get(`c:${compact}`) ?? []);
  }
  appendBounded(selected, index.exactKeys.get(`n:${query}`) ?? []);
  if (compact.length >= 2) {
    appendBounded(selected, index.exactKeys.get(`c:${compact}`) ?? []);
  }

  const buckets: Set<string>[] = [];
  for (const token of query.split(/\s+/u)) {
    if (token.length < 2) continue;
    const bucket = index.keys.get(`w:${token}`);
    if (bucket) buckets.push(bucket);
  }

  if (compact.length >= 2) {
    const compactBucket = index.keys.get(`c:${compact}`);
    if (compactBucket) buckets.push(compactBucket);
  }
  if (buckets.length > 0 && selected.size < CANDIDATE_SCAN_BUDGET) {
    let ids = new Set(buckets[0]);
    for (const bucket of buckets.slice(1)) ids = intersect(ids, bucket);
    appendBounded(selected, ids);
  }

  if (
    selected.size < CANDIDATE_SCAN_BUDGET &&
    compact.length >= GRAM_SIZE
  ) {
    const gramBuckets = grams(compact)
      .map((gram) => index.keys.get(`g:${gram}`))
      .filter((bucket): bucket is Set<string> => Boolean(bucket));
    if (gramBuckets.length > 0) {
      let ids = new Set(gramBuckets[0]);
      for (const bucket of gramBuckets.slice(1)) ids = intersect(ids, bucket);
      appendBounded(selected, ids);
    }
  }

  return [...selected];
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

function addPersistentValueTokens(
  target: Set<string>,
  rawValue: string,
  primary = false,
): void {
  const normalized = normalizeSearchText(rawValue);
  if (!normalized) return;

  if (primary) target.add(`primary-normalized:${normalized}`);
  target.add(`exact-normalized:${normalized}`);

  for (const word of normalized.split(/\s+/u)) {
    if (word.length < 2) continue;
    for (const prefix of prefixes(word)) {
      target.add(`word-prefix:${prefix}`);
    }
  }

  const compact = compactSearchText(normalized);
  if (compact.length < 2) return;
  if (primary) target.add(`primary-compact:${compact}`);
  target.add(`exact-compact:${compact}`);
  for (const prefix of prefixes(compact)) {
    target.add(`compact-prefix:${prefix}`);
  }
  for (const gram of grams(compact)) {
    target.add(`compact-gram:${gram}`);
  }
}

function persistentQueryKeys(rawQuery: string): {
  exactKeys: string[];
  prefixKeys: string[];
  gramKeys: string[];
} {
  const query = normalizeSearchText(rawQuery);
  const compact = compactSearchText(query);
  return {
    exactKeys: [
      `primary-normalized:${query}`,
      ...(compact.length >= 2 ? [`primary-compact:${compact}`] : []),
      `exact-normalized:${query}`,
      ...(compact.length >= 2 ? [`exact-compact:${compact}`] : []),
    ],
    prefixKeys: [
      ...query
        .split(/\s+/u)
        .filter((token) => token.length >= 2)
        .map((token) => `word-prefix:${token}`),
      ...(compact.length >= 2 ? [`compact-prefix:${compact}`] : []),
    ],
    gramKeys:
      compact.length >= GRAM_SIZE
        ? grams(compact).map((gram) => `compact-gram:${gram}`)
        : [],
  };
}

async function queryTokenHashes(
  keys: readonly string[],
  reference: typeof CUSTOMER_TOKEN_REFERENCE | typeof ORDER_TOKEN_REFERENCE,
  unavailableMessage: string,
): Promise<Map<string, string>> {
  const uniqueKeys = [...new Set(keys)];
  const hashes = await deriveExistingShopBlindIndexes(
    db as unknown as BlindIndexClient,
    uniqueKeys,
    reference,
    { shopContext, normalize: (value) => value },
  );
  if (hashes === null) throw new Error(unavailableMessage);
  return new Map(
    uniqueKeys.map((key, index) => [key, hashes[index]!] as const),
  );
}

async function idsForTokenHash(
  family: string,
  tokenHash: string,
): Promise<Set<string>> {
  const rows = await db.searchProjectionToken.findMany({
    where: { family, tokenHash },
    select: { entityId: true },
    orderBy: { entityId: "asc" },
    take: CANDIDATE_SCAN_BUDGET,
  });
  return new Set(rows.map((row) => row.entityId));
}

async function persistedIdsForQuery(
  family: string,
  reference: typeof CUSTOMER_TOKEN_REFERENCE | typeof ORDER_TOKEN_REFERENCE,
  rawQuery: string,
  unavailableMessage: string,
): Promise<string[]> {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) return [];
  const { exactKeys, prefixKeys, gramKeys } = persistentQueryKeys(query);
  const hashByKey = await queryTokenHashes(
    [...exactKeys, ...prefixKeys, ...gramKeys],
    reference,
    unavailableMessage,
  );
  const selected = new Set<string>();

  for (const key of exactKeys) {
    const hash = hashByKey.get(key);
    if (!hash) continue;
    appendBounded(selected, await idsForTokenHash(family, hash));
    if (selected.size >= CANDIDATE_SCAN_BUDGET) return [...selected];
  }

  if (prefixKeys.length > 0 && selected.size < CANDIDATE_SCAN_BUDGET) {
    const buckets: Set<string>[] = [];
    for (const key of prefixKeys) {
      const hash = hashByKey.get(key);
      if (!hash) continue;
      const bucket = await idsForTokenHash(family, hash);
      if (bucket.size > 0) buckets.push(bucket);
    }
    if (buckets.length > 0) {
      let ids = new Set(buckets[0]);
      for (const bucket of buckets.slice(1)) ids = intersect(ids, bucket);
      appendBounded(selected, ids);
    }
  }

  if (gramKeys.length > 0 && selected.size < CANDIDATE_SCAN_BUDGET) {
    const buckets: Set<string>[] = [];
    for (const key of gramKeys) {
      const hash = hashByKey.get(key);
      if (!hash) continue;
      const bucket = await idsForTokenHash(family, hash);
      if (bucket.size > 0) buckets.push(bucket);
    }
    if (buckets.length > 0) {
      let ids = new Set(buckets[0]);
      for (const bucket of buckets.slice(1)) ids = intersect(ids, bucket);
      appendBounded(selected, ids);
    }
  }

  return [...selected];
}

function customerPersistentTokenKeys(row: CustomerProjectionRow): string[] {
  const keys = new Set<string>();
  addPersistentValueTokens(keys, row.name, true);
  addPersistentValueTokens(keys, row.phone);
  if (row.wilaya) addPersistentValueTokens(keys, row.wilaya);
  if (row.commune) addPersistentValueTokens(keys, row.commune);
  return [...keys];
}

function orderPersistentTokenKeys(row: OrderProjectionRow): string[] {
  const keys = new Set<string>();
  addPersistentValueTokens(keys, row.orderNumber, true);
  return [...keys];
}

async function refreshCustomerProjectionBatch(): Promise<boolean> {
  const dirty: ProjectionDirtyRow[] = await db.searchProjectionDirty.findMany({
    where: { family: CUSTOMER_TOKEN_FAMILY },
    select: { entityId: true, revision: true },
    orderBy: [{ revision: "desc" }, { entityId: "asc" }],
    take: CUSTOMER_DIRTY_BATCH_SIZE,
  });
  if (dirty.length === 0) return true;

  const ids = dirty.map((entry) => entry.entityId);
  const rows: CustomerProjectionRow[] = await db.customer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      phone: true,
      wilaya: true,
      commune: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  const rowsById = new Map(rows.map((row) => [row.id, row] as const));
  const keysById = new Map<string, string[]>();
  const allKeys = new Set<string>();

  for (const dirtyRow of dirty) {
    const customer = rowsById.get(dirtyRow.entityId);
    const keys =
      customer && customer.deletedAt === null
        ? customerPersistentTokenKeys(customer)
        : [];
    keysById.set(dirtyRow.entityId, keys);
    for (const key of keys) allKeys.add(key);
  }

  const uniqueKeys = [...allKeys];
  const hashes = await deriveShopBlindIndexes(
    db as unknown as BlindIndexClient,
    uniqueKeys,
    CUSTOMER_TOKEN_REFERENCE,
    { shopContext, normalize: (value) => value },
  );
  const hashByKey = new Map(
    uniqueKeys.map((key, index) => [key, hashes[index]!] as const),
  );

  await db.$transaction(async (tx) => {
    for (const dirtyRow of dirty) {
      const claim = await tx.searchProjectionDirty.deleteMany({
        where: {
          family: CUSTOMER_TOKEN_FAMILY,
          entityId: dirtyRow.entityId,
          revision: dirtyRow.revision,
        },
      });
      if (claim.count !== 1) continue;

      await tx.searchProjectionToken.deleteMany({
        where: {
          family: CUSTOMER_TOKEN_FAMILY,
          entityId: dirtyRow.entityId,
        },
      });

      const tokenHashes = (keysById.get(dirtyRow.entityId) ?? [])
        .map((key) => hashByKey.get(key))
        .filter((hash): hash is string => Boolean(hash));
      if (tokenHashes.length > 0) {
        await tx.searchProjectionToken.createMany({
          data: tokenHashes.map((tokenHash) => ({
            family: CUSTOMER_TOKEN_FAMILY,
            entityId: dirtyRow.entityId,
            tokenHash,
          })),
        });
      }
    }
  });

  return (
    (await db.searchProjectionDirty.count({
      where: { family: CUSTOMER_TOKEN_FAMILY },
    })) === 0
  );
}

async function refreshOrderProjectionBatch(): Promise<boolean> {
  const dirty: ProjectionDirtyRow[] = await db.searchProjectionDirty.findMany({
    where: { family: ORDER_TOKEN_FAMILY },
    select: { entityId: true, revision: true },
    orderBy: [{ revision: "desc" }, { entityId: "asc" }],
    take: ORDER_DIRTY_BATCH_SIZE,
  });
  if (dirty.length === 0) return true;

  const ids = dirty.map((entry) => entry.entityId);
  const rows: OrderProjectionRow[] = await db.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
  const rowsById = new Map(rows.map((row) => [row.id, row] as const));
  const keysById = new Map<string, string[]>();
  const allKeys = new Set<string>();

  for (const dirtyRow of dirty) {
    const order = rowsById.get(dirtyRow.entityId);
    const keys =
      order && order.deletedAt === null ? orderPersistentTokenKeys(order) : [];
    keysById.set(dirtyRow.entityId, keys);
    for (const key of keys) allKeys.add(key);
  }

  const uniqueKeys = [...allKeys];
  const hashes = await deriveShopBlindIndexes(
    db as unknown as BlindIndexClient,
    uniqueKeys,
    ORDER_TOKEN_REFERENCE,
    { shopContext, normalize: (value) => value },
  );
  const hashByKey = new Map(
    uniqueKeys.map((key, index) => [key, hashes[index]!] as const),
  );

  await db.$transaction(async (tx) => {
    for (const dirtyRow of dirty) {
      const claim = await tx.searchProjectionDirty.deleteMany({
        where: {
          family: ORDER_TOKEN_FAMILY,
          entityId: dirtyRow.entityId,
          revision: dirtyRow.revision,
        },
      });
      if (claim.count !== 1) continue;

      await tx.searchProjectionToken.deleteMany({
        where: {
          family: ORDER_TOKEN_FAMILY,
          entityId: dirtyRow.entityId,
        },
      });

      const tokenHashes = (keysById.get(dirtyRow.entityId) ?? [])
        .map((key) => hashByKey.get(key))
        .filter((hash): hash is string => Boolean(hash));
      if (tokenHashes.length > 0) {
        await tx.searchProjectionToken.createMany({
          data: tokenHashes.map((tokenHash) => ({
            family: ORDER_TOKEN_FAMILY,
            entityId: dirtyRow.entityId,
            tokenHash,
          })),
        });
      }
    }
  });

  return (
    (await db.searchProjectionDirty.count({
      where: { family: ORDER_TOKEN_FAMILY },
    })) === 0
  );
}

async function warmCustomerProjection(): Promise<void> {
  for (let batch = 0; batch < CUSTOMER_WARM_BATCH_LIMIT; batch += 1) {
    if (await refreshCustomerProjectionBatch()) return;
  }
}

async function warmOrderProjection(): Promise<void> {
  for (let batch = 0; batch < ORDER_WARM_BATCH_LIMIT; batch += 1) {
    if (await refreshOrderProjectionBatch()) return;
  }
}

async function queryPersistedCustomers(
  query: string,
  limit = DEFAULT_CANDIDATE_LIMIT,
): Promise<Array<ProjectedCandidate & { score: number }>> {
  const ids = await persistedIdsForQuery(
    CUSTOMER_TOKEN_FAMILY,
    CUSTOMER_TOKEN_REFERENCE,
    query,
    "Customer search blind-index authority is unavailable",
  );
  if (ids.length === 0) return [];
  const rows = await db.customer.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      wilaya: true,
      commune: true,
      updatedAt: true,
    },
  });
  return rankUniversalSearchCandidates(
    query,
    rows.map(
      (customer): ProjectedCandidate => ({
        id: `customer:${customer.id}`,
        entityId: customer.id,
        kind: "customer",
        label: customer.name,
        sublabel: customer.phone,
        href: `/customers/${customer.id}`,
        keywords: [customer.wilaya ?? "", customer.commune ?? ""],
        updatedAt: customer.updatedAt,
        rankBoost: CUSTOMER_RELEVANCE_BOOST,
      }),
    ),
    limit,
  );
}

async function queryPersistedOrders(
  query: string,
  limit = DEFAULT_CANDIDATE_LIMIT,
): Promise<Array<ProjectedCandidate & { score: number }>> {
  const ids = await persistedIdsForQuery(
    ORDER_TOKEN_FAMILY,
    ORDER_TOKEN_REFERENCE,
    query,
    "Order search blind-index authority is unavailable",
  );
  if (ids.length === 0) return [];
  const rows = await db.order.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      updatedAt: true,
    },
  });
  return rankUniversalSearchCandidates(
    query,
    rows.map(
      (order): ProjectedCandidate => ({
        id: `order:${order.id}`,
        entityId: order.id,
        customerId: order.customerId ?? undefined,
        kind: "order",
        label: order.orderNumber,
        href: `/orders/${order.id}`,
        updatedAt: order.updatedAt,
        rankBoost: 12,
      }),
    ),
    limit,
  );
}

async function buildConversationIndex(): Promise<SearchIndex> {
  const index = emptyIndex();
  let cursor: string | undefined;

  while (true) {
    const rows = await db.conversation.findMany({
      select: {
        id: true,
        channel: true,
        contactName: true,
        contactPhone: true,
        lastMessageAt: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
      take: PROJECTION_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    for (const conversation of rows) {
      addCandidate(index, {
        id: `conversation:${conversation.id}`,
        entityId: conversation.id,
        kind: "conversation",
        label: conversation.contactName || `Inbox · ${conversation.id.slice(-6)}`,
        sublabel: conversation.contactPhone ?? conversation.channel,
        href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`,
        keywords: [conversation.channel],
        updatedAt: conversation.lastMessageAt ?? conversation.updatedAt,
      });
    }

    if (rows.length < PROJECTION_PAGE_SIZE) break;
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
      sublabel: delivery.order.orderNumber
        ? `${delivery.provider} · \u2066${delivery.order.orderNumber}\u2069`
        : delivery.provider,
      keywords: [delivery.order.orderNumber ?? ""],
      href: `/deliveries/${delivery.id}`,
      updatedAt: delivery.updatedAt,
    })),
  );
}

async function buildReturnIndex(): Promise<SearchIndex> {
  const rows = await db.return.findMany({
    where: { deletedAt: null },
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

async function cached(
  shopId: string,
  slot: ProjectionSlot,
  build: () => Promise<SearchIndex>,
): Promise<SearchIndex> {
  const cache = shopCache(shopId);
  const revision = await committedRevision(slot);
  const existing = cache[slot];
  if (existing?.revision === revision) return existing.promise;

  const pending: Promise<SearchIndex> = buildStableProjection(slot, build)
    .then(({ index, revision: stableRevision }) => {
      const current = cache[slot];
      if (current?.promise === pending) current.revision = stableRevision;
      return index;
    })
    .catch((error) => {
      if (cache[slot]?.promise === pending) cache[slot] = undefined;
      throw error;
    });
  cache[slot] = { revision, promise: pending };
  return pending;
}

export async function searchProjectedCustomers(
  shopId: string,
  query: string,
  limit?: number,
) {
  assertBoundShop(shopId);
  await refreshCustomerProjectionBatch();
  return queryPersistedCustomers(query, limit);
}

export async function searchProjectedConversations(
  shopId: string,
  query: string,
  limit?: number,
) {
  return queryIndex(
    await cached(shopId, "conversation", buildConversationIndex),
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
  assertBoundShop(shopId);
  await refreshOrderProjectionBatch();
  return queryPersistedOrders(query, limit);
}

export async function projectedOrdersForCustomers(
  shopId: string,
  customerIds: readonly string[],
): Promise<ProjectedCandidate[]> {
  assertBoundShop(shopId);
  const uniqueCustomerIds = [...new Set(customerIds)];
  if (uniqueCustomerIds.length === 0) return [];
  const rows = await db.order.findMany({
    where: {
      customerId: { in: uniqueCustomerIds },
      deletedAt: null,
    },
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: DEFAULT_CANDIDATE_LIMIT * 2,
  });
  return rows.map((order) => ({
    id: `order:${order.id}`,
    entityId: order.id,
    customerId: order.customerId ?? undefined,
    kind: "order" as const,
    label: order.orderNumber,
    href: `/orders/${order.id}`,
    updatedAt: order.updatedAt,
    rankBoost: 12,
  }));
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
  assertBoundShop(shopId);
  const work: Promise<unknown>[] = [];
  if (scope.customer) work.push(warmCustomerProjection());
  if (scope.conversation) {
    work.push(cached(shopId, "conversation", buildConversationIndex));
  }
  if (scope.product) work.push(cached(shopId, "product", buildProductIndex));
  if (scope.order) work.push(warmOrderProjection());
  if (scope.delivery) work.push(cached(shopId, "delivery", buildDeliveryIndex));
  if (scope.return) work.push(cached(shopId, "return", buildReturnIndex));
  await Promise.allSettled(work);
}