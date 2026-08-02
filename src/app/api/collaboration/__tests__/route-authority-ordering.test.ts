import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actor: {
    shop: { shopId: "shop-a" },
    actor: { kind: "person" },
  } as unknown,
  requireTrustedActor: vi.fn(),
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  trustedActionAllowed: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireTrustedActor,
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  assertTrustedAction: harness.assertTrustedAction,
  trustedActionAllowed: harness.trustedActionAllowed,
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: {},
}));

vi.mock("@/lib/collaboration/administration", () => ({
  executeQueueMutation: vi.fn(),
  executeWorkgroupMutation: vi.fn(),
  getCollaborationAdministrationView: vi.fn(),
}));

vi.mock("@/lib/collaboration/comments", () => ({
  executeInternalComment: vi.fn(),
  getInternalCommentVersion: vi.fn(),
  listInternalComments: vi.fn(),
}));

vi.mock("@/lib/collaboration/assignment", () => ({
  executeCollaborationRouting: vi.fn(),
  getCollaborationRoutingVersion: vi.fn(),
}));

vi.mock("@/lib/identity/team-directory", () => ({
  listTeamMembers: vi.fn(),
}));

vi.mock("@/lib/identity/team-revocation-authority", () => ({
  getTeamRevocationSnapshot: vi.fn(),
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; statusCode?: number };
        return Response.json(
          { error: typed.message ?? "Internal server error" },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { POST as postAdministration } from "@/app/api/collaboration/administration/route";
import { POST as postComment } from "@/app/api/collaboration/comments/route";
import { POST as postRouting } from "@/app/api/collaboration/routing/route";

function malformedRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{malformed-json",
  });
}

function forbidden() {
  return Object.assign(new Error("Forbidden"), {
    code: "AUTHORIZATION_FORBIDDEN",
    statusCode: 403,
  });
}

beforeEach(() => {
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.actor);
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actor);
  harness.assertTrustedAction.mockReset();
  harness.trustedActionAllowed.mockReset().mockReturnValue(false);
});

describe("collaboration route authority ordering", () => {
  it("denies comment writes before parsing request input", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce(forbidden());
    const request = malformedRequest("/api/collaboration/comments");
    const json = vi.spyOn(request, "json");

    const response = await postComment(request);

    expect(response.status).toBe(403);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("comments.write");
    expect(json).not.toHaveBeenCalled();
  });

  it("denies queue routing before parsing request input", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce(forbidden());
    const request = malformedRequest("/api/collaboration/routing");
    const json = vi.spyOn(request, "json");

    const response = await postRouting(request);

    expect(response.status).toBe(403);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("queues.read");
    expect(json).not.toHaveBeenCalled();
  });

  it("denies collaboration administration before parsing its discriminator", async () => {
    harness.assertTrustedAction.mockImplementationOnce(() => {
      throw forbidden();
    });
    const request = malformedRequest("/api/collaboration/administration");
    const json = vi.spyOn(request, "json");

    const response = await postAdministration(request);

    expect(response.status).toBe(403);
    expect(harness.assertTrustedAction).toHaveBeenCalledWith(
      harness.actor,
      "workgroups.manage",
      { shopId: "shop-a" },
    );
    expect(json).not.toHaveBeenCalled();
  });
});
