import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/secrets/groq-key stores, reports on and removes the seller's Groq key. Same promises as the Gemini route:
// permission and a recent PIN before the body is read, a key that fails the live check is never stored, Groq's raw
// text never reaches the browser, the key is never in a reply or an audit entry. Stand-ins: identity layer, audit
// writer, database handle, the live check (it calls Groq), the secret store (a Map) and withErrorHandler's hooks.
const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  requireAuth: vi.fn(),
  requireRecent: vi.fn(),
  logAudit: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/secrets", () => ({
  setSecret: vi.fn(async (_c: unknown, name: string, value: string) => void h.store.set(name, value)),
  deleteSecret: vi.fn(async (_c: unknown, name: string) => void h.store.delete(name)),
  hasSecret: vi.fn(async (_c: unknown, name: string) => h.store.has(name)),
  getSecret: vi.fn(),
}));
vi.mock("@/lib/ai/providers/groq/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/providers/groq/provider")>()),
  verifyGroqKey: h.verify,
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth, requireRecentReauthentication: h.requireRecent }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: () => "person:actor" }));
vi.mock("@/lib/db", () => ({ db: { name: "db" }, shopContext: { shopId: "default" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { DELETE, GET, POST } from "@/app/api/secrets/groq-key/route";
import { SahelFlowError } from "@/types/errors";
import type { GroqProviderErrorCode } from "@/lib/ai/providers/groq/provider";

const SECRET_NAME = "groq_api_key";
// Built at runtime so no literal looks like a real credential to a scanner.
const KEY = ["gsk", "_", "FakeFakeFakeFakeFakeFake1234567890"].join("");
const ARABIC = /[\u0600-\u06FF]/;
const CODES: GroqProviderErrorCode[] = [
  "GROQ_KEY_INVALID", "GROQ_PERMISSION_DENIED", "GROQ_QUOTA_EXHAUSTED", "GROQ_MODEL_UNAVAILABLE",
  "GROQ_REQUEST_INVALID", "GROQ_TIMEOUT", "GROQ_NETWORK_ERROR", "GROQ_PROVIDER_UNAVAILABLE",
];

function post(body: unknown, locale?: string): NextRequest {
  return new NextRequest("http://localhost/api/secrets/groq-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(locale ? { cookie: `sahelflow-locale=${locale}` } : {}) },
    body: JSON.stringify(body),
  });
}
const del = (locale?: string) =>
  new NextRequest("http://localhost/api/secrets/groq-key", {
    method: "DELETE",
    headers: locale ? { cookie: `sahelflow-locale=${locale}` } : {},
  });

beforeEach(() => {
  h.store.clear();
  for (const fn of [h.requireAuth, h.requireRecent, h.logAudit, h.verify]) fn.mockReset();
  h.requireAuth.mockResolvedValue({ actor: { kind: "person", personId: "5".repeat(32), role: "owner" } });
  h.requireRecent.mockResolvedValue(undefined);
  h.verify.mockResolvedValue({ ok: true, model: "qwen/qwen3.8-27b" });
});

describe("access", () => {
  it.each([["GET"], ["POST"], ["DELETE"]])("%s needs integrations.manage and a recent PIN, before the body is read", async (verb) => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("no", "FORBIDDEN", 403));
    const res = verb === "GET" ? await GET() : verb === "POST" ? await POST(post({ key: "{" })) : await DELETE(del());
    expect(res.status).toBe(403);
    expect(h.requireAuth).toHaveBeenCalledWith("integrations.manage");
    expect(h.requireRecent).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it("refuses without a recent PIN proof and stores nothing", async () => {
    h.requireRecent.mockRejectedValue(new SahelFlowError("pin", "REAUTH_REQUIRED", 401));
    const res = await POST(post({ key: KEY }));
    expect(res.status).toBe(401);
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });
});

describe("GET", () => {
  it("says whether a key is saved and never returns it", async () => {
    expect(await (await GET()).json()).toEqual({ configured: false });
    h.store.set(SECRET_NAME, KEY);
    const body = await (await GET()).text();
    expect(JSON.parse(body)).toEqual({ configured: true });
    expect(body).not.toContain(KEY);
  });
});

describe("POST: key shape", () => {
  it.each([
    ["not a Groq key", "AIzaSyFakeFakeFakeFakeFakeFakeFake12345"],
    ["too short", "gsk_short"],
    ["inner space", "gsk_ FakeFakeFakeFakeFakeFake1234567890"],
    ["control character", "gsk_FakeFakeFakeFakeFake\u0007Fake1234567890"],
    ["too long", `gsk_${"A".repeat(260)}`],
    ["empty", "   "],
  ])("refuses %s with a localized code, no live check and nothing stored", async (_label, key) => {
    const res = await POST(post({ key }, "fr"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, code: "GROQ_KEY_SHAPE_INVALID" });
    expect(body.error).toContain("gsk_");
    expect(JSON.stringify(body)).not.toContain(key.trim() || "\u0000");
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it("answers in the cookie language", async () => {
    expect((await (await POST(post({ key: "nope" }, "ar"))).json()).error).toMatch(ARABIC);
    expect((await (await POST(post({ key: "nope" }, "en"))).json()).error).toContain("Copy the whole key");
  });
});

describe("POST: live check", () => {
  it("trims the key, tests that same string, stores it, then audits without the key", async () => {
    const res = await POST(post({ key: `  ${KEY}\n` }, "en"));
    expect(res.status).toBe(200);
    expect(h.verify).toHaveBeenCalledWith(KEY);
    expect(h.store.get(SECRET_NAME)).toBe(KEY);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [, entry] = h.logAudit.mock.calls[0];
    expect(entry).toMatchObject({
      action: "secret.updated", entity: "secret", entityId: "groq_api_key", actor: "person:actor",
      after: { configured: true, verified: true },
    });
    const text = await res.clone().text();
    expect(JSON.parse(text)).toEqual({ ok: true, model: "qwen/qwen3.8-27b", message: "Groq key verified and saved." });
    expect(text + JSON.stringify(h.logAudit.mock.calls)).not.toContain(KEY);
  });

  it.each(CODES)("%s: 400, stable code, product copy in three languages, nothing stored, no audit", async (code) => {
    h.verify.mockResolvedValue({ ok: false, code });
    for (const locale of ["fr", "ar", "en"] as const) {
      const res = await POST(post({ key: KEY }, locale));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({ ok: false, code });
      expect(body.error).toMatch(locale === "ar" ? ARABIC : /Groq/);
      expect(JSON.stringify(body)).not.toContain(KEY);
    }
    expect(h.store.size).toBe(0);
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it("tells the seller when a limit resets", async () => {
    h.verify.mockResolvedValue({ ok: false, code: "GROQ_QUOTA_EXHAUSTED", retryAfterSeconds: 300 });
    expect((await (await POST(post({ key: KEY }, "en"))).json()).error).toContain("about 5 min");
  });

  it("keeps a key that was already saved when the new key fails", async () => {
    h.store.set(SECRET_NAME, "gsk_OldOldOldOldOldOldOldOld1234");
    h.verify.mockResolvedValue({ ok: false, code: "GROQ_KEY_INVALID" });
    await POST(post({ key: KEY }));
    expect(h.store.get(SECRET_NAME)).toBe("gsk_OldOldOldOldOldOldOldOld1234");
  });
});

describe("POST: test false", () => {
  it("skips the live check and audits verified: false", async () => {
    const res = await POST(post({ key: KEY, test: false }, "fr"));
    expect(await res.json()).toEqual({ ok: true, message: "Clé enregistrée sans test." });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.store.get(SECRET_NAME)).toBe(KEY);
    expect(h.logAudit.mock.calls[0][1]).toMatchObject({ after: { configured: true, verified: false } });
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain(KEY);
  });
});

describe("DELETE", () => {
  it("removes the key, audits what was there before, and never echoes it", async () => {
    h.store.set(SECRET_NAME, KEY);
    const res = await DELETE(del("fr"));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, message: "Clé supprimée." });
    expect(h.store.has(SECRET_NAME)).toBe(false);
    const [, entry] = h.logAudit.mock.calls[0];
    expect(entry).toMatchObject({
      action: "secret.deleted", entityId: "groq_api_key", before: { configured: true }, metadata: { key: "groq_api_key" },
    });
    expect(text + JSON.stringify(h.logAudit.mock.calls)).not.toContain(KEY);
  });

  it("with no key saved it still answers ok and audits configured: false", async () => {
    expect((await DELETE(del())).status).toBe(200);
    expect(h.logAudit.mock.calls[0][1]).toMatchObject({ before: { configured: false } });
  });
});
