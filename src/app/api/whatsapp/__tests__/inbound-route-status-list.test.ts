// The recovery dock asks for the problem states only. Real code: the GET
// handler and its status parsing. Stand-ins: the database, the permission
// check, the error wrapper. NOT covered: a real database or session.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { providerIngressEvent: { findMany: harness.findMany } },
  shopContext: {},
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({ shop: { shopId: "shop-a" } })),
  assertTrustedAction: vi.fn(),
}));
vi.mock("@/lib/whatsapp/sidecar-rest-auth", () => ({
  authenticateWhatsAppSidecar: vi.fn(() => true),
}));
vi.mock("@/lib/whatsapp/inbound-ingress", () => ({ persistWhatsAppInbound: vi.fn() }));
vi.mock("@/lib/whatsapp/inbound-processor", () => ({ processWhatsAppInbound: vi.fn() }));
vi.mock("@/lib/whatsapp/phone-outbound", () => ({
  isWhatsAppPhoneOutboundEnvelope: () => false,
  persistWhatsAppPhoneOutbound: vi.fn(),
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

import { GET } from "@/app/api/whatsapp/inbound/route";

function get(query: string): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/whatsapp/inbound${query}`));
}

function whereOfLastCall(): Record<string, unknown> {
  const call = harness.findMany.mock.calls.at(-1);
  const arg = (call?.[0] ?? {}) as { where?: Record<string, unknown> };
  return arg.where ?? {};
}

beforeEach(() => {
  harness.findMany.mockReset().mockResolvedValue([]);
});

describe("GET /api/whatsapp/inbound status filter", () => {
  it("accepts a list of states and asks the database for exactly those", async () => {
    const response = await get("?status=retrying,quarantined,dead_letter&limit=50");
    expect(response.status).toBe(200);
    expect(whereOfLastCall()).toEqual({
      provider: "whatsapp",
      status: { in: ["retrying", "quarantined", "dead_letter"] },
    });
  });

  it("keeps a single state as a plain match", async () => {
    const response = await get("?status=retrying");
    expect(response.status).toBe(200);
    expect(whereOfLastCall()).toEqual({ provider: "whatsapp", status: "retrying" });
  });

  it("ignores spaces and repeats in the list", async () => {
    const response = await get("?status=%20retrying%20,retrying,,quarantined");
    expect(response.status).toBe(200);
    expect(whereOfLastCall().status).toEqual({ in: ["retrying", "quarantined"] });
  });

  it("refuses a list with an unknown state and reads nothing", async () => {
    const response = await get("?status=retrying,applied_maybe");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(harness.findMany).not.toHaveBeenCalled();
  });

  it("without a status it still lists everything for the shop", async () => {
    const response = await get("");
    expect(response.status).toBe(200);
    expect(whereOfLastCall()).toEqual({ provider: "whatsapp" });
  });
});
