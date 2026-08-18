import "server-only";

import { deriveExistingShopBlindIndex } from "@/lib/crypto/protected-record";
import { db } from "@/lib/db";
import { getDeliveryWorkbenchPage } from "@/lib/deliveries/delivery-workbench";
import { trustedActionAllowed } from "@/lib/identity/authorization";
import {
  requireTrustedActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import { getReturnWorkbenchPage } from "@/lib/returns/return-workbench";
import {
  canOpenProtectedOperationalDetail,
  normalizeSearchText,
  rankUniversalSearchCandidates,
  type UniversalSearchCandidate,
} from "@/lib/search/universal-search";

const MAX_RESULTS = 24;
const PROTECTED_MATCH_BUDGET = 32;
const CONVERSATION_SCAN_LIMIT = 350;
const RECENT_MESSAGES_PER_CONVERSATION = 12;

type BlindIndexClient = Parameters<typeof deriveExistingShopBlindIndex>[0];

type RecordCandidate = UniversalSearchCandidate & {
  kind:
    | "order"
    | "customer"
    | "product"
    | "conversation"
    | "delivery"
    | "return";
};

export interface UniversalRecordSearchResponse {
  query: string;
  results: Array<RecordCandidate & { score: number }>;
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

function customerCandidates(
  query: string,
  rows: ReadonlyArray<{
    id: string;
    name: string;
    phone: string;
    wilaya: string | null;
    commune: string | null;
    updatedAt: Date;
  }>,
) {
  return rankUniversalSearchCandidates(
    query,
    rows.map(
      (customer): RecordCandidate => ({
        id: `customer:${customer.id}`,
        kind: "customer",
        label: customer.name,
        sublabel: customer.phone,
        href: `/customers/${customer.id}`,
        keywords: [customer.wilaya ?? "", customer.commune ?? ""],
        updatedAt: customer.updatedAt,
      }),
    ),
    PROTECTED_MATCH_BUDGET,
  );
}

function conversationCandidates(
  query: string,
  rows: ReadonlyArray<{
    id: string;
    contactName: string;
    contactPhone: string | null;
    channel: string;
    lastMessageAt: Date | null;
    updatedAt: Date;
    messages: ReadonlyArray<{ body: string }>;
  }>,
  canReadContact: boolean,
) {
  return rankUniversalSearchCandidates(
    query,
    rows.map((conversation): RecordCandidate => {
      const contactLabel = canReadContact
        ? conversation.contactName
        : `Inbox · ${conversation.id.slice(-6)}`;
      const contactMeta = canReadContact
        ? (conversation.contactPhone ?? conversation.channel)
        : conversation.channel;
      return {
        id: `conversation:${conversation.id}`,
        kind: "conversation",
        label: contactLabel,
        sublabel: contactMeta,
        href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`,
        // Message bodies remain encrypted at rest. The Prisma protection layer
        // decrypts these bounded recent rows only after conversations.read has
        // been proven, then matching happens in process memory.
        keywords: conversation.messages.map((message) => message.body),
        updatedAt: conversation.lastMessageAt ?? conversation.updatedAt,
      };
    }),
    PROTECTED_MATCH_BUDGET,
  );
}

export async function searchUniversalRecords(
  rawQuery: string,
  requestedLimit?: number,
): Promise<UniversalRecordSearchResponse> {
  const startedAt = Date.now();
  const query = normalizeSearchText(rawQuery);
  const limit = clampLimit(requestedLimit);
  if (query.length < 2) {
    return { query, results: [], tookMs: Date.now() - startedAt };
  }

  const actorContext = await requireTrustedActor();
  const canOrders = allowed(actorContext, "orders.read");
  const canCustomers = allowed(actorContext, "customers.read");
  const canReadContact = allowed(actorContext, "customers.contact.read");
  const canProducts = allowed(actorContext, "products.read");
  const canConversations = allowed(actorContext, "conversations.read");
  const canDeliveries = allowed(actorContext, "deliveries.read");

  const [
    customerRows,
    productRows,
    conversationRows,
    deliveryPage,
    returnPage,
    orderPhoneBlindIndex,
  ] = await Promise.all([
    canCustomers && canReadContact
      ? db.customer.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            phone: true,
            wilaya: true,
            commune: true,
            updatedAt: true,
          },
        })
      : Promise.resolve([]),
    canProducts
      ? db.product.findMany({
          where: {
            deletedAt: null,
            OR: [
              { name: { contains: query } },
              { sku: { contains: query } },
            ],
          },
          select: {
            id: true,
            name: true,
            sku: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: PROTECTED_MATCH_BUDGET,
        })
      : Promise.resolve([]),
    canConversations
      ? db.conversation.findMany({
          select: {
            id: true,
            contactName: true,
            contactPhone: true,
            channel: true,
            lastMessageAt: true,
            updatedAt: true,
            messages: {
              orderBy: { timestamp: "desc" },
              take: RECENT_MESSAGES_PER_CONVERSATION,
              select: { body: true },
            },
          },
          orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
          take: CONVERSATION_SCAN_LIMIT,
        })
      : Promise.resolve([]),
    canDeliveries
      ? getDeliveryWorkbenchPage(actorContext, {
          page: 1,
          pageSize: 8,
          q: query,
        })
      : Promise.resolve(null),
    canOrders
      ? getReturnWorkbenchPage(actorContext, {
          page: 1,
          pageSize: 8,
          q: query,
        })
      : Promise.resolve(null),
    canOrders && canReadContact
      ? deriveExistingShopBlindIndex(
          db as unknown as BlindIndexClient,
          query,
          { recordType: "Order", field: "phone" },
          { shopContext: actorContext.shop },
        )
      : Promise.resolve(null),
  ]);

  const customers = customerCandidates(query, customerRows);
  const matchedCustomerIds = customers.map((candidate) =>
    candidate.id.slice("customer:".length),
  );

  const sourceOrderRows = canOrders
    ? await db.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            { orderNumber: { contains: query } },
            { wilaya: { contains: query } },
            ...(orderPhoneBlindIndex
              ? [{ phoneBlindIndex: orderPhoneBlindIndex }]
              : []),
            ...(canReadContact && matchedCustomerIds.length > 0
              ? [{ customerId: { in: matchedCustomerIds } }]
              : []),
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          phone: canReadContact,
          wilaya: true,
          updatedAt: true,
          customer: canReadContact
            ? { select: { name: true, phone: true } }
            : false,
        },
        orderBy: { updatedAt: "desc" },
        take: PROTECTED_MATCH_BUDGET,
      })
    : [];

  const orderRows = sourceOrderRows as unknown as Array<{
    id: string;
    orderNumber: string;
    phone?: string;
    wilaya: string | null;
    updatedAt: Date;
    customer?: { name: string; phone: string } | null;
  }>;

  const orders = rankUniversalSearchCandidates(
    query,
    orderRows.map(
      (order): RecordCandidate => ({
        id: `order:${order.id}`,
        kind: "order",
        label: order.orderNumber,
        sublabel: order.customer?.name ?? order.wilaya ?? undefined,
        href: `/orders/${order.id}`,
        keywords: [
          order.phone ?? "",
          order.customer?.phone ?? "",
          order.wilaya ?? "",
        ],
        updatedAt: order.updatedAt,
        rankBoost: 12,
      }),
    ),
    PROTECTED_MATCH_BUDGET,
  );

  const products = rankUniversalSearchCandidates(
    query,
    productRows.map(
      (product): RecordCandidate => ({
        id: `product:${product.id}`,
        kind: "product",
        label: product.name,
        sublabel: product.sku ?? undefined,
        href: `/products/${product.id}`,
        updatedAt: product.updatedAt,
      }),
    ),
    PROTECTED_MATCH_BUDGET,
  );

  const conversations = conversationCandidates(
    query,
    conversationRows,
    canReadContact,
  );

  const deliveries =
    deliveryPage && canOpenProtectedOperationalDetail(deliveryPage.fieldAccess)
      ? rankUniversalSearchCandidates(
          query,
          deliveryPage.deliveries.map(
            (delivery): RecordCandidate => ({
              id: `delivery:${delivery.id}`,
              kind: "delivery",
              label:
                delivery.trackingNumber ??
                delivery.order?.orderNumber ??
                delivery.id.slice(-8),
              sublabel: [delivery.provider, delivery.order?.orderNumber]
                .filter(Boolean)
                .join(" · "),
              href: `/deliveries/${delivery.id}`,
              updatedAt: delivery.createdAt,
            }),
          ),
          8,
        )
      : [];

  const returns =
    returnPage && canOpenProtectedOperationalDetail(returnPage.fieldAccess)
      ? rankUniversalSearchCandidates(
          query,
          returnPage.returns.map(
            (returnRecord): RecordCandidate => ({
              id: `return:${returnRecord.id}`,
              kind: "return",
              label: returnRecord.order.orderNumber,
              sublabel: `${returnRecord.type} · ${returnRecord.status}`,
              href: `/returns/${returnRecord.id}`,
              updatedAt: returnRecord.createdAt,
            }),
          ),
          8,
        )
      : [];

  const results = rankUniversalSearchCandidates(
    query,
    [
      ...orders,
      ...customers,
      ...products,
      ...conversations,
      ...deliveries,
      ...returns,
    ],
    limit,
  );

  return {
    query,
    results,
    tookMs: Date.now() - startedAt,
  };
}
