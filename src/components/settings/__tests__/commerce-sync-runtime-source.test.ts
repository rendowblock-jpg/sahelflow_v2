import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("commerce sync settings source contract", () => {
  it("queues durable runs and renders sanitized recovery history", () => {
    const workspace = source("src/components/settings/settings-workspace.tsx");
    const panel = source(
      "src/components/settings/commerce-integrations-panel.tsx",
    );
    const recovery = source(
      "src/components/settings/commerce-sync-recovery-panel.tsx",
    );

    expect(workspace).toContain("<CommerceSyncRecoveryPanel />");
    expect(panel).toContain("data?.runs");
    expect(panel).not.toContain("data.results");
    expect(panel).toContain('commerce.runtime.queueSuccess');
    expect(recovery).toContain('/api/integrations/sync/history?limit=20');
    expect(recovery).toContain('/api/integrations/sync/recovery');
    expect(recovery).not.toContain("customerName");
    expect(recovery).not.toContain("customerPhone");
    expect(recovery).not.toContain("address");
  });
});
