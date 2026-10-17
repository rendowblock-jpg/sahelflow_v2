import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface InventoryGroup {
  models: string[];
  export: string;
}

interface PrivacyInventory {
  modelGroups: InventoryGroup[];
}

function delegateName(model: string): string {
  return `${model[0]?.toLowerCase() ?? ""}${model.slice(1)}`;
}

/**
 * Models the Phase 4 inventory files under "included-when-subject-or-business-
 * relevant" but that the export deliberately does NOT carry, each with the
 * reason. This is the only way to be absent from the export without an
 * `excluded*` inventory group, so every entry must be justified here and must
 * never gain a `db.<model>.findMany(` loader.
 */
const DERIVED_MODELS_NOT_EXPORTED: Readonly<Record<string, string>> = {
  SearchProjectionToken:
    "Derived blind-index material: one keyed HMAC per search token (about 100-150 rows per customer). The hashes are meaningless without the installation-wrapped blind-index key, carry no subject data of their own, and would overrun the all-or-nothing 32 MiB export cap. The records they index are exported through Customer and Order.",
  SearchProjectionDirty:
    "Derived re-index bookkeeping (family, entityId, revision) rebuilt by the projection triggers from the exported Customer and Order records; it holds no data that is not already in those records.",
};

/**
 * A column whose name looks like a credential. Models exported with a plain
 * `findMany()` must not have one: the CAPI access token and every other
 * credential live in the encrypted Secret authority, never in an exported row.
 * A new match must be reviewed and then omitted in the loader (the way
 * McpAgentGrant omits secretHash), not silently exported.
 */
const SECRET_LIKE_FIELD = /token|secret|credential|password|passphrase|apikey|api_key|privatekey|hash/i;

function modelFieldNames(prismaSources: string, model: string): string[] {
  const block = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, "m").exec(
    prismaSources,
  );
  if (!block?.[1]) throw new Error(`model ${model} not found in prisma sources`);
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0] ?? "")
    .filter(Boolean);
}

function secretLikeFields(prismaSources: string, model: string): string[] {
  return modelFieldNames(prismaSources, model).filter((field) =>
    SECRET_LIKE_FIELD.test(field),
  );
}

describe("Phase 4 privacy export authority", () => {
  const repoDir = resolve(import.meta.dirname, "../..");
  const inventory = JSON.parse(
    readFileSync(
      resolve(repoDir, "documentation/privacy/phase4-data-inventory.json"),
      "utf8",
    ),
  ) as PrivacyInventory;
  const lifecycle = readFileSync(
    resolve(repoDir, "src/lib/privacy/lifecycle.ts"),
    "utf8",
  );

  it("exports every inventory-included model and omits exact exclusions", () => {
    // Collect every miss instead of stopping at the first one, so a failing
    // run names all drifted models at once.
    const failures: string[] = [];
    for (const group of inventory.modelGroups) {
      for (const model of group.models) {
        const exported = lifecycle.includes(
          `db.${delegateName(model)}.findMany(`,
        );
        const mustStayOut =
          group.export.startsWith("excluded") ||
          model in DERIVED_MODELS_NOT_EXPORTED;
        if (mustStayOut && exported) {
          failures.push(`${model} must remain excluded`);
        } else if (!mustStayOut && !exported) {
          failures.push(`${model} must be exported`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(lifecycle).toContain("settingValuesExcluded: true");
    expect(lifecycle).toContain("PRIVACY_EXPORT_FORMAT_VERSION = 2");
  });

  it("only exempts real inventory models and always states a reason", () => {
    const classified = new Set(
      inventory.modelGroups.flatMap((group) => group.models),
    );
    for (const [model, reason] of Object.entries(DERIVED_MODELS_NOT_EXPORTED)) {
      expect(classified.has(model), `${model} is not an inventory model`).toBe(
        true,
      );
      expect(reason.trim().length, `${model} needs a reason`).toBeGreaterThan(
        40,
      );
    }
  });

  it("never exports a credential-looking column through a plain findMany", () => {
    const modelsDir = resolve(repoDir, "prisma/models");
    const prismaSources = [
      readFileSync(resolve(repoDir, "prisma/schema.prisma"), "utf8"),
      ...readdirSync(modelsDir)
        .filter((name) => name.endsWith(".prisma"))
        .map((name) => readFileSync(resolve(modelsDir, name), "utf8")),
    ].join("\n");

    // The scanner must be able to find what it looks for.
    expect(
      secretLikeFields(
        "model Probe {\n  id String @id\n  accessToken String\n  @@index([id])\n}\n",
        "Probe",
      ),
    ).toEqual(["accessToken"]);

    // Models whose loader returns every column. Loaders that already narrow
    // columns (select/omit) are reviewed where they are written.
    const plainLoaderModels = [
      "AiMessageFeedback",
      "CapiAttemptLog",
      "CapiEventLedger",
      "MetaPixelConfig",
      "QuantityTierOffer",
    ];
    for (const model of plainLoaderModels) {
      expect(
        lifecycle,
        `${model} must have an export loader`,
      ).toContain(`db.${delegateName(model)}.findMany(`);
      expect(
        secretLikeFields(prismaSources, model),
        `${model} gained a credential-looking column; omit it in the export loader`,
      ).toEqual([]);
    }
  });

  it("logs successful restore rollback with a stable non-PII code only", () => {
    const restoreSource = readFileSync(
      resolve(repoDir, "src-tauri/src/backup_recovery/028.rs"),
      "utf8",
    );
    expect(restoreSource).toContain(
      "replacement restore rolled back [RESTORE_APPLY_FAILED_ROLLED_BACK]",
    );
    expect(restoreSource).not.toContain(
      "verified previous installation was restored: {error}",
    );
  });
});
