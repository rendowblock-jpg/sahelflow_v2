import "server-only";

import { deriveExistingShopBlindIndex } from "@/lib/crypto/protected-record";
import { db } from "@/lib/db";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import {
  requireTrustedActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import { logger } from "@/lib/logger";
import {
  projectedOrdersForCustomers,
  searchProjectedConversations,
  searchProjectedCustomers,
  searchProjectedDeliveries,
  searchProjectedOrders,
  searchProjectedProducts,
  searchProjectedReturns,
  warmLocalSearchProjection,
} from "@/lib/search/local-search-projection";
import {
  compactSearchText,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
} from "@/lib/search/universal-search";

const MAX_RESULTS = 24;
const FAMILY_MATCH_BUDGET = 48;
const CONVERSATION_SCAN_LIMIT = 64;
const RECENT_MESSAGES_PER_CONVERSATION = 4;
const RECENT_MESSAGE_QUERY_MIN_LENGTH = 3;

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndex>[0];

type RecordKind =
  | "order"
  | "customer"
  | "product"
  | "conversation"
  | "delivery"
  | "return";

type RecordCandidate = UniversalSearchCandidate & {
  kind: RecordKind;
  entityId?: string;
  customerId?: string;
};

type RecentConversationSearchRow = {
  id: string;
  channel: string;
  lastMessageAt: Date | null;
  updatedAt: Date;
  messages: Array<{ body: string }>;
};

export interface UniversalRecordSearchResponse {
  query: string;
  results: Array<RecordCandidate & { score: number }>;
  degradedFamilies: RecordKind[];
  tookMs: number;
}

function allowed(
  actorContext: TrustedActorContext,
  action: Parameters<typeof trustedActionAllowed>[1],
): boolean {
  return trustedActionAllowed(actorContext, action, {
    shopId: actorContext.shop.shopId,
  });
}

function clampLimit(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return 16;
  return Math.min(value!, MAX_RESULTS);
}

async function safeFamily<T>(
  family: RecordKind,
  fallback: T,
  degraded: Set<RecordKind>,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    degraded.add(family);
    logger.warn("search.universal.family-degraded", {
      family,
      failure: error instanceof Error ? error.name : "unknown",
    });
    return fallback;
  }
}

