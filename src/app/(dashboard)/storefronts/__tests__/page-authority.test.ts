import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("storefront dashboard page authority", () => {
  it("authorizes the direct read before listing private storefronts", () => {
    const page = source("src/app/(dashboard)/storefronts/page.tsx");
    const readGuard = page.indexOf(
      'requireTrustedAction("storefront.read")',
    );
    const query = page.indexOf("storefrontService.list(");

    expect(readGuard).toBeGreaterThanOrEqual(0);
    expect(query).toBeGreaterThan(readGuard);
    expect(page).toContain('"storefront.manage"');
    expect(page).toContain('"storefront.publish"');
    expect(page).toContain('"approvals.approve"');
    expect(page).toContain("canManage={canManage}");
    expect(page).toContain("canPublish={canPublish}");
    expect(page).toContain("canDelete={canDelete}");
  });

  it("projects edit/publish authority separately from protected delete authority", () => {
    const page = source("src/app/(dashboard)/storefronts/page.tsx");
    const client = source(
      "src/components/storefront/storefronts-list-client.tsx",
    );

    expect(page).toContain("const canMutate = canManage && canPublish");
    expect(page).toContain("const canDelete = canMutate && canApprove");
    expect(client).toContain("canManage: boolean");
    expect(client).toContain("canPublish: boolean");
    expect(client).toContain("canDelete: boolean");
    expect(client).toContain("const canMutate = canManage && canPublish");
    expect(client).toContain("open={canDelete && deleteTarget !== null}");
    expect(client).toContain('payload.code === "REAUTHENTICATION_REQUIRED"');
  });
});
