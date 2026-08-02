import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const harness = vi.hoisted(() => ({
  snapshot: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("../control-authority", () => ({
  getIdentityAdministrationSnapshot: harness.snapshot,
}));

vi.mock("../team-revocation-authority", () => ({
  revokeTeamMemberAuthority: harness.revoke,
}));

import { revokeFreshOwnerTeamMemberAuthority } from "../team-revocation-command";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

const INPUT = Object.freeze({
  currentOwnerSessionId: "owner-session",
  targetMemberId: "6".repeat(32),
  shop: SHOP,
});

const OWNER = Object.freeze({
  currentActor: Object.freeze({
    role: "owner" as const,
    workspaceMemberId: "9".repeat(32),
  }),
});

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  harness.snapshot.mockReset().mockResolvedValue(OWNER);
  harness.revoke.mockReset().mockResolvedValue({
    state: "revoked",
    memberId: INPUT.targetMemberId,
    personId: "5".repeat(32),
    deviceId: "7".repeat(32),
    revokedAt: "2026-08-01T02:00:00.000Z",
    revision: 2,
    sessionIds: ["member-session"],
  });
});

describe("revokeFreshOwnerTeamMemberAuthority", () => {
  it("revalidates a queued owner after waiting and blocks stale authority", async () => {
    const gate = deferred();
    harness.snapshot
      .mockImplementationOnce(async () => {
        await gate.promise;
        return OWNER;
      })
      .mockRejectedValueOnce(
        new SahelFlowError(
          "The authenticated session has no durable identity binding",
          "IDENTITY_SESSION_BINDING_REQUIRED",
          401,
        ),
      );

    const first = revokeFreshOwnerTeamMemberAuthority(INPUT);
    await vi.waitFor(() => expect(harness.snapshot).toHaveBeenCalledTimes(1));

    const second = revokeFreshOwnerTeamMemberAuthority({
      ...INPUT,
      targetMemberId: "8".repeat(32),
    });
    await Promise.resolve();
    expect(harness.snapshot).toHaveBeenCalledTimes(1);

    gate.resolve();
    await expect(first).resolves.toMatchObject({ state: "revoked" });
    await expect(second).rejects.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
      statusCode: 401,
    });
    expect(harness.revoke).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-owner before durable member authority changes", async () => {
    harness.snapshot.mockResolvedValue({
      currentActor: { role: "manager", workspaceMemberId: "9".repeat(32) },
    });

    await expect(
      revokeFreshOwnerTeamMemberAuthority(INPUT),
    ).rejects.toMatchObject({
      code: "ACTION_FORBIDDEN",
      statusCode: 403,
    });
    expect(harness.revoke).not.toHaveBeenCalled();
  });
});
