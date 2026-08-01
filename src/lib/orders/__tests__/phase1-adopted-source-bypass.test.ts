import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ADOPTED_ORDER_SOURCES = {
  storefront: "src/app/api/storefront/submit/route.ts",
  fileImport: "src/app/api/import/orders/route.ts",
  commerce: "src/lib/integrations/ecommerce/sync-engine.ts",
  whatsapp: "src/app/api/orders/source/whatsapp/route.ts",
  ai: "src/lib/ai/chat/tools/core-tools.ts",
} as const;

const REMOVED_LEGACY_COD_SURFACES = {
  bulk: "src/app/api/accounting/cod-reconciliation/bulk/route.ts",
  order: "src/app/api/orders/[id]/cod/route.ts",
} as const;

async function source(path: string): Promise<string> {
  return readFile(join(process.cwd(), path), "utf8");
}

const DIRECT_ORDER_WRITE =
  /\b(?:db|tx|context\.prisma|ctx\.prisma)\.order\.(?:create|update|updateMany|upsert|delete|deleteMany)\s*\(/;

describe("Phase 1 adopted-source bypass audit", () => {
  it("keeps every adopted order intake on canonical source commands", async () => {
    const files = Object.fromEntries(
      await Promise.all(
        Object.entries(ADOPTED_ORDER_SOURCES).map(async ([name, path]) => [
          name,
          await source(path),
        ]),
      ),
    ) as Record<keyof typeof ADOPTED_ORDER_SOURCES, string>;

    for (const [name, content] of Object.entries(files)) {
      expect(content, `${name} must invoke canonical order creation`).toContain(
        "createCanonicalSourceOrder",
      );
      expect(
        content,
        `${name} must not mutate Order rows outside the command kernel`,
      ).not.toMatch(DIRECT_ORDER_WRITE);
    }

    expect(files.storefront).toContain(
      'sourceBusinessPrincipal("storefront", config.slug)',
    );
    expect(files.storefront).toContain("command.replayed");

    expect(files.fileImport).toContain("requireTrustedActor");
    expect(files.fileImport).toContain("businessPrincipalFromTrustedActor");
    expect(files.fileImport).toContain("prepareCanonicalFileImport");

    expect(files.commerce).toContain("commitCanonicalSourceCheckpoint");
    expect(files.commerce).toContain("executeManualOrderDecision");
    expect(files.commerce).toContain("executeCanonicalOrderRecovery");
    expect(files.commerce).toContain("if (result.errors.length > 0)");

    expect(files.whatsapp).toContain("sidecar.messages");
    expect(files.whatsapp).toContain(
      'sourceBusinessPrincipal(\n        "whatsapp",',
    );
    expect(files.whatsapp).toContain("messageBodySha256");

    expect(files.ai).toContain("currentAiSourceProposal");
    expect(files.ai).toContain('sourceBusinessPrincipal(\n            "ai_chat",');
    expect(files.ai).toContain('initialStatus: "draft"');
  });

  it("keeps removed scalar COD mutations unreachable", async () => {
    const [summary, bulk, orderRoute, orderPage] = await Promise.all([
      source("src/app/api/accounting/cod-reconciliation/route.ts"),
      source(REMOVED_LEGACY_COD_SURFACES.bulk),
      source(REMOVED_LEGACY_COD_SURFACES.order),
      source("src/app/(dashboard)/orders/[id]/page.tsx"),
    ]);

    expect(summary).toContain("getCanonicalCodWorkspaceSummary");
    expect(summary).toContain("requireTrustedActor");
    expect(summary).not.toContain("getCodReconciliationSummary");

    for (const content of [bulk, orderRoute]) {
      expect(content).toContain("LEGACY_COD_MUTATION_REMOVED");
      expect(content).toContain("status: 410");
      expect(content).toContain("requireTrustedAction");
      expect(content).not.toMatch(
        /markCodCollected|markCodRemitted|bulkMarkCodRemitted/,
      );
    }

    expect(orderPage).not.toMatch(/import\s+\{?\s*CodControls|<CodControls/);
  });
});
