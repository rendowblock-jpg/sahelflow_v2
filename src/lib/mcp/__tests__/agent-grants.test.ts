/**
 * MCP-12 agent grants (FD-063): durable, narrowing, instantly revocable.
 *
 * Behaviour runs against the sandbox database; the ingress and registry wiring
 * is pinned at source level because it spans the Next route and the identity
 * layer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { listMcpInvocations } from "@/lib/mcp/control-surface";
import {
  MCP_GRANT_ACTIVE_LIMIT,
  createMcpAgentGrant,
  hashMcpGrantSecret,
  listMcpAgentGrants,
  normalizeGrantRequest,
  resolveMcpAgentGrant,
  revokeMcpAgentGrant,
} from "@/lib/mcp/grants";

const CLIENT = { name: "claude-desktop", version: "1.0" };
const bindIdentity = vi.fn(async (_grantId: string) => undefined);
const revokeIdentity = vi.fn(async (_grantId: string) => undefined);
const GRANTABLE = new Set(["search_orders", "get_order_details", "create_order"]);

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeEach(async () => {
  bindIdentity.mockClear();
  revokeIdentity.mockClear();
  await db.mcpAgentGrant.deleteMany();
  await db.auditLog.deleteMany({ where: { action: "mcp.tool_called.v1" } });
});

describe("grant requests", () => {
  it("dedupes and sorts granted tools", () => {
    expect(
      normalizeGrantRequest(
        { label: "  Claude  ", tools: ["search_orders", "create_order", "search_orders"] },
        GRANTABLE,
      ),
    ).toEqual({ label: "Claude", tools: ["create_order", "search_orders"] });
  });

  it("refuses a tool the creator cannot grant, an empty grant and a bad name", () => {
    expect(() =>
      normalizeGrantRequest({ label: "A", tools: ["cancel_order"] }, GRANTABLE),
    ).toThrow(expect.objectContaining({ code: "MCP_GRANT_TOOL_NOT_GRANTABLE" }));
    expect(() => normalizeGrantRequest({ label: "A", tools: [] }, GRANTABLE)).toThrow(
      expect.objectContaining({ code: "MCP_GRANT_TOOLS_REQUIRED" }),
    );
    expect(() =>
      normalizeGrantRequest({ label: "x".repeat(65), tools: ["search_orders"] }, GRANTABLE),
    ).toThrow(expect.objectContaining({ code: "MCP_GRANT_LABEL_INVALID" }));
  });
});

describe("grant lifecycle", () => {
  it("returns the secret once and stores only its hash", async () => {
    const { grant, secret } = await createMcpAgentGrant(db, {
      label: "Claude",
      tools: ["search_orders"],
      createdBy: "person:owner",
      bindIdentity,
    });
    expect(secret).toMatch(/^sfa_[A-Za-z0-9_-]{43}$/);
    expect(grant.secretHint).toBe(secret.slice(-4));
    expect(JSON.stringify(grant)).not.toContain(secret);

    const row = await db.mcpAgentGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(row.secretHash).toBe(hashMcpGrantSecret(secret));
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it("opens only for an active grant and narrows to its tools", async () => {
    const { grant, secret } = await createMcpAgentGrant(db, {
      label: "Claude",
      tools: ["get_order_details", "search_orders"],
      createdBy: "person:owner",
      bindIdentity,
    });

    const binding = await resolveMcpAgentGrant(db, secret, CLIENT);
    expect(binding.id).toBe(grant.id);
    expect([...binding.tools].sort()).toEqual(["get_order_details", "search_orders"]);

    const touched = await db.mcpAgentGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(touched.lastUsedAt).not.toBeNull();
    expect(touched.lastClientName).toBe("claude-desktop");
  });

  it("fails closed for a missing, malformed or unknown secret", async () => {
    expect(await errorCode(resolveMcpAgentGrant(db, null, CLIENT))).toBe(
      "MCP_AGENT_GRANT_REQUIRED",
    );
    expect(await errorCode(resolveMcpAgentGrant(db, "sfa_short", CLIENT))).toBe(
      "MCP_AGENT_GRANT_REQUIRED",
    );
    expect(
      await errorCode(resolveMcpAgentGrant(db, `sfa_${"a".repeat(43)}`, CLIENT)),
    ).toBe("MCP_AGENT_GRANT_INACTIVE");
  });

  it("revokes instantly and idempotently", async () => {
    const { grant, secret } = await createMcpAgentGrant(db, {
      label: "Claude",
      tools: ["search_orders"],
      createdBy: "person:owner",
      bindIdentity,
    });
    const revoked = await revokeMcpAgentGrant(db, grant.id, "person:owner", revokeIdentity);
    expect(revoked.status).toBe("revoked");
    expect(await errorCode(resolveMcpAgentGrant(db, secret, CLIENT))).toBe(
      "MCP_AGENT_GRANT_INACTIVE",
    );

    // A retry keeps the first revocation and still finishes the identity side.
    const again = await revokeMcpAgentGrant(db, grant.id, "person:other", revokeIdentity);
    expect(again.revokedAt).toBe(revoked.revokedAt);
    expect(revokeIdentity).toHaveBeenCalledTimes(2);
    expect(revokeIdentity).toHaveBeenCalledWith(grant.id);
    expect(
      await errorCode(revokeMcpAgentGrant(db, "missing", "person:owner", revokeIdentity)),
    ).toBe("MCP_GRANT_NOT_FOUND");
  });

  it("binds the grant's identity and deletes a grant it could not bind", async () => {
    const { grant } = await createMcpAgentGrant(db, {
      label: "Claude",
      tools: ["search_orders"],
      createdBy: "person:owner",
      bindIdentity,
    });
    expect(bindIdentity).toHaveBeenCalledWith(grant.id);

    const failing = vi.fn(async () => {
      throw Object.assign(new Error("owner only"), { code: "ACTION_FORBIDDEN" });
    });
    expect(
      await errorCode(
        createMcpAgentGrant(db, {
          label: "Unbound",
          tools: ["search_orders"],
          createdBy: "person:manager",
          bindIdentity: failing,
        }),
      ),
    ).toBe("ACTION_FORBIDDEN");
    expect(await db.mcpAgentGrant.count({ where: { label: "Unbound" } })).toBe(0);
  });

  it("caps active agents and lists active before revoked", async () => {
    const created = [];
    for (let index = 0; index < MCP_GRANT_ACTIVE_LIMIT; index += 1) {
      created.push(
        await createMcpAgentGrant(db, {
          label: `Agent ${index}`,
          tools: ["search_orders"],
          createdBy: "person:owner",
          bindIdentity,
        }),
      );
    }
    expect(
      await errorCode(
        createMcpAgentGrant(db, {
          label: "One too many",
          tools: ["search_orders"],
          createdBy: "person:owner",
          bindIdentity,
        }),
      ),
    ).toBe("MCP_GRANT_LIMIT_REACHED");

    await revokeMcpAgentGrant(db, created[0]!.grant.id, "person:owner", revokeIdentity);
    const listed = await listMcpAgentGrants(db);
    expect(listed.at(-1)?.status).toBe("revoked");
    expect(listed.filter((entry) => entry.status === "active")).toHaveLength(
      MCP_GRANT_ACTIVE_LIMIT - 1,
    );
  });
});

describe("invocation log", () => {
  it("projects audit rows without call arguments", async () => {
    await db.auditLog.create({
      data: {
        action: "mcp.tool_called.v1",
        entity: "mcp_tool",
        entityId: "create_order",
        actor: "agent:abc",
        metadata: JSON.stringify({
          via: "mcp",
          grantId: "grant-1",
          client: { name: "claude-desktop", version: "1.0" },
          outcome: "proposed",
          errorCode: null,
          proposalId: "proposal-1",
          durationMs: 42,
          args: { customerPhone: "[redacted]" },
        }),
      },
    });
    const [entry] = await listMcpInvocations(db);
    expect(entry).toMatchObject({
      toolName: "create_order",
      agentActor: "agent:abc",
      grantId: "grant-1",
      clientName: "claude-desktop",
      outcome: "proposed",
      proposalId: "proposal-1",
      durationMs: 42,
    });
    expect(JSON.stringify(entry)).not.toContain("customerPhone");
  });
});

describe("grant wiring", () => {
  it("requires an active grant at MCP ingress and acts under its own identity", () => {
    const route = source("src/app/api/mcp/route.ts");
    expect(route).toContain('request.headers.get("x-sahelflow-agent-grant")');
    expect(route).toContain("resolveMcpAgentGrant(");
    expect(route).toContain("trustedActorForAgentGrant(grant.id, shopContext)");
    expect(route).toContain('assertTrustedAction(actorContext, "ai.use"');
    // No browser session is borrowed.
    expect(route).not.toContain("requireAuth(");
    expect(route).toContain("openMcpAgentSession({ actorContext, client: clientInfo, grant })");
  });

  it("lets only the owner connect an agent and binds or revokes its identity", () => {
    const grants = source("src/app/api/mcp/grants/route.ts");
    expect(grants).toContain('actor.role !== "owner"');
    expect(grants).toContain("MCP_GRANT_OWNER_ONLY");
    expect(grants).toContain("bindAgentGrantIdentity(actor.sessionId, grantId, shopContext)");
    expect(source("src/app/api/mcp/grants/[id]/revoke/route.ts")).toContain(
      "revokeAgentGrantIdentity(grantId, shopContext)",
    );
  });

  it("narrows both listing and execution by the grant", () => {
    const registry = source("src/lib/mcp/registry.ts");
    expect(registry.match(/session\.grant\.tools\.has\(entry\.name\)/g)).toHaveLength(2);
  });

  it("derives the agent identity from the grant and audits the grant id", () => {
    expect(source("src/lib/mcp/agent-session.ts")).toContain(
      '.update(input.grant.id, "utf8")',
    );
    expect(source("src/lib/mcp/audit.ts")).toContain("grantId: record.grantId");
  });

  it("guards grant management with integrations authority", () => {
    const grants = source("src/app/api/mcp/grants/route.ts");
    expect(grants).toContain('requireAuth(["ai.use", "integrations.read"])');
    expect(grants).toContain('requireAuth(["ai.use", "integrations.manage"])');
    expect(source("src/app/api/mcp/grants/[id]/revoke/route.ts")).toContain(
      'requireAuth(["ai.use", "integrations.manage"])',
    );
  });
});
