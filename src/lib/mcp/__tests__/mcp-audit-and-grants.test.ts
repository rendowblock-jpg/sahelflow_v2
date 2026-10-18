/**
 * Audit-closure tests for the MCP surface (S06b-01, -03, -04, -07).
 *
 * These run against in-memory fakes so they need no database. The fake grant
 * table mirrors the one SQLite behaviour that matters for S06b-07: NULL sorts
 * before every value in ascending order and after every value in descending
 * order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/db";
import * as auditModule from "@/lib/mcp/audit";
import { writeMcpInvocationAudit, type McpInvocationAuditRecord } from "@/lib/mcp/audit";
import {
  createMcpAgentGrant,
  listMcpAgentGrants,
  revokeMcpAgentGrant,
} from "@/lib/mcp/grants";

interface FakeGrant {
  id: string;
  label: string;
  secretHash: string;
  secretHint: string;
  toolsJson: string;
  createdBy: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastClientName: string | null;
  lastClientVersion: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
}

interface FakeAuditData {
  action: string;
  entity: string;
  entityId: string | null;
  actor: string | null;
  metadata: string | null;
}

type Where = { revokedAt?: null | { not: null } } | undefined;
type OrderBy = Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">> | undefined;

function compareNullable(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  const l = left instanceof Date ? left.getTime() : (left as number | string);
  const r = right instanceof Date ? right.getTime() : (right as number | string);
  return l < r ? -1 : l > r ? 1 : 0;
}

function makeGrant(index: number, over: Partial<FakeGrant> = {}): FakeGrant {
  return {
    id: `grant-${index}`,
    label: `Agent ${index}`,
    secretHash: `hash-${index}`,
    secretHint: "abcd",
    toolsJson: JSON.stringify(["search_orders"]),
    createdBy: "person:owner",
    createdAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
    lastUsedAt: null,
    lastClientName: null,
    lastClientVersion: null,
    revokedAt: null,
    revokedBy: null,
    ...over,
  };
}

function makeDb(seed: FakeGrant[] = []) {
  const grants = [...seed];
  const audits: FakeAuditData[] = [];
  const failAudit = { value: false };
  let sequence = 1000;
  const db = {
    mcpAgentGrant: {
      count: async ({ where }: { where?: Where }) =>
        grants.filter((row) => matches(row, where)).length,
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where?: Where;
        orderBy?: OrderBy;
        take?: number;
      }) => {
        const rows = grants.filter((row) => matches(row, where));
        const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map(
          (entry) => Object.entries(entry)[0] as [keyof FakeGrant, "asc" | "desc"],
        );
        rows.sort((a, b) => {
          for (const [field, direction] of keys) {
            const order = compareNullable(a[field], b[field]);
            if (order !== 0) return direction === "asc" ? order : -order;
          }
          return 0;
        });
        return typeof take === "number" ? rows.slice(0, take) : rows;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        grants.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Partial<FakeGrant> }) => {
        sequence += 1;
        const row = makeGrant(sequence, { ...data, id: `grant-${sequence}` });
        grants.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeGrant> }) => {
        const row = grants.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = grants.findIndex((candidate) => candidate.id === where.id);
        if (index >= 0) grants.splice(index, 1);
        return {};
      },
    },
    auditLog: {
      create: async ({ data }: { data: FakeAuditData }) => {
        if (failAudit.value) throw new Error("audit store unavailable");
        audits.push(data);
        return data;
      },
    },
  };
  return { db: db as unknown as DbClient, grants, audits, failAudit };
}

function matches(row: FakeGrant, where: Where): boolean {
  if (!where || where.revokedAt === undefined) return true;
  if (where.revokedAt === null) return row.revokedAt === null;
  return row.revokedAt !== null;
}

describe("S06b-07 grant list ordering", () => {
  it("lists every active grant, then revoked grants newest revocation first", async () => {
    const seed: FakeGrant[] = [];
    // 130 revoked grants, revoked on successive days; grant-130 is the newest.
    for (let index = 1; index <= 130; index += 1) {
      seed.push(
        makeGrant(index, {
          revokedAt: new Date(Date.UTC(2026, 1, 1) + index * 86_400_000),
          revokedBy: "person:owner",
        }),
      );
    }
    seed.push(makeGrant(201), makeGrant(202), makeGrant(203));
    const { db } = makeDb(seed);

    const list = await listMcpAgentGrants(db);

    expect(list.length).toBeLessThanOrEqual(100);
    const active = list.filter((grant) => grant.status === "active");
    expect(active.map((grant) => grant.id).sort()).toEqual(["grant-201", "grant-202", "grant-203"]);
    const revoked = list.filter((grant) => grant.status === "revoked");
    // The most recent revocation must be visible, and the order is newest first.
    expect(revoked[0]?.id).toBe("grant-130");
    expect(revoked.map((grant) => grant.id)).toContain("grant-130");
    const stamps = revoked.map((grant) => Date.parse(grant.revokedAt ?? ""));
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
    // Active rows come first.
    expect(list.slice(0, 3).every((grant) => grant.status === "active")).toBe(true);
  });
});

describe("S06b-03 grant audit rows", () => {
  it("audits grant creation with field names only", async () => {
    const { db, audits } = makeDb();
    const created = await createMcpAgentGrant(db, {
      label: "Claude Desktop (kitchen)",
      tools: ["search_orders", "create_order"],
      createdBy: "person:owner",
      bindIdentity: async () => undefined,
    });

    expect(audits).toHaveLength(1);
    const row = audits[0]!;
    expect(row.action).toBe("mcp.grant_created.v1");
    expect(row.entity).toBe("mcp_grant");
    expect(row.entityId).toBe(created.grant.id);
    expect(row.actor).toBe("person:owner");
    const metadata = JSON.parse(row.metadata ?? "{}") as Record<string, unknown>;
    expect(metadata.fields).toEqual(["label", "tools"]);
    expect(metadata.toolCount).toBe(2);
    expect(row.metadata).not.toContain(created.secret);
    expect(row.metadata).not.toContain("Claude Desktop");
  });

  it("writes no creation row when the identity binding fails", async () => {
    const { db, audits, grants } = makeDb();
    await expect(
      createMcpAgentGrant(db, {
        label: "Agent",
        tools: ["search_orders"],
        createdBy: "person:owner",
        bindIdentity: async () => {
          throw new Error("bind failed");
        },
      }),
    ).rejects.toThrow("bind failed");
    expect(audits).toHaveLength(0);
    expect(grants).toHaveLength(0);
  });

  it("audits a revocation once, and not again when the revoke is repeated", async () => {
    const { db, audits } = makeDb([makeGrant(1)]);
    const revokeIdentity = vi.fn(async () => undefined);

    await revokeMcpAgentGrant(db, "grant-1", "person:owner", revokeIdentity);
    await revokeMcpAgentGrant(db, "grant-1", "person:owner", revokeIdentity);

    expect(audits).toHaveLength(1);
    const row = audits[0]!;
    expect(row.action).toBe("mcp.grant_revoked.v1");
    expect(row.entity).toBe("mcp_grant");
    expect(row.entityId).toBe("grant-1");
    expect(row.actor).toBe("person:owner");
    const metadata = JSON.parse(row.metadata ?? "{}") as Record<string, unknown>;
    expect(metadata.fields).toEqual(["revokedAt", "revokedBy"]);
    expect(row.metadata).not.toContain("Agent 1");
  });

  it("never lets a failing audit write block creation or revocation", async () => {
    const { db, failAudit } = makeDb([makeGrant(1)]);
    failAudit.value = true;
    const created = await createMcpAgentGrant(db, {
      label: "Agent",
      tools: ["search_orders"],
      createdBy: "person:owner",
      bindIdentity: async () => undefined,
    });
    expect(created.secret.startsWith("sfa_")).toBe(true);
    const revoked = await revokeMcpAgentGrant(db, "grant-1", "person:owner", async () => undefined);
    expect(revoked.status).toBe("revoked");
  });
});

function record(over: Partial<McpInvocationAuditRecord> = {}): McpInvocationAuditRecord {
  return {
    toolName: "get_stats",
    executionClass: "read",
    agentActor: "agent:g1",
    onBehalfOf: "person:owner",
    grantId: "g1",
    clientName: "claude",
    clientVersion: "1.0",
    outcome: "succeeded",
    errorCode: null,
    proposalId: null,
    durationMs: 3,
    args: {},
    ...over,
  };
}

function resetCoalescing(): void {
  // Optional call: on code that predates the coalescer this is a no-op, so the
  // assertions below fail for the behavioural reason rather than a missing export.
  (auditModule as { resetMcpAuditCoalescing?: () => void }).resetMcpAuditCoalescing?.();
}

describe("S06b-01 MCP traffic must not flood the shared audit log", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    resetCoalescing();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetCoalescing();
  });

  it("writes one row for a burst of identical reads and counts the rest", async () => {
    const { db, audits } = makeDb();
    for (let index = 0; index < 500; index += 1) {
      await writeMcpInvocationAudit(db, record());
    }
    expect(audits).toHaveLength(1);

    vi.setSystemTime(new Date("2026-03-01T10:01:30Z"));
    await writeMcpInvocationAudit(db, record());
    expect(audits).toHaveLength(2);
    const second = JSON.parse(audits[1]!.metadata ?? "{}") as Record<string, unknown>;
    expect(second.coalescedCalls).toBe(499);
  });

  it("keeps different tools, outcomes and grants apart", async () => {
    const { db, audits } = makeDb();
    await writeMcpInvocationAudit(db, record());
    await writeMcpInvocationAudit(db, record({ toolName: "search_orders" }));
    await writeMcpInvocationAudit(db, record({ grantId: "g2", agentActor: "agent:g2" }));
    await writeMcpInvocationAudit(db, record({ outcome: "failed", errorCode: "X" }));
    expect(audits).toHaveLength(4);
  });

  it("never coalesces a proposal row: each one is a persisted decision record", async () => {
    const { db, audits } = makeDb();
    for (let index = 0; index < 5; index += 1) {
      await writeMcpInvocationAudit(
        db,
        record({
          toolName: "create_order",
          executionClass: "sensitive",
          outcome: "proposed",
          proposalId: `p${index}`,
        }),
      );
    }
    expect(audits).toHaveLength(5);
  });

  it("coalesces refusal rows per grant whatever tool name the agent invents", async () => {
    const { db, audits } = makeDb();
    for (let index = 0; index < 300; index += 1) {
      await writeMcpInvocationAudit(
        db,
        record({ toolName: `probe_${index}`, outcome: "denied", errorCode: "MCP_TOOL_NOT_FOUND" }),
      );
    }
    expect(audits).toHaveLength(1);
  });

  it("bounds the stored tool name", async () => {
    const { db, audits } = makeDb();
    await writeMcpInvocationAudit(
      db,
      record({ toolName: "x".repeat(5000), outcome: "denied", errorCode: "MCP_TOOL_NOT_FOUND" }),
    );
    expect(audits).toHaveLength(1);
    expect((audits[0]!.entityId ?? "").length).toBeLessThanOrEqual(64);
  });

  it("keeps its own bookkeeping bounded", async () => {
    const { db } = makeDb();
    for (let index = 0; index < 5000; index += 1) {
      await writeMcpInvocationAudit(db, record({ grantId: `grant-${index}` }));
    }
    const size = (auditModule as { mcpAuditCoalescerSize?: () => number }).mcpAuditCoalescerSize;
    expect(size).toBeTypeOf("function");
    expect(size?.() ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(2000);
  });
});