async function recentConversationMessageCandidates(
  query: string,
): Promise<Array<RecordCandidate & { score: number }>> {
  // Message-body matching is deliberately a small live tail. Contact name/phone
  // lookup is handled by the revision-bound conversation projection. Keeping the
  // live tail tight avoids decrypting a large inbox on every keystroke while
  // retaining useful recent-message discovery.
  const rows: RecentConversationSearchRow[] = await db.conversation.findMany({
    select: {
      id: true,
      channel: true,
      lastMessageAt: true,
      updatedAt: true,
      messages: {
        orderBy: { timestamp: "desc" as const },
        take: RECENT_MESSAGES_PER_CONVERSATION,
        select: { body: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: CONVERSATION_SCAN_LIMIT,
  });

  return rankUniversalSearchCandidates(
    query,
    rows.map(
      (conversation): RecordCandidate => ({
        id: `conversation:${conversation.id}`,
        entityId: conversation.id,
        kind: "conversation",
        label: `Inbox · ${conversation.id.slice(-6)}`,
        sublabel: conversation.channel,
        href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`,
        keywords: conversation.messages.map((message) => message.body),
        updatedAt: conversation.lastMessageAt ?? conversation.updatedAt,
      }),
    ),
    FAMILY_MATCH_BUDGET,
  );
}

function mergeConversationCandidates(
  query: string,
  contactRows: readonly RecordCandidate[],
  recentRows: readonly RecordCandidate[],
): Array<RecordCandidate & { score: number }> {
  const combined = new Map<string, RecordCandidate>();

  for (const candidate of contactRows) combined.set(candidate.id, candidate);
  for (const candidate of recentRows) {
    const existing = combined.get(candidate.id);
    if (!existing) {
      combined.set(candidate.id, candidate);
      continue;
    }
    combined.set(candidate.id, {
      ...existing,
      keywords: [
        ...(existing.keywords ?? []),
        ...(candidate.keywords ?? []),
      ],
    });
  }

  return rankUniversalSearchCandidates(
    query,
    [...combined.values()],
    FAMILY_MATCH_BUDGET,
  );
}

function isLikelyPhoneQuery(query: string): boolean {
  const compact = compactSearchText(query);
  return compact.length >= 6 && /^\d+$/u.test(compact);
}

function shouldSearchRecentMessages(query: string): boolean {
  if (query.length < RECENT_MESSAGE_QUERY_MIN_LENGTH) return false;
  const compact = compactSearchText(query);
  return compact.length >= RECENT_MESSAGE_QUERY_MIN_LENGTH && !/^\d+$/u.test(compact);
}

function decorateOrderCandidates(
  rows: readonly RecordCandidate[],
  customersById: ReadonlyMap<string, RecordCandidate>,
): RecordCandidate[] {
  return rows.map((order) => {
    const customer = order.customerId
      ? customersById.get(order.customerId)
      : undefined;
    return {
      ...order,
      sublabel: customer?.label ?? order.sublabel,
      keywords: [
        ...(order.keywords ?? []),
        customer?.label ?? "",
        customer?.sublabel ?? "",
      ],
    };
  });
}

async function exactPhoneOrderCandidates(
  query: string,
  actorContext: TrustedActorContext,
): Promise<RecordCandidate[]> {
  if (!isLikelyPhoneQuery(query)) return [];

  const phoneBlindIndex = await deriveExistingShopBlindIndex(
    db as unknown as BlindIndexClient,
    compactSearchText(query),
    { recordType: "Order", field: "phone" },
    { shopContext: actorContext.shop },
  );
  if (!phoneBlindIndex) return [];

  const rows = await db.order.findMany({
    where: { deletedAt: null, phoneBlindIndex },
    select: {
      id: true,
      orderNumber: true,
      wilaya: true,
      customerId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: FAMILY_MATCH_BUDGET,
  });

  return rows.map(
    (order): RecordCandidate => ({
      id: `order:${order.id}`,
      entityId: order.id,
      customerId: order.customerId,
      kind: "order",
      label: order.orderNumber,
      sublabel: order.wilaya,
      href: `/orders/${order.id}`,
      keywords: [query],
      updatedAt: order.updatedAt,
      rankBoost: 12,
    }),
  );
}

export async function warmUniversalSearchRecords(): Promise<void> {
  const actorContext = await requireTrustedActor();
  const canOrders = allowed(actorContext, "orders.read");
  const canCustomers = allowed(actorContext, "customers.read");
  const canReadContact = allowed(actorContext, "customers.contact.read");
  const canReadFinancials = allowed(actorContext, "orders.financials.read");
  const canProducts = allowed(actorContext, "products.read");
  const canConversations = allowed(actorContext, "conversations.read");
  const canDeliveries = allowed(actorContext, "deliveries.read");
  const canOpenProtectedOperationalDetail =
    canReadContact && canReadFinancials;

  await warmLocalSearchProjection(actorContext.shop.shopId, {
    customer: canCustomers && canReadContact,
    conversation: canConversations && canReadContact,
    product: canProducts,
    order: canOrders && canOpenProtectedOperationalDetail,
    delivery: canDeliveries && canOpenProtectedOperationalDetail,
    return: canOrders && canOpenProtectedOperationalDetail,
  });
}

export async function searchUniversalRecords(
  rawQuery: string,
  requestedLimit?: number,
): Promise<UniversalRecordSearchResponse> {
  const startedAt = Date.now();
  const query = normalizeSearchText(rawQuery);
  const limit = clampLimit(requestedLimit);
  if (query.length < 2) {
    return {
      query,
      results: [],
      degradedFamilies: [],
      tookMs: Date.now() - startedAt,
    };
  }

  const actorContext = await requireTrustedActor();
  const shopId = actorContext.shop.shopId;
  const canOrders = allowed(actorContext, "orders.read");
  const canCustomers = allowed(actorContext, "customers.read");
  const canReadContact = allowed(actorContext, "customers.contact.read");
  const canReadFinancials = allowed(actorContext, "orders.financials.read");
  const canProducts = allowed(actorContext, "products.read");
  const canConversations = allowed(actorContext, "conversations.read");
  const canDeliveries = allowed(actorContext, "deliveries.read");
  const canOpenProtectedOperationalDetail =
    canReadContact && canReadFinancials;
  const degraded = new Set<RecordKind>();

  // Every query-independent family starts together. The previous implementation
  // waited for all non-order families and only then began order search, adding an
  // avoidable serial leg to the critical path.
  const [
    customers,
    products,
    contactConversations,
    recentConversations,
    deliveries,
    returns,
    technicalOrders,
    exactPhoneOrders,
  ] = await Promise.all([
    canCustomers && canReadContact
      ? safeFamily("customer", [], degraded, () =>
          searchProjectedCustomers(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canProducts
      ? safeFamily("product", [], degraded, () =>
          searchProjectedProducts(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canConversations && canReadContact
      ? safeFamily("conversation", [], degraded, () =>
          searchProjectedConversations(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canConversations && shouldSearchRecentMessages(query)
      ? safeFamily("conversation", [], degraded, () =>
          recentConversationMessageCandidates(query),
        )
      : Promise.resolve([]),
    canDeliveries && canOpenProtectedOperationalDetail
      ? safeFamily("delivery", [], degraded, () =>
          searchProjectedDeliveries(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canOrders && canOpenProtectedOperationalDetail
      ? safeFamily("return", [], degraded, () =>
          searchProjectedReturns(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canOrders && canOpenProtectedOperationalDetail
      ? safeFamily("order", [], degraded, () =>
          searchProjectedOrders(shopId, query, FAMILY_MATCH_BUDGET),
        )
      : Promise.resolve([]),
    canOrders && canOpenProtectedOperationalDetail && canReadContact
      ? safeFamily("order", [], degraded, () =>
          exactPhoneOrderCandidates(query, actorContext),
        )
      : Promise.resolve([]),
  ]);

  const customerRows = customers as RecordCandidate[];
  const customersById = new Map(
    customerRows
      .filter((candidate) => candidate.entityId)
      .map((candidate) => [candidate.entityId!, candidate] as const),
  );

  const conversationRows = mergeConversationCandidates(
    query,
    contactConversations as RecordCandidate[],
    recentConversations as RecordCandidate[],
  );

  // Customer-linked orders are the only truly dependent leg: the customer ids
  // must be known first. Skip the query entirely when customer search produced no
  // ids, and preserve technical/exact-phone order results independently.
  const linkedOrders =
    canOrders &&
    canOpenProtectedOperationalDetail &&
    canReadContact &&
    customersById.size > 0
      ? await safeFamily("order", [], degraded, () =>
          projectedOrdersForCustomers(shopId, [...customersById.keys()]),
        )
      : [];

  const combinedOrders = new Map<string, RecordCandidate>();
  for (const candidate of decorateOrderCandidates(
    [
      ...(technicalOrders as RecordCandidate[]),
      ...(linkedOrders as RecordCandidate[]),
      ...(exactPhoneOrders as RecordCandidate[]),
    ],
    customersById,
  )) {
    const existing = combinedOrders.get(candidate.id);
    if (!existing) {
      combinedOrders.set(candidate.id, candidate);
      continue;
    }
    combinedOrders.set(candidate.id, {
      ...existing,
      ...candidate,
      keywords: [
        ...(existing.keywords ?? []),
        ...(candidate.keywords ?? []),
      ],
    });
  }

  const orders = rankUniversalSearchCandidates(
    query,
    [...combinedOrders.values()],
    FAMILY_MATCH_BUDGET,
  );

  const results = rankUniversalSearchCandidates(
    query,
    [
      ...orders,
      ...customerRows,
      ...(products as RecordCandidate[]),
      ...conversationRows,
      ...(deliveries as RecordCandidate[]),
      ...(returns as RecordCandidate[]),
    ],
    limit,
  );

  return {
    query,
    results,
    degradedFamilies: [...degraded],
    tookMs: Date.now() - startedAt,
  };
}
