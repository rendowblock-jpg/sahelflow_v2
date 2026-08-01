import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("confirmation queue page authority", () => {
  it("resolves trusted field access before the private queue query", () => {
    const page = readFileSync(
      resolve(
        process.cwd(),
        "src/app/(dashboard)/orders/confirmation-queue/page.tsx",
      ),
      "utf8",
    );
    const pageGuard = page.indexOf('requireTrustedAction("orders.read")');
    const fieldAccess = page.indexOf(
      "resolveConfirmationQueueFieldAccess(actorContext)",
    );
    const query = page.indexOf("getConfirmationQueue()");
    const projection = page.indexOf("projectConfirmationQueueForTrustedActor(");

    expect(pageGuard).toBeGreaterThanOrEqual(0);
    expect(fieldAccess).toBeGreaterThan(pageGuard);
    expect(query).toBeGreaterThan(fieldAccess);
    expect(projection).toBeGreaterThan(query);
    expect(page).not.toContain("o.customer.phone");
    expect(page).toContain("!o.canUpdate");
  });
});
