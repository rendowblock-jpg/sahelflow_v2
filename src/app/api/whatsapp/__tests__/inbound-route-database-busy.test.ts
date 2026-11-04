import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { SahelFlowError } from "@/types/errors";

/**
 * F-0031. The REAL route and the REAL error wrapper; only the two stages that
 * touch the database (persist, process), the phone-sent twin and the bearer
 * check are replaced. For every kind of error those stages can throw, the table
 * pins the HTTP status, the machine code the sidecar will store as the reason
 * a message is stuck, and the retry hint. On the Founder's PC 260 of 381
 * failures were an anonymous HTTP_500: a database timeout with no code.
 */
const harness = vi.hoisted(() => ({
  authenticated: true,
  persist: vi.fn(),
  process: vi.fn(),
  persistPhone: vi.fn(),
}));

vi.mock("@/lib/whatsapp/sidecar-rest-auth", () => ({
  authenticateWhatsAppSidecar: vi.fn(() => harness.authenticated),
}));
vi.mock("@/lib/whatsapp/inbound-ingress", () => ({
  persistWhatsAppInbound: harness.persist,
}));
vi.mock("@/lib/whatsapp/inbound-processor", () => ({
  processWhatsAppInbound: harness.process,
}));
vi.mock("@/lib/whatsapp/phone-outbound", () => ({
  isWhatsAppPhoneOutboundEnvelope: (value: unknown) => {
    const message = (value as { message?: { key?: { fromMe?: unknown } } } | null)?.message;
    return message?.key?.fromMe === true;
  },
  persistWhatsAppPhoneOutbound: harness.persistPhone,
}));

import { POST } from "@/app/api/whatsapp/inbound/route";

function request(fromMe = false): NextRequest {
  return new NextRequest("http://localhost/api/whatsapp/inbound", {
    method: "POST",
    headers: {
      Authorization: "Bearer private-sidecar-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ spoolId: "a".repeat(64), message: { key: { fromMe } } }),
  });
}

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(`prisma ${code} for 213555000111`, {
    code,
    clientVersion: "test",
  });

interface ErrorRow {
  name: string;
  make: () => unknown;
  httpStatus: number;
  code: string | undefined;
  busy: boolean;
}

const TABLE: ErrorRow[] = [
  { name: "P1008 socket timeout", make: () => known("P1008"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "P2028 transaction timeout", make: () => known("P2028"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "P2034 write conflict", make: () => known("P2034"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "P1001 cannot reach database", make: () => known("P1001"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "P1002 database timed out", make: () => known("P1002"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "P1017 connection closed", make: () => known("P1017"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  {
    name: "PrismaClientInitializationError",
    make: () => new Prisma.PrismaClientInitializationError("could not start", "test"),
    httpStatus: 503,
    code: "DATABASE_BUSY",
    busy: true,
  },
  { name: "SQLITE_BUSY message", make: () => new Error("SQLITE_BUSY: 213555000111"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  { name: "database is locked message", make: () => new Error("database is locked"), httpStatus: 503, code: "DATABASE_BUSY", busy: true },
  {
    name: "pool timeout message",
    make: () => new Error("Timed out fetching a new connection from the connection pool"),
    httpStatus: 503,
    code: "DATABASE_BUSY",
    busy: true,
  },
  // Unchanged behaviour: everything else stays exactly what it was.
  { name: "P2002 unique constraint", make: () => known("P2002"), httpStatus: 500, code: undefined, busy: false },
  { name: "plain Error", make: () => new Error("boom"), httpStatus: 500, code: undefined, busy: false },
  { name: "TypeError", make: () => new TypeError("x is not a function"), httpStatus: 500, code: undefined, busy: false },
  {
    name: "SahelFlowError keeps its own status and code",
    make: () => new SahelFlowError("not yet", "WHATSAPP_ACCOUNT_UNAVAILABLE", 503),
    httpStatus: 503,
    code: "WHATSAPP_ACCOUNT_UNAVAILABLE",
    busy: false,
  },
  {
    name: "SahelFlowError whose text mentions a lock is not relabelled",
    make: () => new SahelFlowError("database is locked by the backup", "BACKUP_IN_PROGRESS", 409),
    httpStatus: 409,
    code: "BACKUP_IN_PROGRESS",
    busy: false,
  },
  {
    name: "ZodError",
    make: () => new z.ZodError([]),
    httpStatus: 400,
    code: "REQUEST_VALIDATION_FAILED",
    busy: false,
  },
];

beforeEach(() => {
  harness.authenticated = true;
  harness.persist.mockReset().mockResolvedValue({
    ingressEventId: "ingress-1",
    ingressKey: "wa-in:key",
    status: "received",
    replayed: false,
  });
  harness.process.mockReset().mockResolvedValue({
    ingressEventId: "ingress-1",
    state: "applied",
    conversationId: "conversation-1",
    messageId: "message-1",
    publish: true,
    errorCode: null,
  });
  harness.persistPhone.mockReset().mockResolvedValue({
    messageId: "PHONEWAMID0001",
    created: true,
    replayed: false,
  });
});

type Stage = "persist" | "process" | "phone";
const STAGES: Array<[string, Stage]> = [
  ["while saving the message (persist)", "persist"],
  ["while applying it (process)", "process"],
  ["while saving a phone-sent message", "phone"],
];

function failAt(stage: Stage, error: unknown): void {
  const target = { persist: harness.persist, process: harness.process, phone: harness.persistPhone }[stage];
  target.mockRejectedValue(error);
}

describe("POST /api/whatsapp/inbound, database errors (F-0031)", () => {
  describe.each(STAGES)("%s", (_label, stage) => {
    it.each(TABLE)("$name -> $httpStatus $code", async (row) => {
      failAt(stage, row.make());

      const response = await POST(request(stage === "phone"));

      expect(response.status).toBe(row.httpStatus);
      const text = await response.text();
      const json = JSON.parse(text) as { code?: string };
      expect(json.code).toBe(row.code);
      expect(response.headers.get("Retry-After")).toBe(row.busy ? "5" : null);
      if (row.busy) {
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(json).toMatchObject({ ok: false, acknowledged: false, publish: false });
      }
      // The database's own words (they can hold a customer's number) never go back.
      expect(text).not.toContain("213555000111");
      expect(text).not.toContain("prisma P");
    });
  });

  it("a busy database during persist never reaches the processor", async () => {
    harness.persist.mockRejectedValue(known("P2028"));

    await POST(request());

    expect(harness.process).not.toHaveBeenCalled();
  });

  it("a good run is untouched: 201, acknowledged, no retry hint", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(response.headers.get("Retry-After")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ acknowledged: true, status: "applied" });
  });

  it("an unauthenticated caller is still 401, before anything is read", async () => {
    harness.authenticated = false;
    harness.persist.mockRejectedValue(known("P2028"));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(harness.persist).not.toHaveBeenCalled();
  });

  it("a malformed JSON body is still 400 INVALID_REQUEST_JSON", async () => {
    const bad = new NextRequest("http://localhost/api/whatsapp/inbound", {
      method: "POST",
      headers: { Authorization: "Bearer private-sidecar-token", "Content-Type": "application/json" },
      body: "{not json",
    });

    const response = await POST(bad);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REQUEST_JSON" });
  });
});
