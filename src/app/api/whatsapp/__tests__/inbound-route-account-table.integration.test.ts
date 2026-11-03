process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { SidecarRequestError, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { clearVerifiedWhatsAppAccount } from "@/lib/whatsapp/verified-account";

/**
 * F-0024. The route table of POST /api/whatsapp/inbound: the REAL handler, the
 * REAL error wrapper and the REAL database, with only the sidecar's status
 * call and its bearer check replaced. For each way the receive path can say
 * no, the table pins the HTTP status, the machine code the sidecar will store
 * as the reason the message is stuck, and whether a row was written.
 */
const harness = vi.hoisted(() => ({ authenticated: true, status: vi.fn() }));

vi.mock("@/lib/whatsapp/sidecar-rest-auth", () => ({
  authenticateWhatsAppSidecar: vi.fn(() => harness.authenticated),
}));

vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>();
  return { ...actual, sidecar: { ...actual.sidecar, status: harness.status } };
});

import { POST } from "@/app/api/whatsapp/inbound/route";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const OTHER_ACCOUNT_ID = "213555888000:14@s.whatsapp.net";

function envelope(id: string, accountId = ACCOUNT_ID): Record<string, unknown> {
  return {
    spoolId: "d".repeat(64),
    accountId,
    receivedAt: "2026-11-03T09:59:00.000Z",
    message: {
      key: { remoteJid: "213555000333@s.whatsapp.net", fromMe: false, id },
      message: { conversation: `route table ${id}` },
      messageTimestamp: 1_786_000_200,
      pushName: "Route Table",
    },
  };
}

function post(body: unknown, raw = false): Promise<Response> {
  return POST(
    new NextRequest("http://localhost/api/whatsapp/inbound", {
      method: "POST",
      headers: {
        Authorization: "Bearer private-sidecar-token",
        "Content-Type": "application/json",
      },
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

const connected = (id = ACCOUNT_ID) => ({ status: "connected", user: { id }, hasQr: false });
const timeout = () => new SidecarUnavailableError("Sidecar request timed out", true);

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.auditLog.deleteMany();
}

beforeEach(async () => {
  harness.authenticated = true;
  harness.status.mockReset();
  clearVerifiedWhatsAppAccount();
  await clean();
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

interface Row {
  name: string;
  /** What the sidecar's status call does. */
  sidecar: () => Promise<unknown>;
  body: () => unknown;
  httpStatus: number;
  code: string | undefined;
  rows: number;
  statusCalls: number;
}

const REFUSALS: Row[] = [
  {
    name: "status call times out, nothing remembered",
    sidecar: () => Promise.reject(timeout()),
    body: () => envelope("TABLE-TIMEOUT"),
    httpStatus: 503,
    code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "sidecar refuses the connection, nothing remembered",
    sidecar: () =>
      Promise.reject(new SidecarUnavailableError("WhatsApp sidecar is not reachable", false)),
    body: () => envelope("TABLE-REFUSED"),
    httpStatus: 503,
    code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "sidecar answers HTTP 500, nothing remembered",
    sidecar: () =>
      Promise.reject(new SidecarRequestError("Sidecar HTTP 500", "SIDECAR_REJECTED", false, true, 500)),
    body: () => envelope("TABLE-500"),
    httpStatus: 503,
    code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "sidecar says the account is disconnected",
    sidecar: () => Promise.resolve({ status: "disconnected", user: null, hasQr: false }),
    body: () => envelope("TABLE-DISCONNECTED"),
    httpStatus: 409,
    code: "WHATSAPP_ACCOUNT_NOT_CONNECTED",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "sidecar says connected but names no account",
    sidecar: () => Promise.resolve({ status: "connected", user: null, hasQr: false }),
    body: () => envelope("TABLE-NOID"),
    httpStatus: 409,
    code: "WHATSAPP_ACCOUNT_NOT_CONNECTED",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "the message belongs to another paired account",
    sidecar: () => Promise.resolve(connected()),
    body: () => envelope("TABLE-MISMATCH", OTHER_ACCOUNT_ID),
    httpStatus: 409,
    code: "WHATSAPP_ACCOUNT_MISMATCH",
    rows: 0,
    statusCalls: 1,
  },
  {
    name: "the envelope has no account id (invalid)",
    sidecar: () => Promise.resolve(connected()),
    body: () => {
      const { accountId: _dropped, ...rest } = envelope("TABLE-INVALID");
      return rest;
    },
    httpStatus: 400,
    code: "REQUEST_VALIDATION_FAILED",
    rows: 0,
    // Validation runs first: a malformed envelope never costs a call into the sidecar.
    statusCalls: 0,
  },
];

describe("POST /api/whatsapp/inbound, route table (F-0024)", () => {
  it.each(REFUSALS)("$name -> $httpStatus $code, rows written: $rows", async (row) => {
    harness.status.mockImplementation(row.sidecar);

    const response = await post(row.body());

    expect(response.status).toBe(row.httpStatus);
    await expect(response.json()).resolves.toMatchObject({ code: row.code });
    await expect(db.providerIngressEvent.count()).resolves.toBe(row.rows);
    expect(harness.status).toHaveBeenCalledTimes(row.statusCalls);
    if (row.code) {
      // What the sidecar keeps as "why this message is stuck" must survive its own filter.
      expect(row.code).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    }
  });

  it("good account -> 201, acknowledged, and the row exists, applied", async () => {
    harness.status.mockResolvedValue(connected());

    const response = await post(envelope("TABLE-OK"));

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, acknowledged: true, status: "applied", replayed: false });
    const rows = await db.providerIngressEvent.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: json.ingressEventId, status: "applied" });
  });

  it("the same message sent again -> 200 replayed, still one row", async () => {
    harness.status.mockResolvedValue(connected());
    await post(envelope("TABLE-REPLAY"));

    const response = await post(envelope("TABLE-REPLAY"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ acknowledged: true, replayed: true });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("a timeout right after a good answer still saves the message (remembered account) -> 201", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await post(envelope("TABLE-CACHE-1"));

    harness.status.mockRejectedValueOnce(timeout());
    const response = await post(envelope("TABLE-CACHE-2"));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ acknowledged: true, status: "applied" });
    await expect(db.providerIngressEvent.count()).resolves.toBe(2);
  });

  it("the remembered account never lets another account's message in -> 409 WHATSAPP_ACCOUNT_MISMATCH", async () => {
    harness.status.mockResolvedValueOnce(connected());
    await post(envelope("TABLE-CACHE-3"));

    harness.status.mockRejectedValueOnce(timeout());
    const response = await post(envelope("TABLE-CACHE-4", OTHER_ACCOUNT_ID));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "WHATSAPP_ACCOUNT_MISMATCH" });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("a malformed JSON body -> 400 INVALID_REQUEST_JSON, no sidecar call, no row", async () => {
    const response = await post("{not json", true);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REQUEST_JSON" });
    expect(harness.status).not.toHaveBeenCalled();
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  it("an unauthenticated caller -> 401, no sidecar call, no row", async () => {
    harness.authenticated = false;

    const response = await post(envelope("TABLE-UNAUTH"));

    expect(response.status).toBe(401);
    expect(harness.status).not.toHaveBeenCalled();
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });
});
