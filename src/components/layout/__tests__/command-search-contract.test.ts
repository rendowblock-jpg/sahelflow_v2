import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("universal command search contract", () => {
  it("uses one cancellable browser request instead of six domain fan-out requests", () => {
    const palette = source("../../command-palette.tsx");

    expect(palette).toContain("/api/search?q=");
    expect(palette).toContain("new AbortController()");
    expect(palette).toContain("controller.abort()");
    for (const legacyEndpoint of [
      "/api/orders/search",
      "/api/customers/search",
      "/api/products/search",
      "/api/conversations/search",
      "/api/delivery?",
      "/api/returns?",
    ]) {
      expect(palette).not.toContain(legacyEndpoint);
    }
  });

  it("binds the command center to relevance ranking and seller-facing presentation", () => {
    const palette = source("../../command-palette.tsx");

    expect(palette).toContain("rankUniversalSearchCandidates");
    expect(palette).toContain('data-universal-search="v2"');
    expect(palette).toContain("recordResults");
    expect(palette).toContain("pageResults");
    expect(palette).toContain("quickAccess");
    expect(palette).toContain("quickHint");
    expect(palette).toContain("KIND_COPY");
    expect(palette).toContain('dir={locale === "ar" ? "rtl" : "ltr"}');
    expect(palette).not.toContain("{item.href}");
  });

  it("uses persistent keyed customer tokens with bounded incremental refresh", () => {
    const server = source("../../../lib/search/universal-search-server.ts");
    const projection = source("../../../lib/search/local-search-projection.ts");
    const migration = source(
      "../../../../prisma/migrations/20260818134500_search_projection_revision/migration.sql",
    );

    expect(server).toContain('allowed(actorContext, "customers.read")');
    expect(server).toContain('allowed(actorContext, "customers.contact.read")');
    expect(server).toContain("searchProjectedCustomers");
    expect(server).not.toContain("db.customer.findMany");
    expect(projection).not.toContain("buildCustomerIndex");
    expect(projection).toContain("CUSTOMER_DIRTY_BATCH_SIZE = 64");
    expect(projection).toContain("searchProjectionDirty.findMany");
    expect(projection).toContain("searchProjectionToken.findMany");
    expect(projection).toContain("deriveExistingShopBlindIndexes");
    expect(projection).toContain("candidateIdsForQuery");
    expect(projection).toContain("searchProjectionRevision.findUnique");
    expect(projection).toContain("buildStableProjection");
    expect(projection).not.toContain("subscribeSearchProjectionMutations");
    expect(projection).not.toContain("Customer search projection is still warming");
    expect(migration).toContain('CREATE TABLE "SearchProjectionRevision"');
    expect(migration).toContain('CREATE TABLE "SearchProjectionToken"');
    expect(migration).toContain('CREATE TABLE "SearchProjectionDirty"');
    expect(migration).toContain(
      'CREATE INDEX "SearchProjectionDirty_family_revision_entity_idx"',
    );
    expect(migration).toContain(
      'AFTER UPDATE OF "name", "phone", "wilaya", "commune", "deletedAt" ON "Customer"',
    );
    expect(migration).toContain("'conversation'");
  });

  it("scopes revision churn to fields that actually affect each projection", () => {
    const migration = source(
      "../../../../prisma/migrations/20260818134500_search_projection_revision/migration.sql",
    );

    expect(migration).toContain(
      'AFTER UPDATE OF "name", "sku", "deletedAt" ON "Product"',
    );
    expect(migration).toContain(
      'AFTER UPDATE OF "orderNumber", "deletedAt" ON "Order"',
    );
    expect(migration).toContain(
      'AFTER UPDATE OF "provider", "trackingNumber", "orderId", "deletedAt" ON "Delivery"',
    );
    expect(migration).toContain(
      'AFTER UPDATE OF "channel", "contactName", "contactPhone", "lastMessageAt" ON "Conversation"',
    );
    expect(migration).not.toContain('AFTER UPDATE ON "Customer"');
    expect(migration).not.toContain('AFTER UPDATE ON "Order"');
  });

  it("indexes the full permitted conversation contact set while keeping recent message search bounded", () => {
    const projection = source("../../../lib/search/local-search-projection.ts");
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(projection).toContain("buildConversationIndex");
    expect(projection).toContain("contactName: true");
    expect(projection).toContain("contactPhone: true");
    expect(projection).toContain("take: PROJECTION_PAGE_SIZE");
    expect(server).toContain("searchProjectedConversations");
    expect(server).toContain("canConversations && canReadContact");
    expect(server).toContain("recentConversationMessageCandidates");
    expect(server).not.toContain("contactName: true");
    expect(server).not.toContain("contactPhone: true");
  });

  it("preserves formatting-insensitive technical identifiers and exact candidates", () => {
    const projection = source("../../../lib/search/local-search-projection.ts");
    const migration = source(
      "../../../../prisma/migrations/20260818134500_search_projection_revision/migration.sql",
    );

    expect(projection).toContain("compactSearchText");
    expect(projection).toContain("MAX_PREFIX_LENGTH");
    expect(projection).toContain("GRAM_SIZE");
    expect(projection).toContain("primaryExactKeys");
    expect(projection).toContain("appendBounded(selected, index.primaryExactKeys");
    expect(projection).toContain("appendBounded(selected, index.exactKeys");
    expect(projection).toContain("buildProductIndex");
    expect(projection).not.toContain("buildOrderIndex");
    expect(projection).toContain("ORDER_DIRTY_BATCH_SIZE = 64");
    expect(projection).toContain("refreshOrderProjectionBatch");
    expect(projection).toContain("queryPersistedOrders");
    expect(projection).toContain('ORDER_TOKEN_FAMILY = "order"');
    expect(projection).toContain("buildDeliveryIndex");
    expect(migration).toContain("SELECT 'order', \"id\", 0 FROM \"Order\"");
    expect(migration).toContain("'order',\n    NEW.\"id\"");
  });

  it("preserves exact protected order-phone search through blind-index authority", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("deriveExistingShopBlindIndex");
    expect(server).toContain('{ recordType: "Order", field: "phone" }');
    expect(server).toContain("phoneBlindIndex");
    expect(server).not.toContain("phone: { contains: query }");
  });

  it("keeps search families fault-isolated and makes degraded empty results truthful", () => {
    const server = source("../../../lib/search/universal-search-server.ts");
    const palette = source("../../command-palette.tsx");

    expect(server).toContain("safeFamily");
    expect(server).toContain("degradedFamilies");
    expect(server).toContain("search.universal.family-degraded");
    expect(palette).toContain("degradedEmpty");
    expect(palette).toContain('copy("degradedTitle")');
    expect(palette).toContain("!degraded &&");
  });

  it("bounds live recent-message search independently from full contact lookup", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("CONVERSATION_SCAN_LIMIT = 64");
    expect(server).toContain("RECENT_MESSAGES_PER_CONVERSATION = 4");
    expect(server).toContain("RECENT_MESSAGE_QUERY_MIN_LENGTH = 3");
    expect(server).toContain("shouldSearchRecentMessages(query)");
    expect(server).toContain("take: CONVERSATION_SCAN_LIMIT");
    expect(server).toContain("take: RECENT_MESSAGES_PER_CONVERSATION");
  });

  it("keeps the latency-sensitive search families parallel while coalescing ordinary typing", () => {
    const server = source("../../../lib/search/universal-search-server.ts");
    const palette = source("../../command-palette.tsx");

    expect(palette).toContain("SEARCH_DEBOUNCE_MS = 160");
    expect(palette).toContain("Page/workspace matches are local");
    expect(server).toContain("] = await Promise.all([");
    expect(server).toContain("technicalOrders");
    expect(server).toContain("exactPhoneOrders");
    expect(server).toContain("const linkedOrders =");
    expect(server).toContain("customersById.size > 0");
  });

  it("gates every protected operational deep link on its real detail authority", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain('allowed(actorContext, "orders.financials.read")');
    expect(server).toContain("canOpenProtectedOperationalDetail");
    expect(server).toContain(
      "canDeliveries && canOpenProtectedOperationalDetail",
    );
    expect(server).toContain("canOrders && canOpenProtectedOperationalDetail");
    expect(server).toContain("searchProjectedOrders(shopId, query, FAMILY_MATCH_BUDGET)");
    expect(server).toContain(
      "canOrders && canOpenProtectedOperationalDetail && canReadContact",
    );
    expect(server).toContain("exactPhoneOrderCandidates(query, actorContext)");
  });

  it("uses the shared technical-value boundary for RTL-safe result identifiers", () => {
    const palette = source("../../command-palette.tsx");

    expect(palette).toContain('from "@/components/i18n/technical-value"');
    expect(palette).toContain("<TechnicalValue");
    expect(palette).toContain("hasTechnicalLabel");
    expect(palette).toContain("hasTechnicalSublabel");
  });

  it("prewarms only permitted projections through one shared browser promise", () => {
    const route = source("../../../app/api/search/route.ts");
    const layout = source("../dashboard-layout.tsx");
    const palette = source("../../command-palette.tsx");
    const client = source("../../../lib/search/universal-search-client.ts");
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(route).toContain("warmUniversalSearchRecords");
    expect(route).toContain("POST /api/search");
    expect(layout).toContain("warmUniversalSearchClient");
    expect(palette).toContain("warmUniversalSearchClient");
    expect(layout).not.toContain('fetch("/api/search"');
    expect(palette).not.toContain('method: "POST"');
    expect(client).toContain("let warmupPromise");
    expect(client).toContain('fetch("/api/search"');
    expect(client).toContain('method: "POST"');
    expect(client).toContain("warmupPromise = null");
    expect(server).toContain("customer: canCustomers && canReadContact");
    expect(server).toContain("conversation: canConversations && canReadContact");
    expect(server).toContain("product: canProducts");
    expect(server).toContain(
      "order: canOrders && canOpenProtectedOperationalDetail",
    );
  });

  it("exposes server timing for Phase 7 latency evidence", () => {
    const route = source("../../../app/api/search/route.ts");

    expect(route).toContain("searchUniversalRecords");
    expect(route).toContain('"Server-Timing"');
    expect(route).toContain("result.tookMs");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("uses the Windows-native Ctrl+K shortcut language", () => {
    const topbar = source("../topbar.tsx");

    expect(topbar).toContain('aria-keyshortcuts="Control+K"');
    expect(topbar).toContain(">Ctrl</span>");
    expect(topbar).not.toContain("<Command");
  });

  it("exposes create actions and recents alongside search and navigation (R4-f)", () => {
    const palette = source("../../command-palette.tsx");
    const createParamDialog = source("../../shared/create-param-dialog.tsx");
    const createParamHook = source("../../../hooks/use-create-param.ts");
    const recentsHook = source("../../../hooks/use-recent-records.ts");
    const tracker = source("../../shared/recent-record-tracker.tsx");
    const orderFormDialog = source("../../orders/order-form-dialog.tsx");
    const ordersPage = source("../../../../src/app/(dashboard)/orders/page.tsx");
    const customersPage = source("../../../../src/app/(dashboard)/customers/page.tsx");
    const productsPage = source("../../../../src/app/(dashboard)/products/page.tsx");
    const orderDetail = source("../../../../src/app/(dashboard)/orders/[id]/page.tsx");
    const customerDetail = source(
      "../../../../src/app/(dashboard)/customers/[id]/page.tsx",
    );
    const productDetail = source(
      "../../../../src/app/(dashboard)/products/[id]/page.tsx",
    );

    // Actions and recents are first-class cmdk items ranked by the shared
    // authority (Arabic normalization included), not navigation-only chrome.
    expect(palette).toContain('heading={copy("actionsSection")}');
    expect(palette).toContain('heading={copy("recentSection")}');
    expect(palette).toContain("CREATE_ACTIONS");
    expect(palette).toContain('buildCreateHref("/orders")');
    expect(palette).toContain('buildCreateHref("/customers")');
    expect(palette).toContain('buildCreateHref("/products")');
    expect(palette).toContain("useRecentRecords(open)");
    expect(palette).toContain("RECENT_RECORDS_VISIBLE");
    expect(palette).toContain("hasInstantMatches");
    expect(palette).toContain('action: "typeAction"');
    // Matching actions/recents count as results — "no result" stays truthful.
    expect(palette).toContain("!degraded &&");
    expect(palette).toContain("&& !hasInstantMatches");

    // One create deep-link contract shared by the palette and all surfaces.
    expect(createParamHook).toContain('export const CREATE_PARAM = "create"');
    expect(createParamHook).toContain("router.replace");
    expect(createParamDialog).toContain("useCreateParam()");
    expect(createParamDialog).toContain("clearCreateParam");
    expect(orderFormDialog).toContain("open?: boolean");
    expect(orderFormDialog).toContain("onOpenChange?: (open: boolean) => void");
    for (const page of [ordersPage, customersPage, productsPage]) {
      expect(page).toContain("create?: string");
      expect(page).toContain("CreateParamDialog");
    }
    expect(ordersPage).toContain('kind="order"');
    expect(customersPage).toContain('kind="customer"');
    expect(productsPage).toContain('kind="product"');

    // Recents journal: detail pages write, the palette reads, storage caps.
    expect(recentsHook).toContain("RECENT_RECORDS_MAX = 8");
    expect(recentsHook).toContain("RECENT_RECORDS_VISIBLE = 5");
    expect(recentsHook).toContain('"sf-recent-records-v1"');
    expect(tracker).toContain("pushRecentRecord");
    for (const page of [orderDetail, customerDetail, productDetail]) {
      expect(page).toContain("RecentRecordTracker");
    }
  });
});