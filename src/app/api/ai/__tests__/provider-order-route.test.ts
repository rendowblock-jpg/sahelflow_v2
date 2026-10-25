import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ requireAuth: vi.fn(), requireRecent: vi.fn(), upsert: vi.fn(), getSetting: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth, requireRecentReauthentication: h.requireRecent }));
vi.mock("@/lib/db", () => ({ db: { setting: { upsert: h.upsert } }, shopContext: { shopId: "default" } }));
vi.mock("@/lib/settings", () => ({ getSetting: h.getSetting }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { GET, PUT } from "@/app/api/ai/provider-order/route";
import { SahelFlowError } from "@/types/errors";

const put = (body: unknown) =>
  PUT(new NextRequest("http://localhost/api/ai/provider-order", { method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue({});
  h.requireRecent.mockResolvedValue(undefined);
});

describe("/api/ai/provider-order", () => {
  it("GET reads the stored order and falls back to groq-first for junk", async () => {
    h.getSetting.mockResolvedValueOnce("gemini-first").mockResolvedValueOnce("junk");
    expect(await (await GET()).json()).toEqual({ order: "gemini-first" });
    expect(await (await GET()).json()).toEqual({ order: "groq-first" });
    expect(h.requireAuth).toHaveBeenCalledWith("integrations.manage");
  });

  it.each(["groq-first", "gemini-first"])("PUT saves %s", async (order) => {
    expect(await (await put({ order })).json()).toEqual({ ok: true, order });
    expect(h.upsert).toHaveBeenCalledWith({
      where: { key: "ai_provider_order" },
      create: { key: "ai_provider_order", value: order },
      update: { value: order },
    });
  });

  it("PUT refuses a junk value and writes nothing", async () => {
    expect((await put({ order: "banana" })).status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("PUT needs integrations.manage and a recent PIN, and writes nothing without them", async () => {
    h.requireAuth.mockRejectedValueOnce(new SahelFlowError("no", "FORBIDDEN", 403));
    expect((await put({ order: "gemini-first" })).status).toBe(403);
    h.requireRecent.mockRejectedValueOnce(new SahelFlowError("pin", "REAUTH_REQUIRED", 401));
    expect((await put({ order: "gemini-first" })).status).toBe(401);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
