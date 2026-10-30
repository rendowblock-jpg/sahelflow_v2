import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/whatsapp/status is polled by the inbox pairing dialog, the onboarding step and the onboarding checklist. When the
// WhatsApp helper is off it used to answer 503, so the browser printed a failed request on every poll. The helper being off is
// an expected state, not a server fault: the route answers 200 with sidecarReachable:false and the consumers read that field.
// Real code under test: the route and the real SidecarUnavailableError class. Stand-ins: the error wrapper (passes the handler
// through), the permission check and the sidecar status call. NOT tested here: the real sidecar request.
const h = vi.hoisted(() => ({ status: vi.fn() }));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({ shop: { shopId: "shop-a" } })),
}));
vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>()),
  sidecar: { status: h.status },
}));

import { GET } from "@/app/api/whatsapp/status/route";
import { SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

const call = GET as unknown as (request: NextRequest) => Promise<Response>;
const request = () => new NextRequest("http://localhost/api/whatsapp/status");

beforeEach(() => {
  h.status.mockReset();
});

describe("GET /api/whatsapp/status", () => {
  it("answers 200 with sidecarReachable:false when the helper is off (no failed request in the browser)", async () => {
    h.status.mockRejectedValue(new SidecarUnavailableError("sidecar down"));
    const response = await call(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "disconnected",
      user: null,
      hasQr: false,
      sidecarReachable: false,
    });
  });

  it("passes the helper's own answer through when it is reachable", async () => {
    const body = { status: "connected", user: { id: "213550123456", name: "Amel" }, hasQr: false, sidecarReachable: true };
    h.status.mockResolvedValue(body);
    const response = await call(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });

  it("still fails loudly on an error that is not 'helper unreachable'", async () => {
    h.status.mockRejectedValue(new Error("boom"));
    await expect(call(request())).rejects.toThrow("boom");
  });
});
