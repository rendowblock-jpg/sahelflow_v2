/**
 * The permission wall is untouched by the narrower tool list. Offering is role-independent (the router has no
 * actor and grants nothing); the wall is the refusal BEFORE any proposal. One test per role, through the real
 * registry wrapper, the real presets and the real trustedActionAllowed (only the actor brand check is stubbed).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", () => ({
  isTrustedActorContext: vi.fn(() => true),
  requireTrustedActor: vi.fn(),
}));

import "@/lib/ai/chat/tools/core-tools";
import { runWithAiActionProposalRuntime } from "@/lib/ai/actions/proposal-runtime";
import { getAiToolPolicy } from "@/lib/ai/actions/contracts";
import { getTool, type ToolContext } from "@/lib/ai/chat/tools/registry";
import { getPhase2PresetPermissions, type Phase2Action, type Phase2Role } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { selectToolsForQuestion } from "../neutral/tool-router";

const SHOP = { shopId: "shop-a" } as unknown as ShopContext;
const ARGS = { customerId: "cust-karim", items: [{ productId: "prod-1", quantity: 2 }], wilaya: "Alger", commune: "Bab Ezzouar", address: "Bab Ezzouar", phone: "0555000101" };
const QUESTION = "Crée une commande pour Karim Benali : 2 Écouteurs Bluetooth Pro, téléphone 0555000101";

function actor(role: Phase2Role, permissions?: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: { kind: "person", personId: "1".repeat(32), workspaceMemberId: "2".repeat(32), deviceId: "3".repeat(32), sessionId: "session-1", role, ...(permissions ? { permissions } : {}), policyVersion: 1, revocationEpoch: 0 },
    shop: SHOP,
  } as unknown as TrustedActorContext;
}
const proposalHandle = (toolName: string) => ({
  proposal: { id: "aip_x", toolName, status: "pending", proposalDigestPrefix: "123456789abc", summary: { kind: "order_create" }, expiresAt: "2026-10-27T18:00:00.000Z", createdAt: "2026-10-26T17:50:00.000Z", executionState: null, lastErrorCode: null },
  proposalDigest: "1".repeat(64),
});
async function callCreateOrder(who: TrustedActorContext) {
  const createProposal = vi.fn(async (toolName: string) => proposalHandle(toolName));
  const ctx = { db: {}, shop: SHOP, actor: who } as unknown as ToolContext;
  const result = await runWithAiActionProposalRuntime({ createProposal } as never, () => getTool("create_order")!.execute(ARGS, ctx));
  return { result, createProposal };
}
const required = () => getAiToolPolicy("create_order").requiredPermissions;

describe("create_order permission wall", () => {
  it("still requires orders.create, and the narrowed router offers it to every role alike", () => {
    expect(required()).toContain("orders.create");
    expect(selectToolsForQuestion({ question: QUESTION, locale: "fr" }).tools.map((t) => t.name)).toContain("create_order");
  });

  it.each(["owner", "manager", "operator", "viewer"] as const)("%s: a proposal only when every required grant is held", async (role) => {
    const held = getPhase2PresetPermissions(role);
    const missing = required().filter((a) => !held.includes(a));
    const { result, createProposal } = await callCreateOrder(actor(role));
    if (missing.length === 0) {
      expect(result.success).toBe(true);
      expect(createProposal).toHaveBeenCalledTimes(1);
    } else {
      expect(result.success).toBe(false);
      expect(result.refusal).toMatchObject({ code: "AI_PROPOSAL_NOT_PERMITTED" });
      expect(result.refusal?.missingPermissions).toEqual(expect.arrayContaining(missing));
      expect(createProposal).not.toHaveBeenCalled();
    }
  });

  it("the owner and the viewer are the two ends: owner gets a proposal, viewer a refusal", async () => {
    expect((await callCreateOrder(actor("owner"))).result.success).toBe(true);
    const viewer = await callCreateOrder(actor("viewer"));
    expect(viewer.result.success).toBe(false);
    expect(viewer.createProposal).not.toHaveBeenCalled();
  });

  it("a custom member holding everything except orders.create is refused with exactly that grant missing", async () => {
    const all = getPhase2PresetPermissions("owner").filter((a) => a !== "orders.create");
    const { result, createProposal } = await callCreateOrder(actor("manager", all));
    expect(result.success).toBe(false);
    expect(result.refusal?.missingPermissions).toEqual(["orders.create"]);
    expect(createProposal).not.toHaveBeenCalled();
  });
});
