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
    expect(palette).toContain("bestMatches");
    expect(palette).toContain("quickAccess");
    expect(palette).toContain("KIND_COPY");
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
    expect(migration).toContain('CREATE TABLE "SearchProjectionRevision"');
    expect(migration).toContain('CREATE TABLE "SearchProjectionToken"');
    expect(migration).toContain('CREATE TABLE "SearchProjectionDirty"');
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
      'AFTER UPDATE OF "orderNumber", "customerId", "deletedAt" ON "Order"',
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

    expect(projection).toContain("compactSearchText");
    expect(projection).toContain("MAX_PREFIX_LENGTH");
    expect(projection).toContain("GRAM_SIZE");
    expect(projection).toContain("primaryExactKeys");
    expect(projection).toContain("appendBounded(selected, index.primaryExactKeys");
    expect(projection).toContain("appendBounded(selected, index.exactKeys");
    expect(projection).toContain("buildProductIndex");
    expect(projection).toContain("buildOrderIndex");
    expect(projection).toContain("buildDeliveryIndex");
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

    expect(server).toContain("CONVERSATION_SCAN_LIMIT = 160");
    expect(server).toContain("RECENT_MESSAGES_PER_CONVERSATION = 8");
    expect(server).toContain("take: CONVERSATION_SCAN_LIMIT");
    expect(server).toContain("take: RECENT_MESSAGES_PER_CONVERSATION");
  });

  it("gates every protected operational deep link on its real detail authority", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain('allowed(actorContext, "orders.financials.read")');
    expect(server).toContain("canOpenProtectedOperationalDetail");
    expect(server).toContain(
      "canDeliveries && canOpenProtectedOperationalDetail",
    );
    expect(server).toContain("canOrders && canOpenProtectedOperationalDetail");
    expect(server).toContain(
      "const orders = canOrders && canOpenProtectedOperationalDetail",
    );
  });

  it("uses the shared technical-value boundary for RTL-safe result identifiers", () => {
    const palette = source("../../command-palette.tsx");

    expect(palette).toContain('from "@/components/i18n/technical-value"');
    expect(palette).toContain("<TechnicalValue");
    expect(palette).toContain("hasTechnicalLabel");
    expect(palette).toContain("hasTechnicalSublabel");
  });

  it("prewarms only permitted projections after the authenticated shell is usable", () => {
    const route = source("../../../app/api/search/route.ts");
    const layout = source("../dashboard-layout.tsx");
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(route).toContain("warmUniversalSearchRecords");
    expect(route).toContain("POST /api/search");
    expect(layout).toContain('fetch("/api/search"');
    expect(layout).toContain('method: "POST"');
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
});
