import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The /api/ai/openai routes: permission and a recent PIN before anything runs, only safe fields in a reply, our own
// localized sentences (never provider text), local delete even when the revoke fails. Stand-ins: identity layer, audit
// writer, the runtime (account store and sign-in service), the models call, withErrorHandler's hooks.
const SECRETS = ["ACCESS-SECRET-1", "REFRESH-SECRET-2", "eyJhbGciOiJub25lIn0.payload.sig"];
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(), requireRecent: vi.fn(), logAudit: vi.fn(), listModels: vi.fn(),
  signIn: { startSignIn: vi.fn(), completeSignIn: vi.fn(), getSignInStatus: vi.fn() },
  store: { list: vi.fn(), setActive: vi.fn(), signOut: vi.fn(), forget: vi.fn(), getActive: vi.fn() },
  accessToken: vi.fn(),
}));
vi.mock("@/lib/ai/providers/openai-chatgpt/runtime", () => ({
  getOpenAiRuntime: () => ({ context: { shop: "default" }, store: h.store, signIn: h.signIn, accessToken: h.accessToken }),
}));
vi.mock("@/lib/ai/providers/openai-chatgpt/responses", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/providers/openai-chatgpt/responses")>()), listOpenAiModels: h.listModels,
}));
vi.mock("@/lib/ai/providers/openai-chatgpt/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/providers/openai-chatgpt/tokens")>()), revokeRefreshToken: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth, requireRecentReauthentication: h.requireRecent }));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: () => "person:actor" }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "default" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { POST as signInPost } from "@/app/api/ai/openai/sign-in/route";
import { GET as statusGet } from "@/app/api/ai/openai/sign-in/status/route";
import { GET as accountsGet } from "@/app/api/ai/openai/accounts/route";
import { DELETE as accountDelete } from "@/app/api/ai/openai/accounts/[id]/route";
import { POST as activatePost } from "@/app/api/ai/openai/accounts/[id]/activate/route";
import { GET as modelsGet } from "@/app/api/ai/openai/models/route";
import { OpenAiProviderError } from "@/lib/ai/providers/openai-chatgpt/errors";
import { SahelFlowError } from "@/types/errors";

