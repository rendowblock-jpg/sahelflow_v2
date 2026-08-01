import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  allowed: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  trustedActionAllowed: harness.allowed,
}));

import { projectConversationForTrustedActor } from "../conversation-projection";
import type { TrustedActorContext } from "../trusted-actor";

const actorContext = {
  actor: { kind: "person" },
  shop: { shopId: "default" },
} as unknown as TrustedActorContext;

describe("conversation field projection", () => {
  beforeEach(() => harness.allowed.mockReset());

  it("redacts customer identity and provider JID without contact-read authority", () => {
    harness.allowed.mockReturnValue(false);

    expect(
      projectConversationForTrustedActor(
        {
          id: "conversation-1",
          contactName: "Amina",
          contactPhone: "0555000000",
          sourceId: "213555000000@s.whatsapp.net",
        },
        actorContext,
      ),
    ).toEqual({
      id: "conversation-1",
      contactName: null,
      contactPhone: null,
      sourceId: null,
      fieldAccess: { contact: false },
    });
  });

  it("retains customer identity only with exact contact-read authority", () => {
    harness.allowed.mockReturnValue(true);

    expect(
      projectConversationForTrustedActor(
        {
          id: "conversation-1",
          contactName: "Amina",
          contactPhone: "0555000000",
          sourceId: "213555000000@s.whatsapp.net",
        },
        actorContext,
      ),
    ).toMatchObject({
      contactName: "Amina",
      contactPhone: "0555000000",
      sourceId: "213555000000@s.whatsapp.net",
      fieldAccess: { contact: true },
    });
  });
});
