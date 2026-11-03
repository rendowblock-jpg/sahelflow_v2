process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, shopContext } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import {
  SidecarRequestError,
  SidecarUnavailableError,
} from "../sidecar-client";
import { clearVerifiedWhatsAppAccount } from "../verified-account";

/**
 * F-0024. The receive path asks the sidecar "which account are you?" before it
 * saves anything. While the sidecar is busy answering nothing else, that call
 * times out and every message waits in the spool. These tests pin what the
 * path does with each kind of answer, with a fake clock and a mocked sidecar.
 */
const harness = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock("../sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sidecar-client")>();
  return { ...actual, sidecar: { ...actual.sidecar, status: harness.status } };
});

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const OTHER_ACCOUNT_ID = "213555888000:14@s.whatsapp.net";
const MINUTE = 60_000;
const T0 = Date.parse("2026-11-03T10:00:00.000Z");
const context = { prisma: db, shop: shopContext };

function envelope(id: string, accountId = ACCOUNT_ID): WhatsAppInboundEnvelope {
  return {
    spoolId: "a".repeat(64),
    accountId,
    receivedAt: "2026-11-03T09:59:00.000Z",
    message: {
      key: { remoteJid: "213555000111@s.whatsapp.net", fromMe: false, id },
      message: { conversation: `message ${id}` },
      messageTimestamp: 1_786_000_000,
    },
  };
}

const connected = (id = ACCOUNT_ID) => ({
  status: "connected" as const,
  user: { id },
  hasQr: false,
});
const timeout = () => new SidecarUnavailableError("Sidecar request timed out", true);

async function refusal(promise: Promise<unknown>): Promise<SahelFlowError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SahelFlowError);
  return error as SahelFlowError;
}