const BASE = "http://localhost/api/ai/openai";
const ARABIC = /[\u0600-\u06FF]/;
const req = (path: string, method = "GET", locale?: string, body?: unknown) =>
  new NextRequest(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(locale ? { cookie: `sahelflow-locale=${locale}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

type Call = (locale?: string) => Promise<Response>;
const calls: Array<[string, Call]> = [
  ["sign-in", (l) => signInPost(req("/sign-in", "POST", l, {}))],
  ["status", (l) => statusGet(req("/sign-in/status?attempt=abcdefgh12", "GET", l))],
  ["accounts", (l) => accountsGet(req("/accounts", "GET", l))],
  ["activate", (l) => activatePost(req("/accounts/1/activate", "POST", l), idParams("1"))],
  ["delete", (l) => accountDelete(req("/accounts/1", "DELETE", l), idParams("1"))],
  ["models", (l) => modelsGet(req("/models", "GET", l))],
];
const touched = () => [h.signIn.startSignIn, h.signIn.getSignInStatus, h.store.list, h.store.setActive, h.store.signOut, h.store.forget, h.listModels, h.logAudit];

beforeEach(() => {
  for (const fn of [h.requireAuth, h.requireRecent, h.logAudit, h.listModels, h.accessToken, h.signIn.startSignIn, h.signIn.completeSignIn, h.signIn.getSignInStatus, ...Object.values(h.store)]) fn.mockReset();
  h.requireAuth.mockResolvedValue({ actor: { kind: "person", personId: "5".repeat(32), role: "owner" } });
  h.requireRecent.mockResolvedValue(undefined);
  h.signIn.startSignIn.mockResolvedValue({ url: "https://auth.openai.com/api/accounts/authorize?x=1", attemptId: "attempt-abc-123" });
  h.signIn.completeSignIn.mockResolvedValue({ accountId: 3, email: "seller@example.com", plan: null, workspace: null, planUsageEnabled: true });
  h.store.list.mockResolvedValue([{ id: 3, email: "seller@example.com", clientId: "oaiapp_x", planUsageEnabled: true, signedIn: true, active: true }]);
  h.store.signOut.mockResolvedValue({ revokedRemotely: false });
  h.store.forget.mockResolvedValue(undefined);
  h.store.getActive.mockResolvedValue({ id: 3 });
  h.accessToken.mockResolvedValue(SECRETS[0]);
  h.listModels.mockResolvedValue([{ slug: "gpt-x", displayName: "GPT X" }]);
});

describe("access", () => {
  it.each(calls)("%s: without the permission nothing runs", async (_name, call) => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "FORBIDDEN", 403));
    expect((await call()).status).toBe(403);
    expect(h.requireRecent).not.toHaveBeenCalled();
    for (const fn of touched()) expect(fn).not.toHaveBeenCalled();
  });
  it.each(calls)("%s: without a recent PIN nothing runs", async (_name, call) => {
    h.requireRecent.mockRejectedValue(new SahelFlowError("Recent sign-in required", "REAUTH_REQUIRED", 403));
    expect((await call()).status).toBe(403);
    for (const fn of touched()) expect(fn).not.toHaveBeenCalled();
  });
  it("asks for integrations.manage", async () => {
    await accountsGet(req("/accounts"));
    expect(h.requireAuth).toHaveBeenCalledWith("integrations.manage");
  });
});

describe("replies", () => {
  it("sign-in returns the address and the attempt id, audits the completed sign-in without tokens or email", async () => {
    const res = await signInPost(req("/sign-in", "POST", "fr", { accountId: 3 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "https://auth.openai.com/api/accounts/authorize?x=1", attemptId: "attempt-abc-123" });
    expect(h.signIn.startSignIn).toHaveBeenCalledWith({ accountId: 3 });
    await vi.waitFor(() => expect(h.logAudit).toHaveBeenCalledTimes(1));
    const entry = JSON.stringify(h.logAudit.mock.calls[0]?.[1]);
    expect(entry).toContain("ai.openai.signed_in");
    expect(entry).not.toContain("seller@example.com");
  });
  it("sign-in refuses an unknown body field", async () => {
    expect((await signInPost(req("/sign-in", "POST", "en", { accountId: 3, extra: 1 }))).status).toBe(400);
    expect(h.signIn.startSignIn).not.toHaveBeenCalled();
  });
  it("status: pending, done, and failed with our own sentence in the seller's language", async () => {
    h.signIn.getSignInStatus.mockReturnValueOnce({ state: "pending" });
    expect(await (await statusGet(req("/sign-in/status?attempt=abcdefgh12"))).json()).toEqual({ ok: true, state: "pending" });
    h.signIn.getSignInStatus.mockReturnValueOnce({ state: "done", summary: { accountId: 3, plan: null, workspace: null, planUsageEnabled: true } });
    expect((await (await statusGet(req("/sign-in/status?attempt=abcdefgh12"))).json()).state).toBe("done");
    h.signIn.getSignInStatus.mockReturnValue({ state: "failed", code: "OPENAI_CONSENT_DECLINED", reason: "declined" });
    const ar = await (await statusGet(req("/sign-in/status?attempt=abcdefgh12", "GET", "ar"))).json();
    expect(ar.error).toMatch(ARABIC);
    const en = await (await statusGet(req("/sign-in/status?attempt=abcdefgh12", "GET", "en"))).json();
    expect(en.error).toMatch(/plan/i);
    expect(en).toMatchObject({ state: "failed", code: "OPENAI_CONSENT_DECLINED", reason: "declined" });
  });
  it("status: a bad or unknown attempt id is a 400", async () => {
    expect((await statusGet(req("/sign-in/status?attempt=../x"))).status).toBe(400);
    h.signIn.getSignInStatus.mockReturnValue(null);
    expect((await statusGet(req("/sign-in/status?attempt=abcdefgh12"))).status).toBe(400);
  });
  it("accounts: safe fields only", async () => {
    const body = await (await accountsGet(req("/accounts"))).json();
    expect(body.accounts).toEqual([{ id: 3, email: "seller@example.com", planUsageEnabled: true, signedIn: true, active: true }]);
  });
  it("activate: sets the account and audits; a bad id is refused", async () => {
    expect((await activatePost(req("/accounts/3/activate", "POST"), idParams("3"))).status).toBe(200);
    expect(h.store.setActive).toHaveBeenCalledWith(3);
    expect(h.logAudit.mock.calls[0]?.[1]).toMatchObject({ action: "ai.openai.activated" });
    expect((await activatePost(req("/accounts/x/activate", "POST"), idParams("x"))).status).toBe(400);
    h.store.setActive.mockRejectedValue(new OpenAiProviderError("OPENAI_REQUEST_INVALID", "Unknown ChatGPT account"));
    expect((await activatePost(req("/accounts/9/activate", "POST", "fr"), idParams("9"))).status).toBe(400);
  });
  it("sign out deletes locally even when the revoke fails, and audits", async () => {
    const res = await accountDelete(req("/accounts/3", "DELETE"), idParams("3"));
    expect(await res.json()).toEqual({ ok: true, revokedRemotely: false });
    expect(h.store.forget).toHaveBeenCalledWith(3);
    h.store.signOut.mockRejectedValue(new Error("boom"));
    expect((await accountDelete(req("/accounts/3", "DELETE"), idParams("3"))).status).toBe(200);
    expect(h.store.forget).toHaveBeenCalledTimes(2);
    expect(h.logAudit.mock.calls[0]?.[1]).toMatchObject({ action: "ai.openai.signed_out" });
  });
  it("models: uses the active account with a refreshed token; the token never appears in the reply", async () => {
    const res = await modelsGet(req("/models"));
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true, models: [{ slug: "gpt-x", displayName: "GPT X" }] });
    expect(h.accessToken).toHaveBeenCalledWith(3);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });
  it.each(["ar", "fr", "en"] as const)("models: provider failure becomes our %s sentence, never the provider's text", async (locale) => {
    h.listModels.mockRejectedValue(new OpenAiProviderError("OPENAI_PLAN_NOT_ELIGIBLE", `RAW PROVIDER TEXT ${SECRETS[0]}`));
    const res = await modelsGet(req("/models", "GET", locale));
    const text = await res.text();
    expect(res.status).toBe(409);
    expect(text).not.toContain("RAW PROVIDER TEXT");
    expect(text).not.toContain(SECRETS[0]);
    expect(JSON.parse(text).code).toBe("OPENAI_PLAN_NOT_ELIGIBLE");
    if (locale === "ar") expect(JSON.parse(text).error).toMatch(ARABIC);
    else expect(JSON.parse(text).error).toMatch(/Groq/);
  });
  it("models: nobody signed in is a coded answer, not a crash", async () => {
    h.store.getActive.mockResolvedValue(null);
    const res = await modelsGet(req("/models", "GET", "en"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("OPENAI_SESSION_REVOKED");
  });
});
