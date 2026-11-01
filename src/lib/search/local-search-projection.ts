import "server-only";

import { Prisma } from "@prisma/client";

import {
  deriveExistingShopBlindIndexes,
  deriveShopBlindIndexes,
} from "@/lib/crypto/protected-record";
import { db, shopContext } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  compactSearchText,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
} from "@/lib/search/universal-search";
import { setWarmCapped } from "@/lib/search/warm-cap-state";
import { deliveryProviderConfig } from "@/lib/shared";

const DEFAULT_CANDIDATE_LIMIT = 48;
const MAX_PREFIX_LENGTH = 40;
const GRAM_SIZE = 4;
const PROJECTION_PAGE_SIZE = 400;
const CUSTOMER_RELEVANCE_BOOST = 64;
const CANDIDATE_SCAN_BUDGET = DEFAULT_CANDIDATE_LIMIT * 4;
const STABLE_BUILD_ATTEMPTS = 3;
/** Rows one list search may refresh itself; the rest of a backlog belongs to warmLocalSearchProjection. */
const LIST_SEARCH_DRAIN_ROWS = 8;
/** Sub-selects per token lookup query (SQLite allows 500 terms in one compound select). */
const TOKEN_LOOKUP_CHUNK = 100;
const WARM_BATCH_ATTEMPTS = 3;
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

/**
 * Tokens written before the full Arabic fold (ة/ه, ى/ي, bidi marks, +213) used
 * the old spelling. Until warmLocalSearchProjection has rebuilt every row once
 * (TOKEN_FOLD_REVISION), a query is also tried in that spelling so a customer
 * not rebuilt yet still matches its own name. Remove after one release.
 */
const LEGACY_QUERY_FOLD = { foldLetters: false } as const;
const TOKEN_FOLD_MARKER_ID = "token-fold";
const TOKEN_FOLD_REVISION = 1;

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
  /** candidate id -> fingerprint of the row as indexed; a patch re-reads only the ids whose fingerprint moved. */
  fingerprints: Map<string, string>;
  builtAt: number;
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

/** How often each palette index was built from scratch and how many single rows were patched in place (tests read it). */
const buildStats: Record<ProjectionSlot, { full: number; patchedRows: number }> = {
  product: { full: 0, patchedRows: 0 },
  delivery: { full: 0, patchedRows: 0 },
  return: { full: 0, patchedRows: 0 },
  conversation: { full: 0, patchedRows: 0 },
};

export function projectionBuildStats(): Record<ProjectionSlot, { full: number; patchedRows: number }> {
  return buildStats;
}

/**
 * Every filed key of a cached palette index as sorted "map|key|ids" lines (tests only): an index that was patched
 * must equal, key for key, the one a from-scratch build makes, so a stale key or a left-over id shows as a diff.
 */
