import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/secrets/gemini-key stores, reports on and removes the seller's Gemini API key (the key that pays for the AI
// features). What matters: only an authorised person with a recent PIN proof gets in (before the body is even read);
// the key is trimmed and bounded at the boundary so the key that was TESTED is the key that is STORED; a key that
// fails the live check is never stored; the provider's own `error` text is dropped (the reply holds a stable code and
// locale-native product copy; the sanitized probe diagnostics ARE passed on as they are, and what is inside them is
// not checked here); the key itself is never in any reply or audit entry; and every successful change leaves exactly
// one audit entry written by the server.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones), zod,
// SahelFlowError and the Phase 2 permission catalog and role table. Stand-ins: the identity layer (requireAuth,
// requireRecentReauthentication, trusted-actor identity), the audit writer, the database handle, the live key check
// (verifyGeminiKey: it calls Google, so it is not run here), the secret store (a Map, so the tests read back what
// was really stored and removed) and the logger/monitoring hooks withErrorHandler calls (its shop-authority and
// licence hooks only run when NODE_ENV is production, so those two mocks are inert here and the production checks
// that run before requireAuth are NOT tested). What the real setSecret does to a value (encryption, binding) is not
// exercised, so nothing here says which key strings the real store would accept.
const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  requireAuth: vi.fn(),
  requireRecent: vi.fn(),
  auditIdentity: vi.fn(),
  logAudit: vi.fn(),
  verify: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  hasSecret: vi.fn(),
  getSecret: vi.fn(),
}));

// getSecret is in this stand-in although the route never calls it: if a regression read the key back, the tests would
// then fail on what is returned, not on a missing export that withErrorHandler turns into an innocent-looking 500.
vi.mock("@/lib/secrets", () => ({
  setSecret: h.setSecret,
  deleteSecret: h.deleteSecret,
  hasSecret: h.hasSecret,
  getSecret: h.getSecret,
}));
vi.mock("@/lib/ai/extraction", () => ({ verifyGeminiKey: h.verify }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: h.requireAuth,
  requireRecentReauthentication: h.requireRecent,
}));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/secrets/gemini-key/route";
import { db, shopContext } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";
import type { GeminiModel } from "@/lib/ai/gemini/catalog";
import type { GeminiProbeDiagnostics, GeminiProviderErrorCode, verifyGeminiKey } from "@/lib/ai/gemini/provider";

const { GET, POST, DELETE } = route;

const PERMISSION = "integrations.manage";
const SECRET_NAME = "gemini_api_key";
const ACTOR = { kind: "person" as const, personId: "5".repeat(32), role: "owner" as const };
// The real trustedActorAuditIdentity returns a string such as person:<id>.
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;
// A made-up key. It must not look like a real Google key (those start with AIza) so no secret scanner trips on it.
const KEY = "TEST-GEMINI-KEY-0001-NOT-REAL";
const OLD_KEY = "TEST-GEMINI-OLD-KEY-0002-NOT-REAL";
const MODEL: GeminiModel = "gemini-3.5-flash";
const ARABIC = /[\u0600-\u06FF]/;
// A Record over the real union: a new code in GeminiProviderErrorCode (or a removed one) stops this file compiling, so
// the copy tests below cannot silently skip it.
const ALL_CODES: Record<GeminiProviderErrorCode, true> = {
  GEMINI_KEY_INVALID: true,
  GEMINI_PERMISSION_DENIED: true,
  GEMINI_QUOTA_EXHAUSTED: true,
  GEMINI_LOCATION_UNSUPPORTED: true,
  GEMINI_REGION_OR_BILLING_REQUIRED: true,
  GEMINI_MODEL_UNAVAILABLE: true,
  GEMINI_REQUEST_INVALID: true,
  GEMINI_TIMEOUT: true,
  GEMINI_NETWORK_ERROR: true,
  GEMINI_PROVIDER_UNAVAILABLE: true,
};
const CODES = Object.keys(ALL_CODES) as GeminiProviderErrorCode[];
const LOCALES = ["ar", "fr", "en"] as const;
// The exact wording of the confirmations, pinned once per language so a swapped or edited text is noticed.
const CONFIRMATIONS = {
  en: { verified: "Gemini key verified and saved.", saved: "Key saved without testing.", deleted: "Key deleted." },
  fr: { verified: "Clé Gemini vérifiée et enregistrée.", saved: "Clé enregistrée sans test.", deleted: "Clé supprimée." },
  ar: { verified: "تم التحقق من مفتاح Gemini وحفظه.", saved: "تم حفظ المفتاح دون اختبار.", deleted: "تم حذف المفتاح." },
} as const;

