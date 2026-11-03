import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidecarUnavailableError } from "../sidecar-client";
import {
  clearVerifiedWhatsAppAccount,
  resolveVerifiedWhatsAppAccountId,
  VERIFIED_ACCOUNT_TTL_MS,
} from "../verified-account";

/**
 * F-0024, the remembered account on its own (no database): the edges of the
 * ten minutes, a clock that moves backwards, and every sidecar state that is
 * not "connected".
 */
const harness = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock("../sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sidecar-client")>();
  return { ...actual, sidecar: { ...actual.sidecar, status: harness.status } };
});

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const T0 = Date.parse("2026-11-03T10:00:00.000Z");
const connected = { status: "connected", user: { id: ACCOUNT_ID }, hasQr: false };
const timeout = () => new SidecarUnavailableError("Sidecar request timed out", true);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  harness.status.mockReset();
  clearVerifiedWhatsAppAccount();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("remembered WhatsApp account (F-0024)", () => {
  it("is held for exactly ten minutes", () => {
    expect(VERIFIED_ACCOUNT_TTL_MS).toBe(600_000);
  });

  it("is not trusted when the clock has moved backwards since the good answer", async () => {
    harness.status.mockResolvedValueOnce(connected);
    await resolveVerifiedWhatsAppAccountId();

    vi.setSystemTime(T0 - 5 * 60_000);
    harness.status.mockRejectedValueOnce(timeout());

    await expect(resolveVerifiedWhatsAppAccountId()).rejects.toMatchObject({
      code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("is dropped once too old: it does not come back if the clock is wound back", async () => {
    harness.status.mockResolvedValueOnce(connected);
    await resolveVerifiedWhatsAppAccountId();

    vi.setSystemTime(T0 + VERIFIED_ACCOUNT_TTL_MS + 1);
    harness.status.mockRejectedValueOnce(timeout());
    await expect(resolveVerifiedWhatsAppAccountId()).rejects.toMatchObject({
      code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    });

    vi.setSystemTime(T0 + 1_000);
    harness.status.mockRejectedValueOnce(timeout());
    await expect(resolveVerifiedWhatsAppAccountId()).rejects.toMatchObject({
      code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    });
  });

  it.each(["disconnected", "connecting", "qr"])(
    "an answer of '%s' is a definite no: 409 WHATSAPP_ACCOUNT_NOT_CONNECTED and the account is forgotten",
    async (state) => {
      harness.status.mockResolvedValueOnce(connected);
      await resolveVerifiedWhatsAppAccountId();

      harness.status.mockResolvedValueOnce({ status: state, user: { id: ACCOUNT_ID }, hasQr: false });
      await expect(resolveVerifiedWhatsAppAccountId()).rejects.toMatchObject({
        code: "WHATSAPP_ACCOUNT_NOT_CONNECTED",
        statusCode: 409,
      });

      harness.status.mockRejectedValueOnce(timeout());
      await expect(resolveVerifiedWhatsAppAccountId()).rejects.toMatchObject({
        code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
      });
    },
  );

  it("a live answer replaces the remembered account (a relink to another number)", async () => {
    harness.status.mockResolvedValueOnce(connected);
    await resolveVerifiedWhatsAppAccountId();
    harness.status.mockResolvedValueOnce({
      status: "connected",
      user: { id: "213555777000:3@s.whatsapp.net" },
      hasQr: false,
    });
    await resolveVerifiedWhatsAppAccountId();

    harness.status.mockRejectedValueOnce(timeout());
    await expect(resolveVerifiedWhatsAppAccountId()).resolves.toBe("213555777000:3@s.whatsapp.net");
  });
});
