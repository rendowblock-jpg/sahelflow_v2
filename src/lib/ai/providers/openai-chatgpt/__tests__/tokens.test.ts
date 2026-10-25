/** Token exchange, refresh, ID-token validation, expiry window, revocation. fetch and the clock are mocked. */
import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  exchangeAuthorizationCode, hasPlanUsage, needsRefresh, planUsageFromTokens, refreshTokenSet, requirePlanUsage,
  revokeRefreshToken, verifyIdToken,
} from "../tokens";

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const CLIENT = "oaiapp_test";
const SCOPE = "chatgpt.tokens.use.direct email offline_access openid profile resource.invoke";
const b64u = (v: string | Buffer) => Buffer.from(v).toString("base64url");
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const jwks = { keys: [jwk] };
function jwt(claims: Record<string, unknown>, o: { kid?: string; alg?: string; key?: typeof pair.privateKey } = {}) {
  const head = b64u(JSON.stringify({ alg: o.alg ?? "RS256", kid: o.kid ?? "k1", typ: "JWT" }));
  const body = b64u(JSON.stringify(claims));
  const sig = o.alg === "none" ? "" : sign("sha256", Buffer.from(`${head}.${body}`), o.key ?? pair.privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "https://auth.openai.com", aud: CLIENT, sub: "user-1", email: "a@b.dz", nonce: "N1",
  iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600, ...extra,
});
const verify = (token: string, over: Record<string, unknown> = {}) =>
  verifyIdToken(token, { jwks, clientId: CLIENT, nonce: "N1", now: () => NOW, ...over });
const codeOf = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as { code?: string }).code; } return "no error"; };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokenBody = (idToken = jwt(claims())) => ({
  access_token: "AT", refresh_token: "RT-new", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: SCOPE,
});
const form = (init: RequestInit | undefined) => Object.fromEntries(new URLSearchParams(String(init?.body)));

describe("ID token validation", () => {
  it("accepts a good token and returns the verified identity", () => {
    expect(verify(jwt(claims()))).toMatchObject({ subject: "user-1", email: "a@b.dz" });
    expect(verify(jwt(claims({ aud: ["x", CLIENT] }))).subject).toBe("user-1");
  });
  it("rejects wrong nonce, audience, issuer, expiry, signature, alg and unknown key", () => {
    expect(codeOf(() => verify(jwt(claims({ nonce: "other" }))))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims({ aud: "oaiapp_other" }))))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims({ iss: "https://evil.example" }))))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims({ exp: NOW / 1000 - 3600 }))))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims(), { key: other.privateKey })))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims(), { alg: "none" })))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims(), { kid: "unknown" })))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => verify(jwt(claims({ sub: "" }))))).toBe("OPENAI_ADMISSION_FAILED");
  });
  it("a valid ID token alone does not allow plan usage", () => {
    expect(hasPlanUsage(["openid", "email"])).toBe(false);
    expect(codeOf(() => requirePlanUsage(["openid", "email"]))).toBe("OPENAI_CONSENT_DECLINED");
    expect(hasPlanUsage(SCOPE.split(" "))).toBe(true);
    expect(codeOf(() => requirePlanUsage(SCOPE.split(" ")))).toBe("no error");
  });
});