// The live-check stand-in answers with the REAL result type, so a drift in that type stops this file compiling. A real
// failure always carries a code, the provider's own `error` text and a diagnostics block; RAW_PROVIDER_TEXT stands for
// the text and must never reach the browser. The two tests that leave the code or the diagnostics out are DEFENSIVE:
// they model results the real function does not return.
type VerifyResult = Awaited<ReturnType<typeof verifyGeminiKey>>;
const RAW_PROVIDER_TEXT = "RAW-PROVIDER-ERROR-TEXT-0003";
const VERIFIED: VerifyResult = { ok: true, model: MODEL };
// All seven fields of the real block, so a route that copied only some of them would not pass the pass-through test.
const DIAGNOSTICS: GeminiProbeDiagnostics = {
  httpStatus: 403,
  providerStatus: "PERMISSION_DENIED",
  reason: "denied",
  transport: { name: "TypeError", code: "ECONNRESET" },
  transportClass: "reset",
  responseShape: { jsonParseFailed: false, candidatesCount: 0, finishReason: "MAX_TOKENS", blockReason: null },
  keyShape: { prefix: "TES", length: 29, hasWhitespace: false, hasNewline: false },
};
function failure(code?: GeminiProviderErrorCode, overrides: Partial<VerifyResult> = {}): VerifyResult {
  return { ok: false, ...(code ? { code } : {}), error: RAW_PROVIDER_TEXT, diagnostics: DIAGNOSTICS, ...overrides };
}

function post(body: unknown, options: { raw?: string; locale?: string; headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest("http://localhost/api/secrets/gemini-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.locale ? { cookie: `sahelflow-locale=${options.locale}` } : {}),
      ...(options.headers ?? {}),
    },
    body: options.raw ?? JSON.stringify(body),
  });
}

function save(key: unknown = KEY, extra: Record<string, unknown> = {}, locale?: string) {
  return POST(post({ key, ...extra }, { locale }));
}

