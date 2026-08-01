import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const ROUTES = [
  "src/app/api/conversations/route.ts",
  "src/app/api/conversations/[id]/route.ts",
  "src/app/api/conversations/[id]/status/route.ts",
  "src/app/api/conversations/[id]/priority/route.ts",
  "src/app/api/conversations/[id]/labels/route.ts",
  "src/app/api/conversations/[id]/read/route.ts",
  "src/app/api/conversations/search/route.ts",
  "src/app/api/whatsapp/chats/route.ts",
  "src/app/api/whatsapp/chats/[jid]/messages/route.ts",
  "src/app/api/whatsapp/connect/route.ts",
  "src/app/api/whatsapp/logout/route.ts",
  "src/app/api/whatsapp/outbox/route.ts",
  "src/app/api/whatsapp/qr/route.ts",
  "src/app/api/whatsapp/qr-image/route.ts",
  "src/app/api/whatsapp/send/route.ts",
  "src/app/api/whatsapp/status/route.ts",
  "src/app/api/whatsapp/ws-token/route.ts",
  "src/app/api/orders/[id]/timeline/route.ts",
  "src/app/api/orders/[id]/status/route.ts",
  "src/app/api/orders/[id]/decision/route.ts",
  "src/app/api/orders/[id]/restore/route.ts",
  "src/app/api/orders/[id]/courier/route.ts",
  "src/app/api/orders/[id]/courier/sync/route.ts",
  "src/app/api/orders/[id]/fulfillment/route.ts",
  "src/app/api/orders/[id]/cod/position/route.ts",
  "src/app/api/orders/[id]/cod/collection/route.ts",
  "src/app/api/orders/[id]/cod/collection/correction/route.ts",
  "src/app/api/orders/[id]/refund/route.ts",
  "src/app/api/orders/[id]/refunds/route.ts",
  "src/app/api/orders/[id]/refunds/[refundId]/reverse/route.ts",
  "src/app/api/orders/[id]/customer-return/route.ts",
  "src/app/api/orders/[id]/customer-return/[returnId]/transition/route.ts",
  "src/app/api/orders/[id]/recovery/route.ts",
  "src/app/api/orders/[id]/source/submit/route.ts",
  "src/app/api/orders/bulk/route.ts",
  "src/app/api/orders/search/route.ts",
  "src/app/api/orders/source/whatsapp/route.ts",
  "src/app/api/returns/route.ts",
  "src/app/api/returns/[id]/route.ts",
] as const;

describe("operational route action inventory", () => {
  it("does not leave a listed Teams boundary at generic authentication", () => {
    for (const path of ROUTES) {
      const route = source(path);
      expect(route, path).not.toContain("requireAuth()");
      expect(route, path).not.toContain("requireTrustedActor()");
      expect(route, path).toContain("requireTrustedAction(");
    }
  });

  it("keeps field projections on sensitive read and mutation responses", () => {
    expect(source("src/app/api/conversations/route.ts")).toContain(
      "projectConversationForTrustedActor",
    );
    expect(source("src/app/api/conversations/[id]/route.ts")).toContain(
      "resolveConversationIdForRead",
    );
    expect(source("src/app/api/orders/search/route.ts")).toContain(
      "projectOrdersForTrustedActor",
    );
    expect(source("src/app/api/orders/[id]/customer-return/route.ts")).toContain(
      "projectCustomerReturnPosition",
    );
  });

  it("proves recent reauthentication before credential request parsing", () => {
    for (const path of [
      "src/app/api/delivery/credentials/route.ts",
      "src/app/api/integrations/connect/route.ts",
      "src/app/api/secrets/gemini-key/route.ts",
    ]) {
      const route = source(path);
      const post = route.indexOf("export const POST");
      const authority = route.indexOf("requireAuth(", post);
      const reauthentication = route.indexOf(
        "requireRecentReauthentication()",
        authority,
      );
      const body = route.indexOf("req.json()", reauthentication);

      expect(authority, path).toBeGreaterThan(post);
      expect(reauthentication, path).toBeGreaterThan(authority);
      expect(body, path).toBeGreaterThan(reauthentication);
    }
  });

  it("guards COD contact and financial fields before summary queries", () => {
    for (const path of [
      "src/app/(dashboard)/accounting/cod-reconciliation/page.tsx",
      "src/app/api/accounting/cod-reconciliation/route.ts",
      "src/app/api/accounting/cod-settlements/route.ts",
    ]) {
      const route = source(path);
      const accounting = route.indexOf('"accounting.read"');
      const financials = route.indexOf('"orders.financials.read"', accounting);
      const contact = route.indexOf('"customers.contact.read"', financials);
      const query = route.indexOf("getCanonicalCodWorkspaceSummary(", contact);

      expect(accounting, path).toBeGreaterThanOrEqual(0);
      expect(financials, path).toBeGreaterThan(accounting);
      expect(contact, path).toBeGreaterThan(financials);
      expect(query, path).toBeGreaterThan(contact);
    }
  });
});