function at(offsetMs: number): void {
  vi.setSystemTime(T0 + offsetMs);
}

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  harness.status.mockReset();
  clearVerifiedWhatsAppAccount();
  await clean();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("account resolution on the WhatsApp receive path (F-0024)", () => {
  it("asks the sidecar, then saves the message when the account matches", async () => {
    harness.status.mockResolvedValue(connected());

    const result = await persistWhatsAppInbound(context, envelope("OK-1"));

    expect(result).toMatchObject({ status: "received", replayed: false });
    expect(harness.status).toHaveBeenCalledTimes(1);
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("after a good answer, a timeout inside ten minutes still saves the message", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("CACHE-1"));

    at(10 * MINUTE - 1);
    harness.status.mockRejectedValueOnce(timeout());
    const result = await persistWhatsAppInbound(context, envelope("CACHE-2"));

    expect(result).toMatchObject({ status: "received", replayed: false });
    expect(harness.status).toHaveBeenCalledTimes(2);
    await expect(db.providerIngressEvent.count()).resolves.toBe(2);
  });

  it("at exactly ten minutes the remembered account is too old: 503 WHATSAPP_ACCOUNT_UNAVAILABLE, nothing saved", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("TTL-1"));

    at(10 * MINUTE);
    harness.status.mockRejectedValueOnce(timeout());
    const error = await refusal(persistWhatsAppInbound(context, envelope("TTL-2")));

    expect(error).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE", statusCode: 503 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("a timeout with nothing remembered is 503 WHATSAPP_ACCOUNT_UNAVAILABLE and saves nothing", async () => {
    harness.status.mockRejectedValue(timeout());

    const error = await refusal(persistWhatsAppInbound(context, envelope("NONE-1")));

    expect(error).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE", statusCode: 503 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  it("a good answer refreshes the ten minutes; a transport failure does not", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("REFRESH-1"));

    at(9 * MINUTE);
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("REFRESH-2"));

    at(18 * MINUTE);
    harness.status.mockRejectedValueOnce(timeout());
    await persistWhatsAppInbound(context, envelope("REFRESH-3"));

    // 18 min used the answer of minute 9 (age 9). That use did not renew it.
    at(19 * MINUTE + 1);
    harness.status.mockRejectedValueOnce(timeout());
    const error = await refusal(persistWhatsAppInbound(context, envelope("REFRESH-4")));
    expect(error.code).toBe("WHATSAPP_ACCOUNT_UNAVAILABLE");
    await expect(db.providerIngressEvent.count()).resolves.toBe(3);
  });

  it("a definite 'not connected' answer is refused as 409 WHATSAPP_ACCOUNT_NOT_CONNECTED and forgets the account", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("DISC-1"));

    at(MINUTE);
    harness.status.mockResolvedValueOnce({ status: "disconnected", user: null, hasQr: false });
    const refused = await refusal(persistWhatsAppInbound(context, envelope("DISC-2")));
    expect(refused).toMatchObject({ code: "WHATSAPP_ACCOUNT_NOT_CONNECTED", statusCode: 409 });

    // The very next call times out one minute later: the old answer must not come back.
    at(2 * MINUTE);
    harness.status.mockRejectedValueOnce(timeout());
    const after = await refusal(persistWhatsAppInbound(context, envelope("DISC-3")));
    expect(after).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE", statusCode: 503 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("a connected answer without an account id is 409 WHATSAPP_ACCOUNT_NOT_CONNECTED", async () => {
    harness.status.mockResolvedValue({ status: "connected", user: null, hasQr: false });

    const error = await refusal(persistWhatsAppInbound(context, envelope("NOID-1")));

    expect(error).toMatchObject({ code: "WHATSAPP_ACCOUNT_NOT_CONNECTED", statusCode: 409 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  it("a message of another account is 409 WHATSAPP_ACCOUNT_MISMATCH, saves nothing, and forgets the account", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("MIS-1"));

    at(MINUTE);
    harness.status.mockResolvedValueOnce(connected());
    const mismatch = await refusal(
      persistWhatsAppInbound(context, envelope("MIS-2", OTHER_ACCOUNT_ID)),
    );
    expect(mismatch).toMatchObject({ code: "WHATSAPP_ACCOUNT_MISMATCH", statusCode: 409 });
    expect(mismatch.message).toMatch(/different paired account/i);

    at(2 * MINUTE);
    harness.status.mockRejectedValueOnce(timeout());
    const after = await refusal(persistWhatsAppInbound(context, envelope("MIS-3")));
    expect(after.code).toBe("WHATSAPP_ACCOUNT_UNAVAILABLE");
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("the remembered account is as strict as a live answer: another account's message is refused", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("STRICT-1"));

    at(MINUTE);
    harness.status.mockRejectedValueOnce(timeout());
    const mismatch = await refusal(
      persistWhatsAppInbound(context, envelope("STRICT-2", OTHER_ACCOUNT_ID)),
    );

    expect(mismatch).toMatchObject({ code: "WHATSAPP_ACCOUNT_MISMATCH", statusCode: 409 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it.each([
    ["a timeout", () => timeout()],
    ["connection refused", () => new SidecarUnavailableError("WhatsApp sidecar is not reachable", false)],
    ["an HTTP 500", () => new SidecarRequestError("Sidecar HTTP 500", "SIDECAR_REJECTED", false, true, 500)],
    ["an HTTP 503", () => new SidecarRequestError("Sidecar HTTP 503", "SIDECAR_REJECTED", true, true, 503)],
  ])("%s counts as a transport failure and uses the remembered account", async (_label, failure) => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("T-1"));

    at(MINUTE);
    harness.status.mockRejectedValueOnce(failure());
    const result = await persistWhatsAppInbound(context, envelope("T-2"));

    expect(result.replayed).toBe(false);
    await expect(db.providerIngressEvent.count()).resolves.toBe(2);
  });

  it.each([
    ["a rejected token (HTTP 401)", () => new SidecarRequestError("Unauthorized", "SIDECAR_REJECTED", false, true, 401)],
    ["a client error (HTTP 404)", () => new SidecarRequestError("Not found", "SIDECAR_REJECTED", false, true, 404)],
    ["an unexpected error", () => new Error("boom")],
  ])("%s is NOT a transport failure: the remembered account is not used", async (_label, failure) => {
    harness.status.mockResolvedValueOnce(connected());
    await persistWhatsAppInbound(context, envelope("N-1"));

    at(MINUTE);
    harness.status.mockRejectedValueOnce(failure());
    const error = await refusal(persistWhatsAppInbound(context, envelope("N-2")));

    expect(error).toMatchObject({ code: "WHATSAPP_ACCOUNT_UNAVAILABLE", statusCode: 503 });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("when the context already names the account, the sidecar is not asked at all", async () => {
    const result = await persistWhatsAppInbound(
      { ...context, whatsAppProviderAccountId: ACCOUNT_ID },
      envelope("CTX-1"),
    );

    expect(result.replayed).toBe(false);
    expect(harness.status).not.toHaveBeenCalled();
  });
});

describe("the refusal codes are safe for the sidecar's failure channel", () => {
  const CODES = [
    "WHATSAPP_ACCOUNT_UNAVAILABLE",
    "WHATSAPP_ACCOUNT_NOT_CONNECTED",
    "WHATSAPP_ACCOUNT_MISMATCH",
  ];

  it("each code passes the health regex and the spool's own stricter code regex", () => {
    const health = readFileSync(
      join(process.cwd(), "sidecars/whatsapp/ingress-health.ts"),
      "utf8",
    );
    // Contract: this is the regex the sidecar publishes lastFailureCode through.
    expect(health).toContain("const FAILURE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;");
    for (const code of CODES) {
      expect(code).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
      expect(code).toMatch(/^[A-Za-z0-9_]{1,40}$/);
    }
    expect(new Set(CODES).size).toBe(CODES.length);
  });
});