function del(locale?: string): NextRequest {
  return new NextRequest("http://localhost/api/secrets/gemini-key", {
    method: "DELETE",
    headers: locale ? { cookie: `sahelflow-locale=${locale}` } : {},
  });
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function auditEntry(): Record<string, unknown> {
  return firstCall(h.logAudit)[1] as Record<string, unknown>;
}

/** Every collaborator must be handed the shop's own context: the real secret store binds the ciphertext to it. */
function expectShopContext(spy: { mock: { calls: unknown[][] } }): void {
  expect(spy.mock.calls.length).toBeGreaterThan(0);
  for (const call of spy.mock.calls) {
    const context = call[0] as { prisma?: unknown; shop?: unknown };
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
  }
}

function expectNothingWasDone(): void {
  expect(h.verify).not.toHaveBeenCalled();
  expect(h.setSecret).not.toHaveBeenCalled();
  expect(h.deleteSecret).not.toHaveBeenCalled();
  expect(h.logAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.store.clear();
  h.requireAuth.mockReset().mockResolvedValue({ actor: ACTOR, shop: { shopId: "default" } });
  h.requireRecent.mockReset().mockResolvedValue(undefined);
  h.auditIdentity.mockReset().mockReturnValue(AUDIT_ACTOR);
  h.logAudit.mockReset().mockResolvedValue(undefined);
  h.verify.mockReset().mockResolvedValue(VERIFIED);
  h.setSecret.mockReset().mockImplementation(async (_context: unknown, name: string, value: string) => {
    h.store.set(name, value);
  });
  h.deleteSecret.mockReset().mockImplementation(async (_context: unknown, name: string) => {
    h.store.delete(name);
  });
  h.hasSecret.mockReset().mockImplementation(async (_context: unknown, name: string) => h.store.has(name));
  h.getSecret.mockReset().mockImplementation(async (_context: unknown, name: string) => h.store.get(name) ?? null);
});

describe("/api/secrets/gemini-key: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET, POST and DELETE and no other HTTP verb", () => {
    for (const verb of ["GET", "POST", "DELETE"]) expect(typeof (route as Record<string, unknown>)[verb], verb).toBe("function");
    for (const verb of ["PUT", "PATCH", "HEAD", "OPTIONS"]) expect(route, verb).not.toHaveProperty(verb);
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner.
  it("demands a permission that really exists in the action catalog", () => {
    expect(PHASE2_ACTIONS as readonly string[]).toContain(PERMISSION);
  });

  // OBSERVED: the manager preset can read the integrations (integrations.read) but cannot manage them. Whether that
  // is intended is a product question; this test records what the role table says today.
  it("is open, in the preset role table, to the owner only", () => {
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      hasPhase2Permission(getPhase2PresetPermissions(role), PERMISSION),
    );
    expect(holders).toEqual(["owner"]);
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => save()],
    ["DELETE", () => DELETE(del())],
  ])("%s demands the integrations.manage permission and a recent PIN proof, once each", async (_verb, call) => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(PERMISSION);
    expect(h.requireRecent).toHaveBeenCalledTimes(1);
    expect(h.requireRecent).toHaveBeenCalledWith();
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => save()],
    ["DELETE", () => DELETE(del())],
  ])("%s touches no key, no live check and no audit log for a caller without the permission", async (_verb, call) => {
    h.store.set(SECRET_NAME, OLD_KEY);
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.requireRecent).not.toHaveBeenCalled();
    expect(h.hasSecret).not.toHaveBeenCalled();
    expectNothingWasDone();
    expect([...h.store.entries()]).toEqual([[SECRET_NAME, OLD_KEY]]);
  });

  it.each([
    ["GET", () => GET()],
    ["POST (with a body that is not JSON)", () => POST(post(null, { raw: "{not json" }))],
    ["DELETE", () => DELETE(del())],
  ])("%s refuses without a recent PIN proof and touches nothing (the POST row has a malformed body)", async (_verb, call) => {
    h.store.set(SECRET_NAME, OLD_KEY);
    h.requireRecent.mockRejectedValue(new SahelFlowError("Recent PIN verification is required", "REAUTHENTICATION_REQUIRED", 403));
    const response = await call();
    // 403, not 400: the malformed body was never looked at.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expect(h.hasSecret).not.toHaveBeenCalled();
    expectNothingWasDone();
    expect([...h.store.entries()]).toEqual([[SECRET_NAME, OLD_KEY]]);
  });
});

describe("GET: is a key configured (never the key)", () => {
  it("answers { configured: false } on an empty store and { configured: true } once a key is stored", async () => {
    const empty = await GET();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ configured: false });
    h.store.set(SECRET_NAME, OLD_KEY);
    expect(await (await GET()).json()).toEqual({ configured: true });
  });

  it("asks about the one secret named gemini_api_key, with the shop's own context", async () => {
    await GET();
    expect(h.hasSecret).toHaveBeenCalledTimes(1);
    expect(firstCall(h.hasSecret)[1]).toBe(SECRET_NAME);
    expectShopContext(h.hasSecret);
  });

  it("never puts the stored key in the reply, and never reads it back", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ configured: true });
    expect(JSON.stringify(body)).not.toContain(OLD_KEY);
    expect(h.getSecret).not.toHaveBeenCalled();
  });

  it("writes no audit entry and does not call the live check", async () => {
    await GET();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.verify).not.toHaveBeenCalled();
  });
});

