import { describe, expect, it } from "vitest";

import { resolveEffectiveWhatsAppStatus } from "../inbox/inbox-workspace-shared";

describe("Inbox effective WhatsApp status", () => {
  it("follows the push channel while it is open", () => {
    expect(
      resolveEffectiveWhatsAppStatus({
        wsOpen: true,
        pushedStatus: "connecting",
        polledStatus: "connected",
      }),
    ).toBe("connecting");
  });

  it("ignores a closed channel's stale status so Send follows the durable truth", () => {
    // The push channel gave up after sleep and last said "disconnected"; the
    // sidecar has since reconnected to WhatsApp.
    expect(
      resolveEffectiveWhatsAppStatus({
        wsOpen: false,
        pushedStatus: "disconnected",
        polledStatus: "connected",
      }),
    ).toBe("connected");
  });

  it("does not invent a connection when nothing durable is known yet", () => {
    expect(
      resolveEffectiveWhatsAppStatus({
        wsOpen: false,
        pushedStatus: "connected",
        polledStatus: null,
      }),
    ).toBeNull();
  });

  it("falls back to the polled status when an open channel has not reported yet", () => {
    expect(
      resolveEffectiveWhatsAppStatus({
        wsOpen: true,
        pushedStatus: null,
        polledStatus: "qr",
      }),
    ).toBe("qr");
  });
});
