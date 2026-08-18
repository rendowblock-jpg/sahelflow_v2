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

  it("uses an invalidated token projection instead of decrypting all customers per keystroke", () => {
    const server = source("../../../lib/search/universal-search-server.ts");
    const projection = source("../../../lib/search/local-search-projection.ts");
    const db = source("../../../lib/db.ts");

    expect(server).toContain('allowed(actorContext, "customers.read")');
    expect(server).toContain('allowed(actorContext, "customers.contact.read")');
    expect(server).toContain("searchProjectedCustomers");
    expect(server).not.toContain("db.customer.findMany");
    expect(projection).toContain("buildCustomerIndex");
    expect(projection).toContain("candidateIdsForQuery");
    expect(projection).toContain("index.keys.get");
    expect(projection).toContain("subscribeSearchProjectionMutations");
    expect(db).toContain("publishSearchProjectionMutation");
  });

  it("never selects conversation contact fields without contact permission", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("const rows = canReadContact");
    expect(server).toContain("contactName: true");
    expect(server).toContain("contactPhone: true");
    expect(server).toContain("select: commonSelect");
  });

  it("preserves formatting-insensitive technical identifiers in the same projection", () => {
    const projection = source("../../../lib/search/local-search-projection.ts");

    expect(projection).toContain("compactSearchText");
    expect(projection).toContain("MAX_PREFIX_LENGTH");
    expect(projection).toContain("GRAM_SIZE");
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

  it("keeps search families fault-isolated instead of failing one Promise.all authority", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("safeFamily");
    expect(server).toContain("degradedFamilies");
    expect(server).toContain("search.universal.family-degraded");
  });

  it("bounds live recent-message search and keeps contact selection permission-aware", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("CONVERSATION_SCAN_LIMIT = 160");
    expect(server).toContain("RECENT_MESSAGES_PER_CONVERSATION = 8");
    expect(server).toContain("take: CONVERSATION_SCAN_LIMIT");
    expect(server).toContain("take: RECENT_MESSAGES_PER_CONVERSATION");
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
    expect(server).toContain("product: canProducts");
    expect(server).toContain("delivery: canDeliveries");
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