describe("POST: what is accepted as a key", () => {
  it.each([
    ["the shortest key, 10 characters", "k".repeat(10), "k".repeat(10)],
    ["the longest key, 256 characters", "k".repeat(256), "k".repeat(256)],
    ["a key with a tab and spaces at the start and spaces at the end", `  \t${KEY}  `, KEY],
    ["a key with a line break at the end (trimmed away)", `${KEY}\r\n`, KEY],
  ])("accepts %s", async (_label, key, expected) => {
    const response = await save(key);
    expect(response.status).toBe(200);
    expect(h.store.get(SECRET_NAME)).toBe(expected);
  });

  // trim() removes vertical tab, form feed, no-break space and the byte-order mark as well as ordinary spaces; the
  // expected text is written out, not computed with trim() again.
  it.each([
    ["vertical tab, form feed, no-break space and a byte-order mark around it", `\u000b\u000c${KEY}\u00a0\ufeff`, KEY],
    ["256 characters between spaces (trim comes before the length limit)", `  ${"k".repeat(256)}  `, "k".repeat(256)],
  ])("accepts %s and stores the trimmed key", async (_label, key, expected) => {
    const response = await save(key);
    expect(response.status).toBe(200);
    expect(h.verify).toHaveBeenCalledWith(expected);
    expect(h.store.get(SECRET_NAME)).toBe(expected);
  });

  it("tests and stores the SAME trimmed text, so the key that passed the check is the key that is stored", async () => {
    await save(`   ${KEY}   `);
    expect(h.verify).toHaveBeenCalledTimes(1);
    expect(h.verify).toHaveBeenCalledWith(KEY);
    expect(firstCall(h.setSecret)[2]).toBe(KEY);
    expect(h.store.get(SECRET_NAME)).toBe(KEY);
  });

  it.each([
    ["nine characters", "k".repeat(9)],
    ["nine characters between spaces (the length is counted after trimming)", `  ${"k".repeat(9)}  `],
    ["257 characters", "k".repeat(257)],
    ["an empty text", ""],
    ["only spaces", " ".repeat(30)],
    ["a line break inside", "abcde\nfghijklm"],
    ["a tab inside", "abcde\tfghijklm"],
    ["a NUL byte inside", "abcde\u0000fghijklm"],
    ["a DEL byte inside", "abcde\u007ffghijklm"],
    ["a NUL byte at the end (trim does not remove it)", `${KEY}\u0000`],
    ["a DEL byte at the start (trim does not remove it)", `\u007f${KEY}`],
    ["the last control character, U+001F, at the end (trim does not remove it)", `${KEY}\u001f`],
    ["the last control character, U+001F, at the start", `\u001f${KEY}`],
    ["the last control character, U+001F, inside", "abcde\u001ffghijk"],
    ["a number", 1234567890123],
    ["null", null],
    ["a list", [KEY]],
  ])("answers 400 REQUEST_VALIDATION_FAILED and does nothing for %s", async (_label, key) => {
    const response = await save(key);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasDone();
    expect(h.store.size).toBe(0);
  });

  it("does not echo a rejected key in the 400 reply", async () => {
    for (const key of [`LEAKMARK-${"k".repeat(300)}`, "LEAKMARK", "LEAKMARK-inner\u0001line"]) {
      const response = await save(key);
      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).not.toContain("LEAKMARK");
    }
    expectNothingWasDone();
  });

  it("answers 400 and does nothing when the key is missing", async () => {
    const response = await POST(post({ test: false }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasDone();
  });

  it.each([
    ["the text false", "false"],
    ["zero", 0],
    ["null", null],
  ])("answers 400 and does nothing when test is %s", async (_label, test) => {
    const response = await save(KEY, { test });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasDone();
  });

  it.each([
    ["null", "null"],
    ["a list", "[]"],
    ["a text", '"key"'],
    ["a number", "7"],
  ])("answers 400 REQUEST_VALIDATION_FAILED and does nothing when the body is %s", async (_label, raw) => {
    const response = await POST(post(null, { raw }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasDone();
  });

  it("answers 400 INVALID_REQUEST_JSON and does nothing when the body is not JSON", async () => {
    const response = await POST(post(null, { raw: "{not json" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST_JSON" });
    expectNothingWasDone();
  });

  // OBSERVED, not endorsed: the schema only refuses control characters (and trims the edges). A space inside the key,
  // letters that are not ASCII, and invisible characters that trim() does not remove (zero-width space, next-line), both
  // inside the key and at its edges where trim() would otherwise act, pass it. The live check in these rows is a stand-in
  // that says ok; the real one refuses anything that does not start with AIza or AQ. before it calls Google. With the default test: true the live check decides afterwards; with test: false NOTHING decides and the key
  // is handed to the store as it is (what the real store does with such a value is not exercised here). Update the test
  // if the schema is tightened.
  it.each([
    ["with the stand-in live check saying ok", true],
    ["without the live check (test: false)", false],
  ])("OBSERVED: lets a key with a space inside, with Arabic letters and with invisible characters through, %s", async (_label, tested) => {
    for (const key of ["abcde fghijk", "مفتاح-تجريبي-1234", "abcde\u200bfghijk", "abcde\u0085fghijk", `${KEY}\u200b`, `${KEY}\u0085`, `\u200b${KEY}`]) {
      h.verify.mockClear();
      h.setSecret.mockClear();
      const response = await save(key, tested ? {} : { test: false });
      expect(response.status).toBe(200);
      expect(firstCall(h.setSecret)[2]).toBe(key);
      if (tested) expect(h.verify).toHaveBeenCalledWith(key);
      else expect(h.verify).not.toHaveBeenCalled();
    }
  });
});

describe("POST: a key that is tested first (the default)", () => {
  it("runs the live check exactly once per request, by default and when test is true", async () => {
    await save();
    expect(h.verify).toHaveBeenCalledTimes(1);
    await save(KEY, { test: true });
    expect(h.verify).toHaveBeenCalledTimes(2);
  });

  it("stores the key under gemini_api_key with the shop's own context, after the check, and says so with the model", async () => {
    const response = await save();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, model: MODEL, message: "Clé Gemini vérifiée et enregistrée." });
    expect(h.setSecret).toHaveBeenCalledTimes(1);
    expect(firstCall(h.setSecret)[1]).toBe(SECRET_NAME);
    expect(firstCall(h.setSecret)[2]).toBe(KEY);
    expectShopContext(h.setSecret);
    expect(firstOrder(h.verify)).toBeLessThan(firstOrder(h.setSecret));
  });

  it("replaces a key that was already stored", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    await save();
    expect(h.store.get(SECRET_NAME)).toBe(KEY);
  });

  it("audits one secret.updated entry marked verified, written by the server, with no key in it", async () => {
    await save();
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expectShopContext(h.logAudit);
    expect(auditEntry()).toStrictEqual({
      action: "secret.updated",
      entity: "secret",
      entityId: SECRET_NAME,
      actor: AUDIT_ACTOR,
      after: { configured: true, verified: true },
    });
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain(KEY);
  });

  it("checks who is asking, then the PIN, then the key, then stores it, then audits, in that order", async () => {
    await save();
    const order = [h.requireAuth, h.requireRecent, h.verify, h.setSecret, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("takes the actor from the server, not from fields the caller added to the body", async () => {
    await save(KEY, { actor: "person:someone-else", entityId: "other", verified: false, configured: false });
    expect(auditEntry()).toStrictEqual({
      action: "secret.updated",
      entity: "secret",
      entityId: SECRET_NAME,
      actor: AUDIT_ACTOR,
      after: { configured: true, verified: true },
    });
  });

  it("never puts the key in the reply", async () => {
    const response = await save();
    expect(JSON.stringify(await response.json())).not.toContain(KEY);
  });
});

describe("POST: a key that fails the live check", () => {
  it.each(CODES)("answers 400 with the code %s, stores nothing and audits nothing", async (code) => {
    h.verify.mockResolvedValue(failure(code));
    const response = await save();
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, code });
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it("DEFENSIVE (the real check always gives a code): answers GEMINI_PROVIDER_UNAVAILABLE when the check gives no code", async () => {
    h.verify.mockResolvedValue(failure(undefined, { error: undefined, diagnostics: undefined }));
    const response = await save();
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, code: "GEMINI_PROVIDER_UNAVAILABLE" });
  });

  it("keeps a key that was already stored when the new key fails the check", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    h.verify.mockResolvedValue(failure("GEMINI_KEY_INVALID"));
    await save();
    expect(h.store.get(SECRET_NAME)).toBe(OLD_KEY);
  });

  it("passes the probe diagnostics on unchanged (all seven fields), and null when there are none (a case the real check does not produce)", async () => {
    h.verify.mockResolvedValue(failure("GEMINI_PERMISSION_DENIED"));
    expect((await (await save()).json()).diagnostics).toEqual(DIAGNOSTICS);
    h.verify.mockResolvedValue(failure("GEMINI_PERMISSION_DENIED", { diagnostics: undefined }));
    expect((await (await save()).json()).diagnostics).toBeNull();
  });

  it("never forwards the provider's own error text, and never the key", async () => {
    h.verify.mockResolvedValue(failure("GEMINI_KEY_INVALID", { error: `Google said: API key ${KEY} not valid` }));
    const text = JSON.stringify(await (await save()).json());
    expect(text).not.toContain("Google said");
    expect(text).not.toContain(KEY);
    h.verify.mockResolvedValue(failure("GEMINI_KEY_INVALID"));
    expect(JSON.stringify(await (await save()).json())).not.toContain(RAW_PROVIDER_TEXT);
  });

  // The copy is product text in three languages. Three codes have their exact wording pinned below; for the others
  // what is pinned is that the code has non-empty copy in every language, that Arabic is Arabic and the others are not,
  // that the three languages are three different texts, and (next tests) that no two codes share a text in a language.
  it.each(CODES)("answers %s in the language of the locale cookie", async (code) => {
    h.verify.mockResolvedValue(failure(code));
    const copy: Record<string, string> = {};
    for (const locale of LOCALES) {
      const body = await (await save(KEY, {}, locale)).json();
      expect(body.code).toBe(code);
      expect(body.error.length).toBeGreaterThan(0);
      copy[locale] = body.error;
      expect(JSON.stringify(body)).not.toContain(RAW_PROVIDER_TEXT);
    }
    expect(copy.ar).toMatch(ARABIC);
    expect(copy.fr).not.toMatch(ARABIC);
    expect(copy.en).not.toMatch(ARABIC);
    expect(new Set(Object.values(copy)).size).toBe(3);
  });

  it.each(LOCALES)("gives each of the ten codes its own text in %s", async (locale) => {
    const texts: string[] = [];
    for (const code of CODES) {
      h.verify.mockResolvedValue(failure(code));
      texts.push((await (await save(KEY, {}, locale)).json()).error);
    }
    expect(texts).toHaveLength(10);
    expect(new Set(texts).size).toBe(10);
  });

  // The two codes a seller can act on differently: a key that is invalid (paste another) and a key that is valid but
  // refused for the country (do not paste another). Showing the wrong one would send the seller the wrong way.
  it.each([
    ["GEMINI_KEY_INVALID", "en", "The Gemini key is invalid."],
    ["GEMINI_KEY_INVALID", "fr", "La clé Gemini est invalide."],
    ["GEMINI_KEY_INVALID", "ar", "مفتاح Gemini غير صالح."],
    ["GEMINI_LOCATION_UNSUPPORTED", "en", "The key is valid, but Google does not allow the Gemini API from your current country or region."],
    ["GEMINI_LOCATION_UNSUPPORTED", "fr", "La clé est valide, mais Google n'autorise pas l'API Gemini depuis votre pays ou région actuels."],
    ["GEMINI_LOCATION_UNSUPPORTED", "ar", "المفتاح صالح، لكن Google لا يسمح باستخدام واجهة Gemini من بلدك أو منطقتك الحالية."],
  ] as const)("pins the exact wording of %s in %s", async (code, locale, expected) => {
    h.verify.mockResolvedValue(failure(code));
    expect((await (await save(KEY, {}, locale)).json()).error).toBe(expected);
  });

  it("pins the exact wording of GEMINI_TIMEOUT in each language", async () => {
    h.verify.mockResolvedValue(failure("GEMINI_TIMEOUT"));
    const expected = {
      en: "Gemini did not respond within the expected timeout.",
      fr: "Gemini n'a pas répondu dans le délai attendu.",
      ar: "لم يستجب Gemini ضمن المهلة المتوقعة.",
    } as const;
    for (const locale of LOCALES) {
      expect((await (await save(KEY, {}, locale)).json()).error).toBe(expected[locale]);
    }
  });

  // OBSERVED, not endorsed: this route reads only the cookie. The dashboard's own resolver (src/lib/i18n-server.ts, per its
  // header) can detect the language from Accept-Language on a first visit, so a seller whose browser is Arabic or English
  // and who has not chosen a language yet may see the page in one language and these replies in French. Whether that is
  // intended is a product question. Update the test if the route is changed on purpose.
  it("OBSERVED: answers in French when there is no locale cookie (Accept-Language is not looked at) or the cookie holds an unknown value", async () => {
    h.verify.mockResolvedValue(failure("GEMINI_TIMEOUT"));
    const french = "Gemini n'a pas répondu dans le délai attendu.";
    expect((await (await save(KEY, {}, "fr")).json()).error).toBe(french);
    expect((await (await save()).json()).error).toBe(french);
    expect((await (await save(KEY, {}, "de")).json()).error).toBe(french);
    expect((await (await save(KEY, {}, "EN")).json()).error).toBe(french);
    for (const language of ["en", "ar", "en-GB,en;q=0.9"]) {
      const response = await POST(post({ key: KEY }, { headers: { "accept-language": language } }));
      expect((await response.json()).error).toBe(french);
    }
  });
});

describe("POST: a key saved without testing (test: false)", () => {
  it("does not run the live check, stores the key, and audits it as NOT verified", async () => {
    const response = await save(KEY, { test: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, message: "Clé enregistrée sans test." });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(h.setSecret).toHaveBeenCalledTimes(1);
    expect(firstCall(h.setSecret)[1]).toBe(SECRET_NAME);
    expect(firstCall(h.setSecret)[2]).toBe(KEY);
    expectShopContext(h.setSecret);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expectShopContext(h.logAudit);
    expect(auditEntry()).toStrictEqual({
      action: "secret.updated",
      entity: "secret",
      entityId: SECRET_NAME,
      actor: AUDIT_ACTOR,
      after: { configured: true, verified: false },
    });
  });

  it("trims the key and keeps the order PIN, store, audit", async () => {
    await save(`  ${KEY}  `, { test: false });
    expect(h.store.get(SECRET_NAME)).toBe(KEY);
    const order = [h.requireRecent, h.setSecret, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("never puts the key in the reply or in the audit entry", async () => {
    const response = await save(KEY, { test: false });
    expect(JSON.stringify(await response.json())).not.toContain(KEY);
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain(KEY);
  });
});

describe("the language of the confirmations", () => {
  it.each(LOCALES)("confirms a tested save, an untested save and a removal in the exact wording for %s", async (locale) => {
    h.store.set(SECRET_NAME, OLD_KEY);
    expect((await (await save(KEY, {}, locale)).json()).message).toBe(CONFIRMATIONS[locale].verified);
    expect((await (await save(KEY, { test: false }, locale)).json()).message).toBe(CONFIRMATIONS[locale].saved);
    expect((await (await DELETE(del(locale))).json()).message).toBe(CONFIRMATIONS[locale].deleted);
  });
});

describe("POST: when something breaks", () => {
  it("DEFENSIVE (the real check catches everything and never throws): answers a generic 500 that holds no key, stores nothing and audits nothing, when the live check throws", async () => {
    h.verify.mockRejectedValue(new Error(`fetch failed for key ${KEY}`));
    const response = await save();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(KEY);
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["tested", {}],
    ["untested", { test: false }],
  ])("answers a generic 500 that holds no key, and writes no audit entry, when the store fails for a %s key", async (_label, extra) => {
    h.setSecret.mockRejectedValue(new Error(`database is locked while writing ${KEY}`));
    const response = await save(KEY, extra);
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(KEY);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe("DELETE: removing the key", () => {
  it("removes a stored key, audits what was there before, and answers ok", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    const response = await DELETE(del());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, message: "Clé supprimée." });
    expect(h.store.has(SECRET_NAME)).toBe(false);
    expect(h.hasSecret).toHaveBeenCalledTimes(1);
    expect(firstCall(h.hasSecret)[1]).toBe(SECRET_NAME);
    expect(h.deleteSecret).toHaveBeenCalledTimes(1);
    expect(firstCall(h.deleteSecret)[1]).toBe(SECRET_NAME);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expectShopContext(h.hasSecret);
    expectShopContext(h.deleteSecret);
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expectShopContext(h.logAudit);
    expect(auditEntry()).toStrictEqual({
      action: "secret.deleted",
      entity: "secret",
      entityId: SECRET_NAME,
      actor: AUDIT_ACTOR,
      before: { configured: true },
      metadata: { key: SECRET_NAME },
    });
  });

  it("OBSERVED: with no key stored it still answers ok, still deletes, and audits configured: false", async () => {
    const response = await DELETE(del());
    expect(response.status).toBe(200);
    expect(h.deleteSecret).toHaveBeenCalledTimes(1);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect((auditEntry().before as { configured: boolean }).configured).toBe(false);
  });

  it("looks at the key before it deletes it, and audits after", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    await DELETE(del());
    const order = [h.requireAuth, h.requireRecent, h.hasSecret, h.deleteSecret, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("never puts the removed key in the reply or in the audit entry", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    const response = await DELETE(del());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, message: CONFIRMATIONS.fr.deleted });
    expect(JSON.stringify(body)).not.toContain(OLD_KEY);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain(OLD_KEY);
    expect(h.getSecret).not.toHaveBeenCalled();
  });

  it("answers a generic 500, removes nothing and writes no audit entry when the look-up of the key fails", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    h.hasSecret.mockRejectedValue(new Error("database is locked"));
    const response = await DELETE(del());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(h.deleteSecret).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.store.get(SECRET_NAME)).toBe(OLD_KEY);
  });

  it("answers a generic 500 that holds no key, and writes no audit entry, when the removal fails", async () => {
    h.store.set(SECRET_NAME, OLD_KEY);
    h.deleteSecret.mockRejectedValue(new Error(`cannot delete ${OLD_KEY}`));
    const response = await DELETE(del());
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(OLD_KEY);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});
