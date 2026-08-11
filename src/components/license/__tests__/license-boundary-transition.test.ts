import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { needsLicensedServerTreeRefresh } from "../license-boundary-state";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("licensed server-tree transition", () => {
  it("refreshes only after client entitlement becomes valid while protected server children are absent", () => {
    expect(needsLicensedServerTreeRefresh("missing", false)).toBe(false);
    expect(needsLicensedServerTreeRefresh("expired", false)).toBe(false);
    expect(needsLicensedServerTreeRefresh(undefined, false)).toBe(false);
    expect(needsLicensedServerTreeRefresh("valid", false)).toBe(true);
    expect(needsLicensedServerTreeRefresh("valid", true)).toBe(false);
  });

  it("wires the valid-without-children state to an App Router refresh and a visible checking surface", () => {
    const boundary = read("src/components/license/license-boundary.tsx");

    expect(boundary).toContain('import { usePathname, useRouter } from "next/navigation"');
    expect(boundary).toContain("const needsServerTreeRefresh = needsLicensedServerTreeRefresh(");
    expect(boundary).toContain("if (needsServerTreeRefresh) {");
    expect(boundary).toContain("router.refresh();");
    expect(boundary).toContain("if (isLoading || needsServerTreeRefresh)");
  });

  it("keeps both permanent and trial activation paths refreshing the client entitlement projection", () => {
    const panel = read("src/components/settings/license-panel.tsx");

    expect(panel).toContain('fetch("/api/license/sync"');
    expect(panel).toContain('fetch("/api/license/trial"');
    expect(panel.match(/await refresh\(\);/g)).toHaveLength(2);
  });

  it("keeps the server lockout from rendering protected dashboard children before entitlement is valid", () => {
    const layout = read("src/app/(dashboard)/layout.tsx");

    expect(layout).toContain("if (!licenseValid)");
    expect(layout).toContain("<LicenseBoundary>{null}</LicenseBoundary>");
    expect(layout).toContain("<DashboardLayout>");
    expect(layout).not.toContain("<DashboardLayout locale=");
  });
});
