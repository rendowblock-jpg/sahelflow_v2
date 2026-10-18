import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MNY-16: /api/risk/analytics was guarded by `risk.read` alone. The Risk page
 * withholds the same data (customer names, DZD losses) unless the member also
 * holds customers.read, customers.contact.read and orders.financials.read, and
 * every sibling risk route needs the same combined grants. The API must never
 * answer what the page withholds.
 *
 * `requireAuth` is replaced by the same all-actions-must-be-held loop the real
 * one runs, fed with the real built-in role presets.
 */

type Role = "owner" | "manager" | "operator" | "viewer";

const harness = vi.hoisted(() => ({
  role: "viewer" as Role,
  getRiskAnalyticsReport: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: async (required: string | readonly string[]) => {
    const { getPhase2PresetPermissions } = await import("@/lib/identity/permissions");
    const held = new Set<string>(getPhase2PresetPermissions(harness.role));
    const actions = typeof required === "string" ? [required] : required;
    for (const action of actions) {
      if (!held.has(action)) throw new Error(`FORBIDDEN:${action}`);
    }
    return { actor: { id: "member-1" } };
  },
}));

vi.mock("@/lib/risk-engine", () => ({
  getRiskAnalyticsReport: harness.getRiskAnalyticsReport,
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { getPhase2PresetPermissions } from "@/lib/identity/permissions";
import { GET } from "@/app/api/risk/analytics/route";

const ROLES: readonly Role[] = ["owner", "manager", "operator", "viewer"];

/** The Risk page's own rule (src/app/(dashboard)/risk/page.tsx): risk.read + canAssess. */
function pageAllows(role: Role): boolean {
  const held = new Set<string>(getPhase2PresetPermissions(role));
  return (
    held.has("risk.read") &&
    held.has("customers.read") &&
    held.has("customers.contact.read") &&
    held.has("orders.financials.read")
  );
}

async function callAnalytics(): Promise<"ok" | "forbidden"> {
  try {
    const response = await GET(new Request("http://localhost/api/risk/analytics?days=30"));
    return response.status === 200 ? "ok" : "forbidden";
  } catch {
    return "forbidden";
  }
}

describe("/api/risk/analytics grants match the Risk page (MNY-16)", () => {
  beforeEach(() => {
    harness.getRiskAnalyticsReport.mockReset();
    harness.getRiskAnalyticsReport.mockResolvedValue({ repeatRefusers: [] });
  });

  it("pins the page rule this test mirrors", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/risk/page.tsx"),
      "utf8",
    );
    expect(page).toContain(
      'const canAssess = can("customers.read") && can("customers.contact.read") && can("orders.financials.read");',
    );
  });

  it("is not vacuous: the built-in viewer is withheld by the page and the owner is not", () => {
    expect(pageAllows("viewer")).toBe(false);
    expect(pageAllows("owner")).toBe(true);
  });

  for (const role of ROLES) {
    it(`answers the ${role} preset exactly when the page does`, async () => {
      harness.role = role;
      const outcome = await callAnalytics();
      expect(outcome).toBe(pageAllows(role) ? "ok" : "forbidden");
      expect(harness.getRiskAnalyticsReport).toHaveBeenCalledTimes(pageAllows(role) ? 1 : 0);
    });
  }
});
