import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 3 delivery provider authority source contract", () => {
  it("removes the undocumented DHD runtime and registers NOEST only with exact URLs", () => {
    expect(
      existsSync(resolve(root, "src/lib/integrations/delivery/dhd.ts")),
    ).toBe(false);
    const registry = source("src/lib/integrations/delivery/index.ts");
    expect(registry).not.toContain("dhdAdapter");
    expect(registry).toContain("noestAdapter");

    const noest = source("src/lib/integrations/delivery/noest.ts");
    expect(noest).toContain("createOrderUrl");
    expect(noest).toContain("validateOrderUrl");
    expect(noest).toContain("trackingsUrl");
    expect(noest).toContain("feesUrl");
    expect(noest).toContain('parsed.protocol !== "https:"');
    expect(noest).not.toMatch(/const\s+NOEST_(?:BASE|API)_URL/);
  });

  it("invalidates credentials and certifies through one recent-reauthenticated route", () => {
    const credentials = source(
      "src/app/api/delivery/credentials/route.ts",
    );
    expect(credentials).toContain("invalidateProviderCertifications");
    expect(credentials).toContain('"credentials_updated"');
    expect(credentials).toContain('"credentials_deleted"');

    const certification = source(
      "src/app/api/delivery/test-connection/route.ts",
    );
    expect(certification).toContain("requireRecentReauthentication()");
    expect(certification).toContain("testAndCertifyProvider");
    expect(certification).toContain("delivery.provider.certified");
  });

  it("gates every production booking, fee and tracking boundary", () => {
    const reviewedBase = ["canonical-courier", "reviewed-base"].join("-");
    const legacyBase = ["canonical-courier", "legacy"].join("-");
    const expectations: Record<string, string[]> = {
      "src/app/api/delivery/create/route.ts": [
        'assertProviderCapability(context, input.provider, "booking")',
      ],
      "src/app/api/delivery/estimate/route.ts": [
        'assertProviderCapability(context, input.provider, "fees")',
      ],
      "src/app/api/delivery/sync/route.ts": [
        'assertProviderCapability(context, delivery.provider, "tracking")',
      ],
      [`src/lib/delivery/${reviewedBase}.ts`]: [
        'assertProviderCapability(context, provider, "booking")',
      ],
      [`src/lib/delivery/${legacyBase}.ts`]: [
        'assertProviderCapability(context, provider, "booking")',
        'assertProviderCapability(context, provider, "tracking")',
      ],
      "src/lib/ai/chat/tools/core-tools.ts": [
        'assertProviderCapability(context, input.provider, "fees")',
      ],
    };

    for (const [path, markers] of Object.entries(expectations)) {
      const content = source(path);
      for (const marker of markers) {
        expect(content, `${path} is missing ${marker}`).toContain(marker);
      }
    }
  });

  it("cleans retired DHD credentials without rewriting historical delivery identity", () => {
    const migration = source(
      "prisma/migrations/20260803211500_phase3_provider_capability_authority/migration.sql",
    );
    expect(migration).toContain("delivery_dhd_%");
    expect(migration).toContain("reconciliation_required");
    expect(migration).not.toContain("SET \"provider\" = 'noest'");
  });
});
