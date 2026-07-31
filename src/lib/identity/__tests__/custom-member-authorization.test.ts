import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ sessionId: "" }));

vi.mock("@/lib/auth/server", () => ({
  getCurrentSessionAuthority: vi.fn(async () => ({
    status: "authenticated" as const,
    sessionId: harness.sessionId,
    issuedAt: new Date("2026-07-31T20:00:00.000Z"),
    lastSeenAt: new Date("2026-07-31T20:00:00.000Z"),
  })),
}));

import { shopContext } from "@/lib/db";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
} from "@/lib/identity/control-authority";
import {
  assertTrustedAction,
} from "../authorization";
import {
  acceptTeamInvitation,
  teamDirectoryMarkerPath,
  teamDirectoryPath,
} from "../team-directory";
import {
  createMemberInvitation,
  memberAuthorityMarkerPath,
  memberAuthorityPath,
} from "../member-authority";
import { requireTrustedActor } from "../trusted-actor";

function cleanup(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    memberAuthorityPath(),
    memberAuthorityMarkerPath(),
    teamDirectoryPath(),
    teamDirectoryMarkerPath(),
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions expose meaningful cleanup failures.
    }
  }
}

async function acceptedContext(options: {
  role: "manager" | "operator" | "viewer";
  permissions: readonly string[] | null;
  loginId: string;
}) {
  await bindOwnerIdentitySession("owner-session", shopContext);
  const invitation = await createMemberInvitation("owner-session", shopContext, {
    requestId: randomUUID(),
    role: options.role,
    permissions: options.permissions as never,
    shopIds: [shopContext.shopId],
    expiresInHours: 24,
  });
  const accepted = await acceptTeamInvitation(
    {
      token: invitation.token!,
      requestId: randomUUID(),
      displayName: options.loginId,
      loginId: options.loginId,
      pin: "12345678",
    },
    shopContext,
  );
  harness.sessionId = accepted.sessionId;
  return requireTrustedActor();
}

beforeEach(() => {
  cleanup();
  harness.sessionId = "";
});
afterEach(cleanup);

describe("durable custom member authorization", () => {
  it("uses the standard role preset when no custom policy exists", async () => {
    const context = await acceptedContext({
      role: "operator",
      permissions: null,
      loginId: "preset.operator",
    });

    expect(() => assertTrustedAction(context, "shops.switch")).not.toThrow();
    expect(() => assertTrustedAction(context, "members.read")).toThrow(
      expect.objectContaining({ code: "ACTION_FORBIDDEN", statusCode: 403 }),
    );
  });

  it("replaces the preset with the exact custom allowlist", async () => {
    const context = await acceptedContext({
      role: "operator",
      permissions: ["shops.read"],
      loginId: "custom.operator",
    });

    expect(() => assertTrustedAction(context, "shops.read")).not.toThrow();
    expect(() => assertTrustedAction(context, "shops.switch")).toThrow(
      expect.objectContaining({ code: "ACTION_FORBIDDEN", statusCode: 403 }),
    );
  });

  it("treats an empty custom allowlist as deny-all", async () => {
    const context = await acceptedContext({
      role: "viewer",
      permissions: [],
      loginId: "deny.viewer",
    });

    expect(() => assertTrustedAction(context, "shops.read")).toThrow(
      expect.objectContaining({ code: "ACTION_FORBIDDEN", statusCode: 403 }),
    );
  });
});
