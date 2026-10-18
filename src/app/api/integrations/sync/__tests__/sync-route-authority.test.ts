/**
 * INT-05 (commerce sync trigger): the audit read `requireAuth([...])` as "any
 * ONE of these actions is enough" and rated the route as too broad. It is
 * all-of: `requireAuth` runs `assertTrustedAction` for every listed action and
 * the first missing one throws ACTION_FORBIDDEN. So a member who only holds a
 * read-type grant (customers.contact.read, orders.financials.read, ...) can NOT
 * start a provider sync, and with the shipped role presets only the owner holds
 * all seven.
 *
 * These tests pin that reading with executable evidence so nobody "fixes" the
 * route in either direction by trusting the old wording of the doc comment.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getPhase2PresetPermissions,
  type Phase2Action,
  type Phase2Role,
} from "@/lib/identity/permissions";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const SYNC_ACTIONS: readonly Phase2Action[] = [
  "integrations.manage",
  "data.import",
  "orders.create",
  "customers.contact.read",
  "customers.contact.update",
  "orders.financials.read",
  "orders.financials.update",
];

describe("POST /api/integrations/sync authority (INT-05)", () => {
  it("requires every listed action: requireAuth loops assertTrustedAction with no any-of escape", () => {
    const server = read("src/lib/auth/server.ts");
    expect(server).toMatch(
      /for \(const action of actions\) \{\s*assertTrustedAction\(actorContext, action,/,
    );
    expect(server).not.toMatch(/actions\.(some|find)\(/);
  });

  it("lists exactly the seven order-intake and financial actions", () => {
    const route = read("src/app/api/integrations/sync/route.ts");
    const call = /requireAuth\(\[([^\]]*)\]\)/.exec(route);
    expect(call).not.toBeNull();
    const listed = [...(call?.[1] ?? "").matchAll(/"([a-z.]+)"/g)].map((match) => match[1]);
    expect(new Set(listed)).toEqual(new Set(SYNC_ACTIONS));
  });

  it("is effectively owner-only: no other preset role holds all seven, so a single read grant never starts a sync", () => {
    const holdsAll = (role: Phase2Role) => {
      const permissions = getPhase2PresetPermissions(role);
      return SYNC_ACTIONS.every((action) => permissions.includes(action));
    };
    expect(holdsAll("owner")).toBe(true);
    expect(holdsAll("manager")).toBe(false);
    expect(holdsAll("operator")).toBe(false);
    expect(holdsAll("viewer")).toBe(false);
  });

  it("documents the all-of rule instead of the old any-of wording", () => {
    const route = read("src/app/api/integrations/sync/route.ts");
    expect(route).not.toMatch(/must hold\s+any of the listed/i);
    expect(route).toMatch(/every one of the listed/i);
  });
});
