import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Storefront mutation authority", () => {
  it("does not ship the legacy live-config Storefront builder", () => {
    expect(
      existsSync(resolve(root, "src/components/storefront/storefront-builder.tsx")),
    ).toBe(false);
  });

  it("does not expose live activation/deactivation mutations from the list", () => {
    const list = read("src/components/storefront/storefronts-list-client.tsx");
    expect(list).not.toContain('method: "PUT"');
    expect(list).not.toContain("toggleActive");
    expect(list).toContain("/studio");
    expect(list).toContain("/history");
  });

  it("projects delete only with approval authority and guides recent-PIN recovery", () => {
    const page = read("src/app/(dashboard)/storefronts/page.tsx");
    const list = read("src/components/storefront/storefronts-list-client.tsx");
    expect(page).toContain('"approvals.approve"');
    expect(page).toContain("const canDelete = canMutate && canApprove");
    expect(page).toContain("canDelete={canDelete}");
    expect(list).toContain("canDelete: boolean");
    expect(list).toContain('payload.code === "REAUTHENTICATION_REQUIRED"');
    expect(list).toContain('fetch("/api/auth/reauthenticate"');
    expect(list).toContain("verifyPinAndDelete");
  });

  it("rejects legacy PUT and reserves public-state changes for exact draft publish", () => {
    const route = read("src/app/api/storefront/config/[id]/route.ts");
    expect(route).toContain('error: "storefront_live_update_disabled"');
    expect(route).toContain('{ status: 405 }');
    expect(route).toContain('"PATCH /api/storefront/config/[id]"');
    expect(route).toContain('"POST /api/storefront/config/[id]"');
    expect(route).toContain("prepareStorefrontPublish");
    expect(route).toContain("finalizeActiveStorefrontPublish");
    expect(route).toContain("finalizePausedStorefrontPublish");
    expect(route).not.toContain("storefrontService.update(context, id, updates");
  });
});
