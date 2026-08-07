import { readFileSync } from "node:fs";
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
    for (const group of inventory.modelGroups) {
      for (const model of group.models) {
        const marker = `db.${delegateName(model)}.findMany(`;
        if (group.export.startsWith("excluded")) {
          expect(lifecycle, `${model} must remain excluded`).not.toContain(marker);
        } else {
          expect(lifecycle, `${model} must be exported`).toContain(marker);
        }
      }
    }
    expect(lifecycle).toContain("settingValuesExcluded: true");
    expect(lifecycle).toContain("PRIVACY_EXPORT_FORMAT_VERSION = 2");
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