export async function projectionIndexShape(shopId: string, slot: ProjectionSlot): Promise<string[]> {
  const entry = shopCache(shopId)[slot];
  if (!entry) return [];
  const index = await entry.promise;
  const lines: string[] = [...index.records.keys()].map((id) => `record|${id}`);
  for (const name of ["keys", "exactKeys", "primaryExactKeys", "byCustomerId"] as const) {
    for (const [key, ids] of index[name]) lines.push(`${name}|${key}|${[...ids].sort().join(",")}`);
  }
  return lines.sort();
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
    buildStats[slot].full += 1;
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
    fingerprints: new Map(),
    builtAt: Date.now(),
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

interface PersistentQueryKeys {
  exactKeys: string[];
  prefixKeys: string[];
  gramKeys: string[];
}

function persistentQueryKeys(
  rawQuery: string,
  options: { foldLetters?: boolean } = {},
): PersistentQueryKeys {
  const query = normalizeSearchText(rawQuery, options);
  const compact = compactSearchText(query, options);
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

type TokenRow = { entityId: string; tokenHash: string };

/**
 * One bounded sub-select per hash, forced onto the (family, tokenHash) index.
 * Without table statistics SQLite prefers the primary-key index (it also holds
 * entityId) and walks every token row of the family to filter tokenHash, which
 * took 200+ ms at 10,000 customers. A LIMIT per hash means one very common token
 * can never use up the rows of another hash of the same search.
 */
export function tokenLookupSql(family: string, hashes: readonly string[]): Prisma.Sql {
  return Prisma.join(
    hashes.map(
      (hash) => Prisma.sql`SELECT "tokenHash", "entityId" FROM (SELECT "tokenHash", "entityId" FROM "SearchProjectionToken" INDEXED BY "SearchProjectionToken_family_tokenHash_idx" WHERE "family" = ${family} AND "tokenHash" = ${hash} LIMIT ${CANDIDATE_SCAN_BUDGET})`,
    ),
    " UNION ALL ",
  );
}

async function tokenRowsByIndex(
  family: string,
  hashes: readonly string[],
): Promise<TokenRow[]> {
  const rows: TokenRow[] = [];
  for (let start = 0; start < hashes.length; start += TOKEN_LOOKUP_CHUNK) {
    const chunk = hashes.slice(start, start + TOKEN_LOOKUP_CHUNK);
    rows.push(...(await db.$queryRaw<TokenRow[]>(tokenLookupSql(family, chunk))));
  }
  return rows;
}

/** Same rows through the model API, if the hinted query cannot run (index missing, client without raw SQL). */
async function tokenRowsByModel(
  family: string,
  hashes: readonly string[],
): Promise<TokenRow[]> {
  return db.searchProjectionToken.findMany({
    where: { family, tokenHash: { in: [...hashes] } },
    select: { entityId: true, tokenHash: true },
    orderBy: { entityId: "asc" },
    take: CANDIDATE_SCAN_BUDGET * hashes.length,
  });
}

/** All hashes of a search; each hash keeps at most CANDIDATE_SCAN_BUDGET ids. */
export async function idsForTokenHashes(
  family: string,
  hashes: readonly string[],
): Promise<Map<string, Set<string>>> {
  const buckets = new Map<string, Set<string>>();
  if (hashes.length === 0) return buckets;
  let rows: TokenRow[];
  try {
    rows = await tokenRowsByIndex(family, hashes);
  } catch (error) {
    logger.warn("search.projection.token-lookup-fallback", {
      failure: error instanceof Error ? error.name : "unknown",
    });
    rows = await tokenRowsByModel(family, hashes);
  }
  for (const row of rows) {
    const bucket = buckets.get(row.tokenHash) ?? new Set<string>();
    if (bucket.size < CANDIDATE_SCAN_BUDGET) bucket.add(row.entityId);
    buckets.set(row.tokenHash, bucket);
  }
  return buckets;
}

async function persistedIdsForQuery(
  family: string,
  reference: typeof CUSTOMER_TOKEN_REFERENCE | typeof ORDER_TOKEN_REFERENCE,
  rawQuery: string,
  unavailableMessage: string,
): Promise<string[]> {
  if (normalizeSearchText(rawQuery).length < 2) return [];
  const full = persistentQueryKeys(rawQuery);
  const legacy = persistentQueryKeys(rawQuery, LEGACY_QUERY_FOLD);
  const keySets =
    JSON.stringify(full) === JSON.stringify(legacy) ? [full] : [full, legacy];
  const hashByKey = await queryTokenHashes(
    keySets.flatMap((keys) => [...keys.exactKeys, ...keys.prefixKeys, ...keys.gramKeys]),
    reference,
    unavailableMessage,
  );
  const bucketByHash = await idsForTokenHashes(family, [...new Set(hashByKey.values())]);
  const bucketFor = (key: string): Set<string> =>
    bucketByHash.get(hashByKey.get(key) ?? "") ?? new Set<string>();
  const selected = new Set<string>();

  for (const keys of keySets) {
    for (const key of keys.exactKeys) appendBounded(selected, bucketFor(key));
    for (const tier of [keys.prefixKeys, keys.gramKeys]) {
      if (tier.length === 0 || selected.size >= CANDIDATE_SCAN_BUDGET) continue;
      const buckets = tier.map(bucketFor).filter((bucket) => bucket.size > 0);
      if (buckets.length === 0) continue;
      let ids = new Set(buckets[0]);
      for (const bucket of buckets.slice(1)) ids = intersect(ids, bucket);
      appendBounded(selected, ids);
    }
  }
  return [...selected];
}

/**
 * Rebuild every customer and order token row once when the stored fold is
 * older than TOKEN_FOLD_REVISION: queue them in the same dirty table the
 * triggers use (revision 0, so live edits are refreshed first) and record the
 * revision in the same transaction. No schema change.
 */
async function ensureTokenFoldRebuild(): Promise<void> {
  const marker = await db.searchProjectionRevision.findUnique({
    where: { id: TOKEN_FOLD_MARKER_ID },
    select: { revision: true },
  });
  if ((marker?.revision ?? 0) >= TOKEN_FOLD_REVISION) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT OR IGNORE INTO "SearchProjectionDirty" ("family", "entityId", "revision") SELECT 'customer', "id", 0 FROM "Customer"`;
    await tx.$executeRaw`INSERT OR IGNORE INTO "SearchProjectionDirty" ("family", "entityId", "revision") SELECT 'order', "id", 0 FROM "Order"`;
    await tx.$executeRaw`INSERT INTO "SearchProjectionRevision" ("id", "revision") VALUES (${TOKEN_FOLD_MARKER_ID}, ${TOKEN_FOLD_REVISION}) ON CONFLICT("id") DO UPDATE SET "revision" = excluded."revision"`;
  });
}

let tokenFoldChecked = false;

async function readyForListSearch(
  refresh: (limit?: number) => Promise<boolean>,
): Promise<void> {
  if (!tokenFoldChecked) {
    await ensureTokenFoldRebuild();
    tokenFoldChecked = true;
  }
  // Only the newest few rows (live edits come first): a backlog of thousands
  // is drained by the warm-up, never inside the request that is typing.
  await refresh(LIST_SEARCH_DRAIN_ROWS);
}

/** Customer ids whose persisted tokens match the text. Empty (never throws) when the search authority is missing. */
export async function persistedCustomerIdsForQuery(query: string): Promise<string[]> {
  try {
    await readyForListSearch(refreshCustomerProjectionBatch);
    return await persistedIdsForQuery(
      CUSTOMER_TOKEN_FAMILY,
      CUSTOMER_TOKEN_REFERENCE,
      query,
      "Customer search blind-index authority is unavailable",
    );
  } catch {
    return [];
  }
}

/** Order ids whose persisted order-number tokens match the text. Empty (never throws) when the search authority is missing. */
export async function persistedOrderIdsForQuery(query: string): Promise<string[]> {
  try {
    await readyForListSearch(refreshOrderProjectionBatch);
    return await persistedIdsForQuery(
      ORDER_TOKEN_FAMILY,
      ORDER_TOKEN_REFERENCE,
      query,
      "Order search blind-index authority is unavailable",
    );
  } catch {
    return [];
  }
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

async function hasDirtyProjectionRows(family: string): Promise<boolean> {
  const row = await db.searchProjectionDirty.findFirst({
    where: { family },
    select: { entityId: true },
  });
  return row !== null;
}

async function refreshCustomerProjectionBatch(
  limit = CUSTOMER_DIRTY_BATCH_SIZE,
): Promise<boolean> {
  const dirty: ProjectionDirtyRow[] = await db.searchProjectionDirty.findMany({
    where: { family: CUSTOMER_TOKEN_FAMILY },
    select: { entityId: true, revision: true },
    orderBy: [{ revision: "desc" }, { entityId: "asc" }],
    take: limit,
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

  return !(await hasDirtyProjectionRows(CUSTOMER_TOKEN_FAMILY));
}

async function refreshOrderProjectionBatch(
  limit = ORDER_DIRTY_BATCH_SIZE,
): Promise<boolean> {
  const dirty: ProjectionDirtyRow[] = await db.searchProjectionDirty.findMany({
    where: { family: ORDER_TOKEN_FAMILY },
    select: { entityId: true, revision: true },
    orderBy: [{ revision: "desc" }, { entityId: "asc" }],
    take: limit,
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

  return !(await hasDirtyProjectionRows(ORDER_TOKEN_FAMILY));
}

/**
 * Refresh batches until nothing is dirty. A batch that fails (SQLite has one
 * writer: a busy database ends in a socket timeout) is tried again a few times
 * before the warm-up gives up, so one slow moment does not leave thousands of rows.
 */
export async function drainDirtyRows(
  refresh: () => Promise<boolean>,
  batchLimit: number,
  family = "projection",
): Promise<void> {
  let failures = 0;
  for (let batch = 0; batch < batchLimit; ) {
    try {
      if (await refresh()) {
        setWarmCapped(family, false);
        return;
      }
      batch += 1;
      failures = 0;
    } catch (error) {
      failures += 1;
      if (failures >= WARM_BATCH_ATTEMPTS) throw error;
    }
  }
  // The cap is a stop, not a finish: the rest stays dirty (searches refresh a few rows each) and the log says so.
  logger.warn("search.projection.warm-capped", { family, batches: batchLimit });
  setWarmCapped(family, true);
}

async function warmCustomerProjection(): Promise<void> {
  await drainDirtyRows(() => refreshCustomerProjectionBatch(), CUSTOMER_WARM_BATCH_LIMIT, "customer");
}

async function warmOrderProjection(): Promise<void> {
  await drainDirtyRows(() => refreshOrderProjectionBatch(), ORDER_WARM_BATCH_LIMIT, "order");
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

async function conversationRows(ids?: readonly string[]): Promise<ProjectedCandidate[]> {
  const out: ProjectedCandidate[] = [];
  const where = ids ? { id: { in: ids.map((id) => id.slice(CONVERSATION_ID_PREFIX.length)) } } : undefined;
  let cursor: string | undefined;

  while (true) {
    const rows = await db.conversation.findMany({
      ...(where ? { where } : {}),
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
      out.push({
        id: `${CONVERSATION_ID_PREFIX}${conversation.id}`,
        entityId: conversation.id,
        kind: "conversation",
        label:
          conversation.contactName?.trim() ||
          conversation.contactPhone?.trim() ||
          `Inbox · ${conversation.id.slice(-6)}`,
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

  return out;
}

/** Ids and change marks only: no contact field is opened, so listing every conversation stays cheap. */
async function conversationStamps(): Promise<Map<string, string>> {
  const rows = await db.conversation.findMany({
    select: { id: true, channel: true, lastMessageAt: true, updatedAt: true },
  });
  return new Map(
    rows.map((row) => [
      `${CONVERSATION_ID_PREFIX}${row.id}`,
      `${row.updatedAt.getTime()}|${row.lastMessageAt?.getTime() ?? ""}|${row.channel}`,
    ]),
  );
}

const conversationSource: ProjectionSource = {
  all: () => conversationRows(),
  stamps: conversationStamps,
  some: (ids) => conversationRows(ids),
};

async function productRows(): Promise<ProjectedCandidate[]> {
  const rows = await db.product.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, sku: true, updatedAt: true },
  });
  return rows.map((product) => ({
      id: `product:${product.id}`,
      entityId: product.id,
      kind: "product" as const,
      label: product.name,
      sublabel: product.sku ?? undefined,
      href: `/products/${product.id}`,
      updatedAt: product.updatedAt,
  }));
}

const productSource: ProjectionSource = { all: productRows };

async function deliveryRows(): Promise<ProjectedCandidate[]> {
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
  return rows.map((delivery) => ({
      id: `delivery:${delivery.id}`,
      entityId: delivery.id,
      kind: "delivery" as const,
      label:
        delivery.trackingNumber ??
        delivery.order.orderNumber ??
        delivery.id.slice(-8),
      sublabel: delivery.order.orderNumber
        ? `${deliveryProviderConfig[delivery.provider]?.label ?? delivery.provider} · \u2066${delivery.order.orderNumber}\u2069`
        : (deliveryProviderConfig[delivery.provider]?.label ?? delivery.provider),
      keywords: [delivery.order.orderNumber ?? ""],
      href: `/deliveries/${delivery.id}`,
      updatedAt: delivery.updatedAt,
  }));
}

const deliverySource: ProjectionSource = { all: deliveryRows };

async function returnRows(): Promise<ProjectedCandidate[]> {
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
  return rows.map((returnRecord) => ({
      id: `return:${returnRecord.id}`,
      entityId: returnRecord.id,
      kind: "return" as const,
      label: returnRecord.order.orderNumber,
      sublabel: `${returnRecord.type} · ${returnRecord.status}`,
      href: `/returns/${returnRecord.id}`,
      updatedAt: returnRecord.updatedAt,
  }));
}

const returnSource: ProjectionSource = { all: returnRows };

const CONVERSATION_ID_PREFIX = "conversation:";
/** More changed rows than this and one full build is cheaper than patching them one by one. */
const PATCH_ROW_LIMIT = 256;
/** Safety net for a column written without a change mark (raw SQL): the index is rebuilt in full at least this often. */
const FULL_REBUILD_MAX_AGE_MS = 10 * 60_000;

interface ProjectionSource {
  /** Every current row as the index holds it. */
  all(): Promise<ProjectedCandidate[]>;
  /** id -> change mark without opening sealed fields; when absent the marks come from all(). */
  stamps?(): Promise<Map<string, string>>;
  /** Only these candidate ids (needs stamps). */
  some?(ids: readonly string[]): Promise<ProjectedCandidate[]>;
}

function candidateFingerprint(row: ProjectedCandidate): string {
  return JSON.stringify(row);
}

async function buildFromSource(source: ProjectionSource): Promise<SearchIndex> {
  const stamps = source.stamps ? await source.stamps() : undefined;
  const rows = await source.all();
  const index = createIndex(rows);
  index.fingerprints = stamps ?? new Map(rows.map((row) => [row.id, candidateFingerprint(row)] as const));
  return index;
}

/** Take one row out of every key bucket it was filed under (the keys are derived the same way they were added). */
function removeCandidate(index: SearchIndex, id: string): void {
  const old = index.records.get(id);
  if (!old) return;
  const scratch = emptyIndex();
  addCandidate(scratch, old);
  for (const name of ["keys", "exactKeys", "primaryExactKeys", "byCustomerId"] as const) {
    for (const key of scratch[name].keys()) {
      const bucket = index[name].get(key);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) index[name].delete(key);
    }
  }
  index.records.delete(id);
}

/**
 * A write moves the slot revision; instead of rebuilding the whole index, only the rows whose mark moved are read and
 * re-filed. Returns null when a full build is the better answer (too many changes, or the index is old).
 */
async function patchProjection(
  slot: ProjectionSlot,
  source: ProjectionSource,
  base: SearchIndex,
): Promise<{ index: SearchIndex; revision: number } | null> {
  if (Date.now() - base.builtAt > FULL_REBUILD_MAX_AGE_MS) return null;
  // Read BEFORE the rows: a write that lands meanwhile only makes the next call patch once more.
  const revision = await committedRevision(slot);
  let loaded: Map<string, ProjectedCandidate> | undefined;
  let wanted: Map<string, string>;
  if (source.stamps) {
    wanted = await source.stamps();
  } else {
    const rows = await source.all();
    loaded = new Map(rows.map((row) => [row.id, row] as const));
    wanted = new Map(rows.map((row) => [row.id, candidateFingerprint(row)] as const));
  }
  const changed: string[] = [];
  for (const [id, mark] of wanted) if (base.fingerprints.get(id) !== mark) changed.push(id);
  const removed: string[] = [];
  for (const id of base.fingerprints.keys()) if (!wanted.has(id)) removed.push(id);
  if (changed.length + removed.length > PATCH_ROW_LIMIT) return null;
  const rows = loaded
    ? changed.map((id) => loaded.get(id)!)
    : changed.length > 0 && source.some
      ? await source.some(changed)
      : [];
  const found = new Set<string>();
  for (const row of rows) {
    removeCandidate(base, row.id);
    addCandidate(base, row);
    base.fingerprints.set(row.id, wanted.get(row.id) ?? candidateFingerprint(row));
    found.add(row.id);
  }
  for (const id of [...removed, ...changed.filter((candidate) => !found.has(candidate))]) {
    removeCandidate(base, id);
    base.fingerprints.delete(id);
  }
  buildStats[slot].patchedRows += changed.length + removed.length;
  return { index: base, revision };
}

async function cached(
  shopId: string,
  slot: ProjectionSlot,
  source: ProjectionSource,
): Promise<SearchIndex> {
  const cache = shopCache(shopId);
  const revision = await committedRevision(slot);
  const existing = cache[slot];
  if (existing?.revision === revision) return existing.promise;

  const previous = existing?.promise;
  const pending: Promise<SearchIndex> = (async () => {
    const base = previous ? await previous.catch(() => undefined) : undefined;
    const patched = base ? await patchProjection(slot, source, base) : null;
    return patched ?? buildStableProjection(slot, () => buildFromSource(source));
  })()
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
    await cached(shopId, "conversation", conversationSource),
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
    await cached(shopId, "product", productSource),
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

/**
 * Contact identity for conversations found by message text, read from the same
 * permission-gated conversation projection that indexes contacts — the search
 * server never decrypts contact fields itself.
 */
export async function projectedConversationContacts(
  shopId: string,
  conversationIds: readonly string[],
): Promise<Map<string, { label: string; sublabel?: string }>> {
  const contacts = new Map<string, { label: string; sublabel?: string }>();
  if (conversationIds.length === 0) return contacts;
  const index = await cached(shopId, "conversation", conversationSource);
  for (const id of new Set(conversationIds)) {
    const row = index.records.get(`conversation:${id}`);
    if (row) contacts.set(id, { label: row.label, sublabel: row.sublabel });
  }
  return contacts;
}

/** Customer name and phone for orders found by number or tracking code. */
export async function projectedCustomerNames(
  shopId: string,
  customerIds: readonly string[],
): Promise<Map<string, { name: string; phone: string | null }>> {
  assertBoundShop(shopId);
  const names = new Map<string, { name: string; phone: string | null }>();
  const ids = [...new Set(customerIds)];
  if (ids.length === 0) return names;
  const rows = await db.customer.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true, phone: true },
  });
  for (const row of rows) names.set(row.id, { name: row.name, phone: row.phone });
  return names;
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
    await cached(shopId, "delivery", deliverySource),
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
    await cached(shopId, "return", returnSource),
    query,
    limit,
  );
}

export async function warmLocalSearchProjection(
  shopId: string,
  scope: SearchProjectionWarmScope,
): Promise<void> {
  assertBoundShop(shopId);
  if (scope.customer || scope.order) {
    try {
      await ensureTokenFoldRebuild();
    } catch (error) {
      // The next warm retries; search keeps serving the rows already indexed.
      logger.warn("search.projection.fold-rebuild-failed", {
        failure: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  const failed: Array<{ branch: string; reason: unknown }> = [];
  const track = async (branch: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (reason) {
      failed.push({ branch, reason });
    }
  };
  const work: Array<Promise<void>> = [];
  // SQLite has one writer. Run together, the customer and order warm-ups made one
  // of them time out (P1008) at 10,000 rows and the rest stayed unindexed, so they take turns.
  if (scope.customer || scope.order) {
    work.push(
      (async () => {
        if (scope.customer) await track("customer", warmCustomerProjection);
        if (scope.order) await track("order", warmOrderProjection);
      })(),
    );
  }
  if (scope.conversation) {
    work.push(track("conversation", () => cached(shopId, "conversation", conversationSource)));
  }
  if (scope.product) work.push(track("product", () => cached(shopId, "product", productSource)));
  if (scope.delivery) work.push(track("delivery", () => cached(shopId, "delivery", deliverySource)));
  if (scope.return) work.push(track("return", () => cached(shopId, "return", returnSource)));
  // Every branch runs to its end first; a failed one is then reported, not hidden.
  await Promise.all(work);
  if (failed.length === 0) return;
  for (const { branch, reason } of failed) {
    logger.warn("search.projection.warm-failed", {
      branch,
      failure: reason instanceof Error ? reason.message : "unknown",
    });
  }
  throw new Error(
    `Search projection warm-up failed: ${failed.map((entry) => entry.branch).join(", ")}`,
    { cause: failed[0]!.reason },
  );
}
