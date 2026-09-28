/**
 * MCP agent grant identity (FD-063 MCP-11).
 *
 * A grant acts under its own durable identity binding, copied from the owner's
 * live session binding. These tests prove the binding behaves like every other
 * binding: it resolves for ingress and for proposal approval, it is revoked
 * with the grant, and "revoke all other sessions" cuts it off.
 */
import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentGrantIdentitySessionId,
  bindAgentGrantIdentity,
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
  revokeAgentGrantIdentity,
} from "@/lib/identity/control-authority";
import { trustedActorForAgentGrant } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});
const GRANT = "clgrant0000000000000001";

function cleanup(): void {
  for (const path of [identityAuthorityPath(), identityAuthorityMarkerPath()]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions surface meaningful cleanup failures.
    }
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe("agent grant identity binding", () => {
  it("labels grants so the binding can never be a browser session id", () => {
    expect(agentGrantIdentitySessionId(GRANT)).toBe(`mcp-grant:${GRANT}`);
    expect(() => agentGrantIdentitySessionId("x")).toThrow(
      expect.objectContaining({ code: "IDENTITY_AGENT_GRANT_INVALID" }),
    );
  });

  it("acts as the owner under its own binding, visible to proposal approval", async () => {
    const owner = await bindOwnerIdentitySession("owner-session", SHOP);
    await bindAgentGrantIdentity("owner-session", GRANT, SHOP);

    const context = await trustedActorForAgentGrant(GRANT, SHOP);
    expect(context.actor).toMatchObject({
      kind: "person",
      sessionId: `mcp-grant:${GRANT}`,
      personId: owner.personId,
      workspaceMemberId: owner.workspaceMemberId,
      role: "owner",
    });

    // Approval re-resolves the requester from the stored session id.
    const requester = await resolveDurableIdentityActor(`mcp-grant:${GRANT}`, SHOP);
    expect(requester?.personId).toBe(owner.personId);
  });

  it("refuses a second binding for the same grant and an unbound creator", async () => {
    await bindOwnerIdentitySession("owner-session", SHOP);
    await bindAgentGrantIdentity("owner-session", GRANT, SHOP);
    expect(await codeOf(bindAgentGrantIdentity("owner-session", GRANT, SHOP))).toBe(
      "IDENTITY_AGENT_GRANT_ALREADY_BOUND",
    );
    expect(
      await codeOf(bindAgentGrantIdentity("unknown-session", "clgrant0000000000000002", SHOP)),
    ).toBe("IDENTITY_SESSION_BINDING_REQUIRED");
  });

  it("stops acting the moment the grant identity is revoked", async () => {
    await bindOwnerIdentitySession("owner-session", SHOP);
    await bindAgentGrantIdentity("owner-session", GRANT, SHOP);
    await revokeAgentGrantIdentity(GRANT, SHOP);
    await revokeAgentGrantIdentity(GRANT, SHOP);
    expect(await codeOf(trustedActorForAgentGrant(GRANT, SHOP))).toBe(
      "MCP_AGENT_IDENTITY_REVOKED",
    );
  });

  it("is disconnected when the owner revokes all other sessions", async () => {
    await bindOwnerIdentitySession("owner-session", SHOP);
    await bindAgentGrantIdentity("owner-session", GRANT, SHOP);
    await bindOwnerIdentitySession("fresh-session", SHOP, { revokeAllOtherSessions: true });
    expect(await codeOf(trustedActorForAgentGrant(GRANT, SHOP))).toBe(
      "MCP_AGENT_IDENTITY_REVOKED",
    );
  });

  it("never resolves a grant that was never bound", async () => {
    await bindOwnerIdentitySession("owner-session", SHOP);
    expect(await codeOf(trustedActorForAgentGrant(GRANT, SHOP))).toBe(
      "MCP_AGENT_IDENTITY_REVOKED",
    );
  });
});
