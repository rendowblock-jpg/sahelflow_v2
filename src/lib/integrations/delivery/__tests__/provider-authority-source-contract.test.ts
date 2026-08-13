import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("delivery provider authority source contract", () => {
  it("exposes one public courier facade and internalizes effect execution", () => {
    const legacy = resolve(root, "src/lib/delivery/canonical-courier-legacy.ts");
    const reviewed = resolve(root, "src/lib/delivery/canonical-courier-reviewed-base.ts");
    const authorityPath = "src/lib/delivery/canonical-courier-booking-authority.ts";
    const runtimePath = "src/lib/delivery/canonical-courier-effect-runtime.ts";
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(reviewed)).toBe(false);
    expect(existsSync(resolve(root, authorityPath))).toBe(true);
    expect(existsSync(resolve(root, runtimePath))).toBe(true);

    const facade = source("src/lib/delivery/canonical-courier.ts");
    const authority = source(authorityPath);
    const runtime = source(runtimePath);
    expect(facade).toContain("./canonical-courier-booking-authority");
    expect(authority).toContain("./canonical-courier-effect-runtime");
    expect(authority).not.toContain("LegacyCourier");
    expect(runtime).not.toContain("export async function queueCanonicalCourierBooking");
    expect(runtime).not.toContain("export async function reconcileCanonicalCourierBooking");

    const deliveryFiles = readdirSync(resolve(root, "src/lib/delivery"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `src/lib/delivery/${name}`);
    const runtimeImporters = deliveryFiles.filter((path) =>
      source(path).includes("./canonical-courier-effect-runtime"),
    );
    expect(runtimeImporters).toEqual([authorityPath]);
  });

  it("removes DHD and dedicated NOEST providers in favor of canonical EcoTrack", () => {
    expect(existsSync(resolve(root, "src/lib/integrations/delivery/dhd.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/lib/integrations/delivery/noest.ts"))).toBe(false);

    const registry = source("src/lib/integrations/delivery/index.ts");
    const types = source("src/lib/integrations/delivery/types.ts");
    const ecotrack = source("src/lib/integrations/delivery/ecotrack.ts");
    const capability = source("src/lib/integrations/delivery/provider-capability.ts");

    expect(registry).not.toContain("dhdAdapter");
    expect(registry).not.toContain("noestAdapter");
    expect(registry).toContain("ecoTrackAdapter");
    expect(types).toContain('"ecotrack"');
    expect(types).toContain('if (provider === "noest") return "ecotrack"');
    expect(ecotrack).toContain("createOrderUrl");
    expect(ecotrack).toContain("validateOrderUrl");
    expect(ecotrack).toContain("trackingsUrl");
    expect(ecotrack).toContain("feesUrl");
    expect(ecotrack).toContain('parsed.protocol !== "https:"');
    expect(ecotrack).toContain("origins.size !== 1");
    expect(capability).toContain('ecotrack: ["fees", "booking", "tracking"]');
    expect(capability).toContain('status === "source_reviewed"');
  });

  it("invalidates credentials and certifies through one recent-reauthenticated route", () => {
    const credentials = source("src/app/api/delivery/credentials/route.ts");
    expect(credentials).toContain("invalidateProviderCertifications");
    expect(credentials).toContain("normalizeDeliveryProvider(input.provider)");
    expect(credentials).toContain("entityId: provider");
    expect(credentials).toContain("entityId: canonicalProvider");
    expect(credentials).toContain('"credentials_updated"');
    expect(credentials).toContain('"credentials_deleted"');

    const certification = source("src/app/api/delivery/test-connection/route.ts");
    expect(certification).toContain("requireRecentReauthentication()");
    expect(certification).toContain("testAndCertifyProvider");
    expect(certification).toContain("delivery.provider.certified");
  });

  it("gates every production booking, fee and tracking boundary", () => {
    const bookingAuthority = ["canonical-courier", "booking-authority"].join("-");
    const effectRuntime = ["canonical-courier", "effect-runtime"].join("-");
    const expectations: Record<string, string[]> = {
      "src/app/api/delivery/create/route.ts": ['assertProviderCapability(context, input.provider, "booking")'],
      "src/app/api/delivery/estimate/route.ts": ['assertProviderCapability(context, input.provider, "fees")'],
      "src/app/api/delivery/sync/route.ts": ['assertProviderCapability(context, delivery.provider, "tracking")'],
      [`src/lib/delivery/${bookingAuthority}.ts`]: ['assertProviderCapability(context, provider, "booking")'],
      [`src/lib/delivery/${effectRuntime}.ts`]: [
        'assertProviderCapability(context, provider, "booking")',
        'assertProviderCapability(context, storedProvider, "tracking")',
        "normalizeDeliveryProvider(storedProvider)",
      ],
      "src/lib/ai/chat/tools/core-tools.ts": ['assertProviderCapability(context, input.provider, "fees")'],
    };

    for (const [path, markers] of Object.entries(expectations)) {
      const content = source(path);
      for (const marker of markers) {
        expect(content, `${path} is missing ${marker}`).toContain(marker);
      }
    }
  });

  it("cleans retired DHD credentials without rewriting historical delivery identity", () => {
    const migration = source("prisma/migrations/20260803211500_phase3_provider_capability_authority/migration.sql");
    expect(migration).toContain("delivery_dhd_%");
    expect(migration).toContain("reconciliation_required");
    expect(migration).not.toContain("SET \"provider\" = 'noest'");
  });
});
