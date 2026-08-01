import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("authority-driven team access UI", () => {
  it("uses the server permission catalog and does not define a parallel action matrix", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/components/settings/team-access-authority-panel.tsx",
      ),
      "utf8",
    );
    const settings = readFileSync(
      resolve(process.cwd(), "src/components/settings/settings-tabs.tsx"),
      "utf8",
    );

    expect(source).toContain("permissionCatalog");
    expect(source).toContain("inventory?.permissionCatalog.ceilings[role]");
    expect(source).toContain("inventory?.permissionCatalog.actions");
    expect(source).not.toMatch(/export const ACTIONS\s*=\s*\[/);
    expect(source).not.toMatch(/const ROLE_CEILINGS\s*:/);
    for (const action of [
      "orders.create",
      "orders.update",
      "orders.delete",
      "conversations.update",
      "conversations.reply",
      "whatsapp.connection.manage",
      "customers.contact.update",
      "orders.financials.update",
    ]) {
      expect(source.match(new RegExp(`"${action}":`, "g"))).toHaveLength(3);
    }
    expect(settings).toContain("<TeamAccessAuthorityPanel />");
    expect(settings).not.toContain("<TeamAccessPanel />");
  });
});
