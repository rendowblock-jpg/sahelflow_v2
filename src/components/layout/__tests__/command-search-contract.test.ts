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

  it("keeps protected partial contact matching in authorized process memory", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain('allowed(actorContext, "customers.read")');
    expect(server).toContain('allowed(actorContext, "customers.contact.read")');
    expect(server).toContain("db.customer.findMany");
    expect(server).toContain("customerCandidates(query, customerRows)");
    expect(server).not.toContain("customer: { name: { contains: query }");
    expect(server).not.toContain("phone: { contains: query }");
  });

  it("bounds recent message search instead of loading 500 × 50 messages per query", () => {
    const server = source("../../../lib/search/universal-search-server.ts");

    expect(server).toContain("CONVERSATION_SCAN_LIMIT = 350");
    expect(server).toContain("RECENT_MESSAGES_PER_CONVERSATION = 12");
    expect(server).toContain("take: CONVERSATION_SCAN_LIMIT");
    expect(server).toContain("take: RECENT_MESSAGES_PER_CONVERSATION");
  });

  it("exposes server timing for Phase 7 latency evidence", () => {
    const route = source("../../../app/api/search/route.ts");

    expect(route).toContain("searchUniversalRecords");
    expect(route).toContain('"Server-Timing"');
    expect(route).toContain("result.tookMs");
    expect(route).toContain('"Cache-Control": "no-store"');
  });
});
