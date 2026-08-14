import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("storefront hosted delegation authority", () => {
  it("publishes one durable prepared snapshot and finalizes local public state only after hosted acknowledgement", () => {
    const route = source("src/app/api/storefront/config/[id]/route.ts");
    const delegation = source("src/lib/connected-platform/storefront-delegation.ts");
    const publisher = source("src/lib/connected-platform/storefront-publisher.ts");
    expect(route).toContain("prepareStorefrontPublish");
    expect(route).toContain("publishHostedStorefront");
    expect(route).toContain("finalizeActiveStorefrontPublish");
    const activePublishFlow = route.slice(route.indexOf("if (prepared.draft.isActive)"));
    expect(activePublishFlow.indexOf("await publishHostedStorefront({")).toBeLessThan(
      activePublishFlow.indexOf("await finalizeActiveStorefrontPublish("),
    );
    expect(delegation).toContain("storefront.publish.prepare.v1");
    expect(delegation).toContain("storefront.publish.finalize.v1");
    expect(delegation).toContain("storefront-provisional:");
    expect(publisher).toContain("input.prepared.releaseId");
    expect(publisher).toContain("preparedHistory");
  });

  it("conserves desktop and hosted stock across publish, republish, and remove-readd flows", () => {
    const publisher = source("src/lib/connected-platform/storefront-publisher.ts");
    const migration = source(
      "prisma/migrations/20260814030000_storefront_delegation_guards/migration.sql",
    );
    const releaseTransfer = source("control-plane/storefront/release-transfer.ts");
    const publish = source("control-plane/storefront/publish-release.ts");
    const list = source("control-plane/storefront/list-releases.ts");
    expect(publisher).toContain("activeAllocations");
    expect(publisher).toContain("provisionalQuantityByItem");
    expect(publisher).toContain("parentRemaining");
    expect(publisher).toContain("requestedDelegationProducts");
    expect(migration).toContain("storefront_delegation_stock_conflict");
    expect(migration).toContain("storefront-delegation:%");
    expect(migration).toContain("storefront-provisional:%");
    expect(releaseTransfer).toContain("storefront_allocation_retirement");
    expect(publish).toContain("appendAllocationRetirementSnapshot");
    expect(list).toContain("remaining_quantity");
  });

  it("consumes or releases the exact hosted release delegation at canonical seller decision", () => {
    const receiptImport = source("src/lib/connected-platform/storefront-receipt-import.ts");
    const decision = source("src/lib/orders/manual-confirmation.ts");
    const delegation = source("src/lib/connected-platform/storefront-delegation.ts");
    expect(receiptImport).toContain('hostedDelegationAuthority: "v1"');
    expect(receiptImport).toContain("hostedReleaseId: receipt.releaseId");
    expect(decision).toContain("readCanonicalSourceOrderAuthority");
    expect(decision).toContain("consumeStorefrontDelegation");
    expect(decision.indexOf("consumeStorefrontDelegation")).toBeLessThan(
      decision.indexOf("reserveOrderItem("),
    );
    expect(delegation).toContain("storefront_delegation_consumed");
    expect(delegation).toContain("storefront_delegation_released");
  });

  it("pauses hosted storefronts before inactive publication or local deletion", () => {
    const route = source("src/app/api/storefront/config/[id]/route.ts");
    const publisher = source("src/lib/connected-platform/storefront-publisher.ts");
    const worker = source("control-plane/storefront/worker.ts");
    const pause = source("control-plane/storefront/pause-storefront.ts");
    const schema = source("control-plane/storefront/schema.sql");
    expect(route).toContain("pauseHostedStorefront");
    expect(route).toContain("pauseStorefront(id");
    expect(route.indexOf("pauseStorefront(id")).toBeLessThan(
      route.indexOf("storefrontService.delete(context, id)"),
    );
    expect(publisher).toContain("storefront_pause_${input.prepared.releaseId}");
    expect(worker).toContain("/pause$");
    expect(pause).toContain("state = 'paused'");
    expect(schema).toContain("storefront_pause_operation");
    expect(schema).toContain("storefront_allocation_retirement");
  });

  it("treats the committed immutable release ID as the replay boundary", () => {
    const publish = source("control-plane/storefront/publish-release.ts");
    expect(publish).toContain("existing.artifact_digest !== artifactDigest");
    expect(publish).toContain("replay: true");
    expect(publish).toContain("loadAllocationTransferSnapshot");
    expect(publish).toContain("request_digest");
  });
});
