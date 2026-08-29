import { describe, expect, it } from "vitest";

import {
  BAILEYS_MESSAGE_STATUS,
  baileysFailureText,
  mapBaileysDeliveryStatus,
  mapBaileysStatusUpdate,
} from "./delivery-status";

/**
 * The installed dependency's own proto enum. If Baileys ever changes the
 * numbering, this import fails the test here instead of silently lying in the
 * inbox again (the old private mappers assumed {PENDING:0, SENT:1, ...}).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const installedProtoStatus = (
  require("@whiskeysockets/baileys/WAProto") as {
    proto: { WebMessageInfo: { Status: Record<string, number> } };
  }
).proto.WebMessageInfo.Status;

describe("Baileys status enum truth (pinned against installed dependency)", () => {
  it("pins the installed WebMessageInfo.Status numbering", () => {
    expect(installedProtoStatus).toMatchObject({
      ERROR: 0,
      PENDING: 1,
      SERVER_ACK: 2,
      DELIVERY_ACK: 3,
      READ: 4,
      PLAYED: 5,
    });
    expect(BAILEYS_MESSAGE_STATUS).toEqual({
      ERROR: 0,
      PENDING: 1,
      SERVER_ACK: 2,
      DELIVERY_ACK: 3,
      READ: 4,
      PLAYED: 5,
    });
  });

  it("maps every numeric status emitted by the installed runtime truthfully", () => {
    // Cross-check: the mapper is fed the ACTUAL enum object from the
    // installed package, not a hand-copied fixture.
    expect(mapBaileysDeliveryStatus(installedProtoStatus.ERROR)).toBe("failed");
    expect(mapBaileysDeliveryStatus(installedProtoStatus.PENDING)).toBe(
      "sending",
    );
    expect(mapBaileysDeliveryStatus(installedProtoStatus.SERVER_ACK)).toBe(
      "sent",
    );
    expect(mapBaileysDeliveryStatus(installedProtoStatus.DELIVERY_ACK)).toBe(
      "delivered",
    );
    expect(mapBaileysDeliveryStatus(installedProtoStatus.READ)).toBe("read");
    expect(mapBaileysDeliveryStatus(installedProtoStatus.PLAYED)).toBe("read");
  });

  it("maps the string forms Baileys may serialize", () => {
    expect(mapBaileysDeliveryStatus("ERROR")).toBe("failed");
    expect(mapBaileysDeliveryStatus("PENDING")).toBe("sending");
    expect(mapBaileysDeliveryStatus("SERVER_ACK")).toBe("sent");
    expect(mapBaileysDeliveryStatus("DELIVERY_ACK")).toBe("delivered");
    // Legacy spellings kept truthful where they agree with the installed enum.
    expect(mapBaileysDeliveryStatus("DELIVERED")).toBe("delivered");
    expect(mapBaileysDeliveryStatus("READ")).toBe("read");
    expect(mapBaileysDeliveryStatus("PLAYED")).toBe("read");
  });

  it("returns null for unknown or absent values instead of mislabeling", () => {
    expect(mapBaileysDeliveryStatus(undefined)).toBeNull();
    expect(mapBaileysDeliveryStatus(null)).toBeNull();
    expect(mapBaileysDeliveryStatus(6)).toBeNull();
    expect(mapBaileysDeliveryStatus("FUTURE_PROOF")).toBeNull();
    expect(mapBaileysDeliveryStatus({})).toBeNull();
  });

  it("treats an explicit error field as failure regardless of status", () => {
    expect(
      mapBaileysStatusUpdate({ error: { code: 599 }, status: 3 }),
    ).toBe("failed");
    expect(mapBaileysStatusUpdate({ error: "boom" })).toBe("failed");
  });

  it("surfaces messageStubParameters as failure detail for device failures", () => {
    // Device-failure receipts carry {status: ERROR, messageStubParameters}
    // with NO error field (messages-recv.js). The old code rendered these as
    // "sending" forever.
    const update = {
      status: installedProtoStatus.ERROR,
      messageStubParameters: ["599", "boom"],
    };
    expect(mapBaileysStatusUpdate(update)).toBe("failed");
    expect(baileysFailureText(update)).toBe("599; boom");
  });

  it("prefers the explicit error text over stub parameters", () => {
    expect(
      baileysFailureText({ error: "explicit", messageStubParameters: ["stub"] }),
    ).toBe("explicit");
    expect(baileysFailureText({ messageStubParameters: ["only stub"] })).toBe(
      "only stub",
    );
    expect(baileysFailureText({ status: 0 })).toBeNull();
    expect(baileysFailureText(null)).toBeNull();
  });
});
