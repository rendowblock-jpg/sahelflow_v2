/**
 * INT-05 (automation authoring): `automations.manage` was the only grant
 * checked when a definition was written, yet a definition can make the system
 * message customers (`send_whatsapp`) and change order status
 * (`update_status`) later, as the system principal. A custom narrowed policy
 * (a manager denied `conversations.reply`) could therefore script exactly the
 * effect they were denied. The author now needs the grant of every outward
 * effect at write time; presets are unaffected.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertAutomationEffectGrants,
  automationEffectGrants,
} from "@/lib/automations/authoring-grants";
import {
  getPhase2PresetPermissions,
  type Phase2Action,
} from "@/lib/identity/permissions";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function assertWith(held: readonly Phase2Action[]) {
  return (action: Phase2Action) => {
    if (!held.includes(action)) throw new Error(`forbidden:${action}`);
  };
}

describe("automation authoring effect grants (INT-05)", () => {
  it("maps only the two outward effects to a grant", () => {
    expect(
      automationEffectGrants([
        { action: "send_notification" },
        { action: "wait" },
        { action: "recheck_order_status" },
        { action: "tag_customer" },
      ]),
    ).toEqual([]);
    expect([...automationEffectGrants([{ action: "send_whatsapp" }])]).toEqual([
      "conversations.reply",
    ]);
    expect([...automationEffectGrants([{ action: "update_status" }])]).toEqual(["orders.update"]);
    expect(
      new Set(
        automationEffectGrants([
          { action: "send_whatsapp" },
          { action: "update_status" },
          { action: "send_whatsapp" },
        ]),
      ),
    ).toEqual(new Set(["conversations.reply", "orders.update"]));
  });

  it("refuses a send_whatsapp step from an author who cannot reply to customers", () => {
    const held: Phase2Action[] = ["automations.manage", "orders.update"];
    expect(() =>
      assertAutomationEffectGrants([{ action: "send_whatsapp" }], assertWith(held)),
    ).toThrow("forbidden:conversations.reply");
  });

  it("refuses an update_status step from an author who cannot update orders", () => {
    const held: Phase2Action[] = ["automations.manage", "conversations.reply"];
    expect(() =>
      assertAutomationEffectGrants([{ action: "update_status" }], assertWith(held)),
    ).toThrow("forbidden:orders.update");
  });

  it("lets an author without those grants write a definition with no outward effect", () => {
    expect(() =>
      assertAutomationEffectGrants(
        [{ action: "send_notification" }, { action: "wait" }, { action: "tag_customer" }],
        assertWith(["automations.manage"]),
      ),
    ).not.toThrow();
  });

  it("changes nothing for the preset roles that can author automations", () => {
    for (const role of ["owner", "manager"] as const) {
      const held = getPhase2PresetPermissions(role);
      expect(held).toContain("automations.manage");
      expect(() =>
        assertAutomationEffectGrants(
          [{ action: "send_whatsapp" }, { action: "update_status" }],
          assertWith(held),
        ),
      ).not.toThrow();
    }
    // The other presets cannot author at all, so they never reach the check.
    expect(getPhase2PresetPermissions("operator")).not.toContain("automations.manage");
    expect(getPhase2PresetPermissions("viewer")).not.toContain("automations.manage");
  });

  it("is enforced on create and on every edit, after the seller policy, and not on disable or delete", () => {
    const create = read("src/app/api/automations/route.ts");
    const update = read("src/app/api/automations/[id]/route.ts");

    expect(create).toMatch(
      /assertSellerAutomationWritePolicy\(input\);[\s\S]*?assertAutomationEffectGrants\(input\.steps,[\s\S]*?assertTrustedAction\(actorContext, action,[\s\S]*?prisma\.automation\.create/,
    );
    expect(update).toMatch(
      /assertSellerAutomationWritePolicy\(canonical\);[\s\S]*?assertAutomationEffectGrants\(canonical\.steps,[\s\S]*?assertTrustedAction\(actorContext, action,[\s\S]*?db\.automation\.update/,
    );

    // The lone `isActive:false` shortcut (always allowed) returns before the check.
    const disableAt = update.indexOf("automation.disabled");
    const checkAt = update.indexOf("assertAutomationEffectGrants(canonical.steps");
    expect(disableAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(disableAt);
    // DELETE writes no definition.
    expect(update.slice(update.indexOf("export const DELETE"))).not.toContain(
      "assertAutomationEffectGrants",
    );
  });
});