describe("token exchange and refresh", () => {
  it("posts the exact authorization_code form (PKCE, resource, no secret)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(tokenBody()));
    const set = await exchangeAuthorizationCode({ fetch: fetchMock, now: () => NOW },
      { clientId: CLIENT, code: "CODE", codeVerifier: "VER", redirectUri: "http://127.0.0.1:1455/auth/callback" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://auth.openai.com/api/accounts/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(form(init)).toEqual({
      grant_type: "authorization_code", client_id: CLIENT, code: "CODE", code_verifier: "VER",
      redirect_uri: "http://127.0.0.1:1455/auth/callback", resource: "https://api.openai.com/v1",
    });
    expect(set).toMatchObject({ accessToken: "AT", refreshToken: "RT-new", expiresAt: NOW + 3_600_000, savedAt: NOW });
    expect(set.scopes).toContain("chatgpt.tokens.use.direct");
  });
  it("refresh posts refresh_token + client id + resource and no scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(tokenBody()));
    await refreshTokenSet({ fetch: fetchMock, now: () => NOW }, { clientId: CLIENT, refreshToken: "RT-old" });
    expect(form(fetchMock.mock.calls[0]![1])).toEqual({
      grant_type: "refresh_token", client_id: CLIENT, refresh_token: "RT-old", resource: "https://api.openai.com/v1",
    });
  });
  it("maps token errors, never retries, and keeps secrets out of the message", async () => {
    const run = async (res: Response | Error, fn: "refresh" | "exchange" = "refresh") => {
      const f = vi.fn();
      if (res instanceof Error) f.mockRejectedValue(res); else f.mockResolvedValue(res);
      const call = fn === "refresh"
        ? refreshTokenSet({ fetch: f, now: () => NOW }, { clientId: CLIENT, refreshToken: "RT-secret-value" })
        : exchangeAuthorizationCode({ fetch: f, now: () => NOW }, { clientId: CLIENT, code: "CODE-secret", codeVerifier: "VER-secret", redirectUri: "http://127.0.0.1:1455/auth/callback" });
      const err = await call.catch((e) => e);
      expect(f).toHaveBeenCalledTimes(1);
      return err as { code: string; message: string };
    };
    for (const c of ["invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired", "refresh_token_invalidated", "refresh_token_reused"]) {
      expect((await run(json({ error: c }, 400))).code).toBe("OPENAI_SESSION_REVOKED");
    }
    expect((await run(json({ error: "invalid_client" }, 401))).code).toBe("OPENAI_ADMISSION_FAILED");
    expect((await run(json({ error: "server_error" }, 500))).code).toBe("OPENAI_PROVIDER_UNAVAILABLE");
    expect((await run(new TypeError("fetch failed"))).code).toBe("OPENAI_NETWORK_ERROR");
    const bad = await run(json({ error: "invalid_grant", error_description: "bad refresh_token=RT-secret-value and code_verifier=VER-secret" }, 400), "exchange");
    expect(bad.code).toBe("OPENAI_ADMISSION_FAILED");
    expect(bad.message).not.toMatch(/RT-secret-value|VER-secret|CODE-secret/);
  });
  it("refreshes only inside the window, and not before earliest_refresh_at", () => {
    const t = { accessExpiresAt: NOW + 3_600_000 };
    expect(needsRefresh(t, NOW)).toBe(false);
    expect(needsRefresh(t, NOW + 3_600_000 - 4 * 60_000)).toBe(true);
    expect(needsRefresh({ ...t, earliestRefreshAt: NOW + 3_500_000 }, NOW + 3_600_000 - 4 * 60_000)).toBe(false);
    expect(needsRefresh({}, NOW)).toBe(true);
  });
});

describe("sign-out revocation", () => {
  const discovery = () => json({ revocation_endpoint: "https://auth.openai.com/oauth/revoke" });
  it("posts token, hint and client id to the discovered endpoint", async () => {
    const f = vi.fn().mockResolvedValueOnce(discovery()).mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await revokeRefreshToken({ fetch: f, sleep: async () => {} }, { clientId: CLIENT, refreshToken: "RT" })).toBe(true);
    expect(f.mock.calls[0]![0]).toBe("https://auth.openai.com/.well-known/openid-configuration");
    expect(f.mock.calls[1]![0]).toBe("https://auth.openai.com/oauth/revoke");
    expect(form(f.mock.calls[1]![1])).toEqual({ token: "RT", token_type_hint: "refresh_token", client_id: CLIENT });
  });
  it("retries a network failure, then reports 'not confirmed' instead of throwing", async () => {
    const f = vi.fn().mockResolvedValueOnce(discovery()).mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(new Response("", { status: 200 }));
    expect(await revokeRefreshToken({ fetch: f, sleep: async () => {} }, { clientId: CLIENT, refreshToken: "RT" })).toBe(true);
    const g = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    expect(await revokeRefreshToken({ fetch: g, sleep: async () => {} }, { clientId: CLIENT, refreshToken: "RT" })).toBe(false);
  });
});

describe("plan usage permission (a flag, not an error)", () => {
  const access = (scope: string) => jwt({ iss: "https://auth.openai.com", aud: "https://api.openai.com/v1", client_id: CLIENT, scope, exp: NOW / 1000 + 3600 });
  const granted = SCOPE.split(" ");
  it("is on only when the granted scopes carry it", () => {
    expect(planUsageFromTokens({ accessToken: "opaque-access-token", scopes: granted })).toBe(true);
    expect(planUsageFromTokens({ accessToken: "opaque-access-token", scopes: ["openid", "email"] })).toBe(false);
    expect(planUsageFromTokens({ accessToken: "opaque-access-token", scopes: [] })).toBe(false);
  });
  it("is off when the access token's own scope claim lacks it", () => {
    expect(planUsageFromTokens({ accessToken: access(SCOPE), scopes: granted })).toBe(true);
    expect(planUsageFromTokens({ accessToken: access("openid email"), scopes: granted })).toBe(false);
  });
});
