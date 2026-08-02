import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("central order permission wiring inventory", () => {
  it("keeps every central handler on named trusted actions", () => {
    const collection = source("src/app/api/orders/route.ts");
    const item = source("src/app/api/orders/[id]/route.ts");

    expect(collection).toContain('requireTrustedAction("orders.read")');
    expect(collection).toContain('requireTrustedAction("orders.create")');
    expect(collection).toContain("projectOrdersForTrustedActor");
    expect(collection).toContain("projectOrderForTrustedActor");
    expect(collection).not.toContain("requireAuth()");

    expect(item).toContain('requireTrustedAction("orders.read")');
    expect(item).toContain('requireTrustedAction("orders.update")');
    expect(item).toContain('requireTrustedAction("orders.delete")');
    expect(item).toContain("assertOrderUpdateFieldAuthority");
    expect(item).toContain("order: projectOrderForTrustedActor");
    expect(item).not.toContain("requireAuth()");
  });
});
