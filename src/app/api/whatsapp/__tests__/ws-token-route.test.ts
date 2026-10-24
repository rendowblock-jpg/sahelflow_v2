import { beforeEach, describe, expect, it, vi } from "vitest";

// PB-WS-TOKEN-QUIET. GET /api/whatsapp/ws-token is asked on every page by the push hook. When the helper has not written its
// credential yet (no WhatsApp linked, helper not started) the route used to answer 503, and the browser logged a red
// "Failed to load resource" line on every page. That is a normal state, so the route now answers 200 with no token. A caller
// that is not allowed is still refused by the permission check (not reached by a 200).
//
// Real code under test: the route. Stand-ins: the error wrapper (passes the handler through), the permission checks, the
// principal lookup and the sidecar grant. NOT covered: a real signed grant or a real sidecar.
const h = vi.hoisted(() => ({
  wsGrantBundle: vi.fn(),
  requireTrustedAction: vi.fn(),
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: h.requireTrustedAction,
  assertTrustedAction: vi.fn(),
}));
vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: () => ({ subjectId: "user-1" }),
}));
vi.mock("@/lib/whatsapp/sidecar-client", () => ({
  sidecar: { wsGrantBundle: h.wsGrantBundle },
}));

import { GET } from "@/app/api/whatsapp/ws-token/route";

describe("GET /api/whatsapp/ws-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireTrustedAction.mockResolvedValue({ shop: { shopId: "shop-a" } });
  });

  it("answers 200 with no token when the helper has no credential yet", async () => {
    h.wsGrantBundle.mockReturnValue(undefined);
    const response = await (GET as unknown as () => Promise<Response>)();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: null, connected: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns the grant when the helper has a credential", async () => {
    h.wsGrantBundle.mockReturnValue({ token: "grant-1", expiresAt: 1_700_000_000_000 });
    const response = await (GET as unknown as () => Promise<Response>)();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ token: "grant-1", expiresAt: 1_700_000_000_000 });
    expect(String(body.wsUrl)).toMatch(/^ws:\/\/.+\/ws$/);
  });

  it("still refuses a caller that is not allowed", async () => {
    h.requireTrustedAction.mockRejectedValue(new Error("forbidden"));
    await expect((GET as unknown as () => Promise<Response>)()).rejects.toThrow("forbidden");
    expect(h.wsGrantBundle).not.toHaveBeenCalled();
  });
});
