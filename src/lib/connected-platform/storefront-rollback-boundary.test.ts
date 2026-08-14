import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("storefront immutable rollback surface", () => {
  it("exposes historical catalog prices and returns the verified artifact after rollback", () => {
    const history = source("control-plane/storefront/list-releases.ts");
    const rollback = source("control-plane/storefront/rollback-release.ts");
    expect(history).toContain("unit_price_dzd");
    expect(history).toContain("catalog:");
    expect(rollback).toContain("publicArtifact");
    expect(rollback).toContain("shippingRules");
    expect(rollback).toContain("loadAllocationTransferSnapshot");
  });

  it("prepares rollback stock before cloud mutation and finalizes through the shared delegation authority", () => {
    const route = source("src/app/api/storefront/config/[id]/releases/route.ts");
    const preparer = source("src/lib/connected-platform/storefront-rollback.ts");
    const rollbackFlow = route.slice(route.indexOf("const preparedCommand"));
    expect(rollbackFlow.indexOf("await prepareStorefrontRollback")).toBeLessThan(
      rollbackFlow.indexOf("await runtime.client.rollbackStorefrontRelease"),
    );
    expect(rollbackFlow.indexOf("await runtime.client.rollbackStorefrontRelease")).toBeLessThan(
      rollbackFlow.indexOf("await finalizeActiveStorefrontPublish"),
    );
    expect(preparer).toContain("storefront.rollback.prepare.v1");
    expect(preparer).toContain("storefront-provisional:");
    expect(preparer).toContain("unitPriceDzd");
    expect(preparer).toContain("current.theme.builder.domain");
    expect(preparer).toContain("shippingRules: hosted.shippingRules");
  });

  it("surfaces localized release history and rollback controls beside Studio", () => {
    const page = source("src/app/(dashboard)/storefronts/[id]/page.tsx");
    const control = source("src/components/storefront/studio/storefront-release-history.tsx");
    expect(page).toContain("StorefrontReleaseHistory");
    expect(control).toContain("Release history");
    expect(control).toContain("Historique des versions");
    expect(control).toContain("سجل الإصدارات");
    expect(control).toContain("expectedActiveReleaseId");
    expect(control).toContain("sourceReleaseId");
  });

  it("requires recent reauthentication and records an explicit rollback audit", () => {
    const route = source("src/app/api/storefront/config/[id]/releases/route.ts");
    expect(route).toContain('requireTrustedAction("storefront.publish")');
    expect(route).toContain("requireRecentReauthentication");
    expect(route).toContain('action: "storefront.rolled_back"');
  });
});
