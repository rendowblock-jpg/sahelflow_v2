// @vitest-environment node
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CallbackListener, CallbackResult } from "../callback-listener";
import { OpenAiProviderError } from "../errors";
import { AUTHORIZE_ENDPOINT, DYNAMIC_CLIENT_ID, OPENAI_ISSUER, TOKEN_ENDPOINT } from "../oauth";
import { createSignInService } from "../sign-in";
import { createAccountStore, type AccountIndex } from "../store";
import { JWKS_URL } from "../tokens";

// Every network call is a stand-in: fetch, clock, listener. Tokens below are fake and signed with a throwaway key.
const HOST = "urn:uuid:11111111-2222-4333-8444-555555555555";
const CODE = "authcode-SECRET-0001";
const REFRESH = "refresh-SECRET-0002";
const ACCESS = "access-SECRET-0003";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" };
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

function idToken(claims: Record<string, unknown>): string {
  const head = b64({ alg: "ES256", kid: "k1", typ: "JWT" });
  const body = b64(claims);
  return `${head}.${body}.${sign("sha256", Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

function setup(clock = { t: 1_800_000_000_000 }) {
  const secrets = new Map<string, string>();
  let index: AccountIndex = { nextId: 1, active: null, ids: [] };
  const store = createAccountStore({
    secrets: { get: async (n) => secrets.get(n) ?? null, set: async (n, v) => void secrets.set(n, v), delete: async (n) => void secrets.delete(n) },
    index: { read: async () => index, write: async (v) => void (index = v) },
    now: () => clock.t,
  });
  const requests: Array<{ url: string; body: string }> = [];
  const logs: string[] = [];
  const reply = { token: undefined as unknown as { status: number; body: Record<string, unknown> }, claims: {} as Record<string, unknown> };
  const defaultToken = (clientId: string, nonce: string, scope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct") => ({
    status: 200,
    body: {
      access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, scope,
      id_token: idToken({ iss: OPENAI_ISSUER, aud: clientId, sub: "user-1", email: "seller@example.com", nonce, iat: clock.t / 1000, exp: clock.t / 1000 + 600, ...reply.claims }),
    },
  });
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: String(init?.body ?? "") });
    if (url === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (url === TOKEN_ENDPOINT) return new Response(JSON.stringify(reply.token.body), { status: reply.token.status });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  let listenerResult!: (r: CallbackResult) => void;
  let lastRedirect = "";
  const startListener = async (options: { expectedState: string }): Promise<CallbackListener> => {
    lastRedirect = "http://127.0.0.1:54321/auth/callback";
    const result = new Promise<CallbackResult>((resolve) => { listenerResult = resolve; });
    void options;
    return { redirectUri: lastRedirect, result, close: async () => undefined };
  };
  const service = createSignInService({ store, getHostId: async () => HOST, fetch: fetchStub, now: () => clock.t, startListener: startListener as never, log: (m) => logs.push(m) });
  const authorize = (url: string) => new URL(url).searchParams;
  return { service, store, requests, logs, reply, defaultToken, listenerResult: (r: CallbackResult) => listenerResult(r), authorize, clock, secrets };
}

/** Run one full sign-in and return the pieces. */
async function signIn(h: ReturnType<typeof setup>, input: { accountId?: number } = {}, clientId = "oaiapp_new", scope?: string) {
  const { url, attemptId } = await h.service.startSignIn(input);
  const q = h.authorize(url);
  h.reply.token = h.defaultToken(input.accountId ? clientId : clientId, q.get("nonce") ?? "", scope);
  h.listenerResult({ code: CODE, ...(input.accountId ? {} : { issuedClientId: clientId }) });
  return { q, url, attemptId, summary: await h.service.completeSignIn(attemptId) };
}

describe("sign-in flow", () => {
  it("new account: registers with dynamic_agent_client, exchanges the code, validates, saves, answers a safe summary", async () => {
    const h = setup();
    const { q, url, summary, attemptId } = await signIn(h);
    expect(url.startsWith(AUTHORIZE_ENDPOINT)).toBe(true);
    expect(q.get("client_id")).toBe(DYNAMIC_CLIENT_ID);
    expect(q.get("agent_name_hint")).toBe("SahelFlow");
    expect(q.get("ext_agent_host_id")).toBe(HOST);
    expect(q.get("redirect_uri")).toBe("http://127.0.0.1:54321/auth/callback");
    expect(q.get("id_token_hint")).toBeNull();
    const exchange = new URLSearchParams(h.requests.find((r) => r.url === TOKEN_ENDPOINT)?.body);
    expect(exchange.get("client_id")).toBe("oaiapp_new");
    expect(exchange.get("code")).toBe(CODE);
    expect(exchange.get("redirect_uri")).toBe("http://127.0.0.1:54321/auth/callback");
    expect(exchange.get("code_verifier")).toBeTruthy();
    expect(summary).toEqual({ accountId: 1, email: "seller@example.com", plan: null, workspace: null, planUsageEnabled: true });
    expect((await h.store.get(1))?.clientId).toBe("oaiapp_new");
    expect(h.service.getSignInStatus(attemptId)).toEqual({ state: "done", summary });
    const safe = JSON.stringify([summary, h.service.getSignInStatus(attemptId)]);
    for (const secret of [CODE, REFRESH, ACCESS, "eyJ"]) expect(safe).not.toContain(secret);
  });

  it("returning account: reuses its client id, sends id_token_hint and login_hint, no agent name", async () => {
    const h = setup();
    await signIn(h);
    const saved = await h.store.get(1);
    const { q, summary } = await signIn(h, { accountId: 1 }, "oaiapp_new");
    expect(q.get("client_id")).toBe("oaiapp_new");
    expect(q.get("agent_name_hint")).toBeNull();
    expect(q.get("id_token_hint")).toBe(saved?.idToken);
    expect(q.get("login_hint")).toBe("seller@example.com");
    expect(summary.accountId).toBe(1);
  });

  it("returning sign-in for a different person is refused and the account is untouched", async () => {
    const h = setup();
    await signIn(h);
    const before = h.secrets.get("openai_chatgpt_account_1");
    h.reply.claims = { sub: "someone-else" };
    await expect(signIn(h, { accountId: 1 })).rejects.toMatchObject({ code: "OPENAI_ADMISSION_FAILED" });
    expect(h.secrets.get("openai_chatgpt_account_1")).toBe(before);
  });

  it("unknown account id is refused before any browser opens", async () => {
    const h = setup();
    await expect(h.service.startSignIn({ accountId: 9 })).rejects.toMatchObject({ code: "OPENAI_REQUEST_INVALID" });
  });

  it("consent declined: no code exchange, a coded failure with the reason", async () => {
    const h = setup();
    const { attemptId } = await h.service.startSignIn();
    h.listenerResult({ error: "access_denied" });
    await expect(h.service.completeSignIn(attemptId)).rejects.toMatchObject({ code: "OPENAI_CONSENT_DECLINED" });
    expect(h.requests.some((r) => r.url === TOKEN_ENDPOINT)).toBe(false);
    expect(h.service.getSignInStatus(attemptId)).toEqual({ state: "failed", code: "OPENAI_CONSENT_DECLINED", reason: "declined" });
  });

  it("wrong nonce in the ID token is refused and nothing is saved", async () => {
    const h = setup();
    const { attemptId } = await h.service.startSignIn();
    h.reply.token = h.defaultToken("oaiapp_new", "not-the-nonce");
    h.listenerResult({ code: CODE, issuedClientId: "oaiapp_new" });
    await expect(h.service.completeSignIn(attemptId)).rejects.toMatchObject({ code: "OPENAI_ADMISSION_FAILED" });
    expect(await h.store.list()).toEqual([]);
  });

  it("plan permission missing: the account is kept with planUsageEnabled=false, not an error", async () => {
    const h = setup();
    const { summary } = await signIn(h, {}, "oaiapp_new", "openid profile email offline_access resource.invoke");
    expect(summary.planUsageEnabled).toBe(false);
    expect((await h.store.list())[0]).toMatchObject({ id: 1, planUsageEnabled: false, signedIn: true });
  });

  it("token endpoint error: coded failure, and no code, verifier or token in the error", async () => {
    const h = setup();
    const { attemptId } = await h.service.startSignIn();
    h.reply.token = { status: 400, body: { error: "invalid_grant", error_description: `bad code ${CODE} refresh_token=${REFRESH}` } };
    h.listenerResult({ code: CODE, issuedClientId: "oaiapp_new" });
    const error = await h.service.completeSignIn(attemptId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OpenAiProviderError);
    expect((error as OpenAiProviderError).code).toBe("OPENAI_ADMISSION_FAILED");
    const text = `${(error as Error).message} ${JSON.stringify(h.service.getSignInStatus(attemptId))} ${h.logs.join(" ")}`;
    for (const secret of [CODE, REFRESH, ACCESS]) expect(text).not.toContain(secret);
    expect(await h.store.list()).toEqual([]);
  });

  it("superseded attempt: failed with reason superseded, no exchange", async () => {
    const h = setup();
    const { attemptId } = await h.service.startSignIn();
    h.listenerResult({ error: "superseded" });
    await expect(h.service.completeSignIn(attemptId)).rejects.toMatchObject({ code: "OPENAI_ADMISSION_FAILED" });
    expect(h.service.getSignInStatus(attemptId)).toEqual({ state: "failed", code: "OPENAI_ADMISSION_FAILED", reason: "superseded" });
    expect(h.requests.some((r) => r.url === TOKEN_ENDPOINT)).toBe(false);
  });

  it("is pending until the browser returns, one-time use, and forgotten after its time to live", async () => {
    const h = setup();
    const { attemptId } = await h.service.startSignIn();
    expect(h.service.getSignInStatus(attemptId)).toEqual({ state: "pending" });
    h.reply.token = h.defaultToken("oaiapp_new", "x");
    h.listenerResult({ error: "timeout" });
    await expect(h.service.completeSignIn(attemptId)).rejects.toMatchObject({ code: "OPENAI_TIMEOUT" });
    // asking again does not run a second exchange; it returns the same outcome
    await expect(h.service.completeSignIn(attemptId)).rejects.toMatchObject({ code: "OPENAI_TIMEOUT" });
    expect(h.service.getSignInStatus("nope")).toBeNull();
    await expect(h.service.completeSignIn("nope")).rejects.toMatchObject({ code: "OPENAI_REQUEST_INVALID" });
    h.clock.t += 21 * 60_000;
    expect(h.service.getSignInStatus(attemptId)).toBeNull();
  });
});
