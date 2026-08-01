import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  context: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "owner-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "shop-a",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 7,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireAction: vi.fn(),
  listInvitations: vi.fn(),
  acceptedIds: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
}));

vi.mock("@/lib/identity/member-authority", () => ({
  listMemberInvitations: harness.listInvitations,
  createMemberInvitation: vi.fn(),
}));

vi.mock("@/lib/identity/team-directory", () => ({
  acceptedInvitationIds: harness.acceptedIds,
}));

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: vi.fn(),
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET } from "@/app/api/auth/invitations/route";
import {
  getPhase2PresetPermissions,
  PHASE2_ACTIONS,
} from "@/lib/identity/permissions";

beforeEach(() => {
  harness.requireAction.mockReset().mockResolvedValue(harness.context);
  harness.listInvitations.mockReset().mockResolvedValue({
    revision: 1,
    invitations: [],
  });
  harness.acceptedIds.mockReset().mockResolvedValue(new Set<string>());
});

describe("invitation permission catalog", () => {
  it("projects the exact immutable server action order and role ceilings", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      permissionCatalog: {
        actions: string[];
        ceilings: Record<"manager" | "operator" | "viewer", string[]>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.permissionCatalog.actions).toEqual(PHASE2_ACTIONS);
    expect(body.permissionCatalog.ceilings).toEqual({
      manager: getPhase2PresetPermissions("manager"),
      operator: getPhase2PresetPermissions("operator"),
      viewer: getPhase2PresetPermissions("viewer"),
    });
    expect(body.permissionCatalog.ceilings.operator).not.toContain(
      "conversations.assign",
    );
    expect(body.permissionCatalog.ceilings.viewer).not.toContain(
      "customers.contact.read",
    );
  });
});
