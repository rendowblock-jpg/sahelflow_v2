/** Host id, PKCE, authorize URL and callback checks for "Sign in with ChatGPT". Pure: no network. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { getOrCreateHostId, isValidHostId, type HostIdStore } from "../host-id";
import {
  buildAuthorizeUrl, createAuthAttempt, pkceChallenge, readCallback, redirectUriForPort,
} from "../oauth";

const HOST = "urn:uuid:3f0c2a0e-6b0e-4a43-9a53-1d2f6c7a9b10";
const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const REDIRECT = "http://127.0.0.1:1455/auth/callback";
const memHost = (initial: string | null = null) => {
  let value = initial;
  const store: HostIdStore = { read: async () => value, write: async (v) => { value = v; } };
  return { store, get: () => value };
};

describe("host id", () => {
  it("makes one urn:uuid v4 once and reuses it", async () => {
    const mem = memHost();
    let calls = 0;
    const gen = () => { calls += 1; return "3f0c2a0e-6b0e-4a43-9a53-1d2f6c7a9b10"; };
    expect(await getOrCreateHostId(mem.store, gen)).toBe(HOST);
    expect(await getOrCreateHostId(mem.store, gen)).toBe(HOST);
    expect(calls).toBe(1);
    expect(mem.get()).toBe(HOST);
  });
  it("is random per installation and has an accepted format", async () => {
    const a = await getOrCreateHostId(memHost().store);
    const b = await getOrCreateHostId(memHost().store);
    expect(a).not.toBe(b);
    expect(isValidHostId(a)).toBe(true);
    expect(isValidHostId("someone@example.com")).toBe(false);
  });
  it("replaces a stored value that is not an accepted format", async () => {
    const mem = memHost("not-a-host-id");
    const id = await getOrCreateHostId(mem.store);
    expect(isValidHostId(id)).toBe(true);
    expect(mem.get()).toBe(id);
  });
});

describe("PKCE and attempts", () => {
  it("matches the RFC 7636 appendix B vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("makes a fresh state, nonce and verifier per attempt", () => {
    const a = createAuthAttempt(() => NOW);
    const b = createAuthAttempt(() => NOW);
    expect(new Set([a.state, b.state, a.nonce, b.nonce, a.codeVerifier, b.codeVerifier]).size).toBe(6);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.codeChallenge).toBe(createHash("sha256").update(a.codeVerifier).digest("base64url"));
    expect(a.expiresAt).toBe(NOW + 10 * 60_000);
  });
});

describe("authorize URL", () => {
  const attempt = { state: "S1", nonce: "N1", codeVerifier: "V1", codeChallenge: "C1", createdAt: NOW, expiresAt: NOW + 600_000 };
  const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
  it("new registration: dynamic_agent_client + agent_name_hint, no hints", () => {
    const url = buildAuthorizeUrl({ hostId: HOST, redirectUri: REDIRECT, attempt });
    expect(url.startsWith("https://auth.openai.com/api/accounts/authorize?")).toBe(true);
    expect(params(url)).toEqual({
      client_id: "dynamic_agent_client", agent_name_hint: "SahelFlow", ext_agent_host_id: HOST,
      response_type: "code", redirect_uri: REDIRECT,
      scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      resource: "https://api.openai.com/v1", state: "S1", nonce: "N1",
      code_challenge_method: "S256", code_challenge: "C1",
    });
  });
  it("returning sign-in: saved client id, hints, and NO agent_name_hint", () => {
    const url = buildAuthorizeUrl({
      clientId: "oaiapp_abc", hostId: HOST, redirectUri: "http://127.0.0.1:54321/auth/callback", attempt,
      idTokenHint: "eyJhbGciOi.payload.sig", loginHint: "user@example.com",
    });
    const p = params(url);
    expect(p.client_id).toBe("oaiapp_abc");
    expect(p.agent_name_hint).toBeUndefined();
    expect(p.id_token_hint).toBe("eyJhbGciOi.payload.sig");
    expect(p.login_hint).toBe("user@example.com");
    expect(url).toContain("login_hint=user%40example.com");
    expect(p.redirect_uri).toBe("http://127.0.0.1:54321/auth/callback");
    expect(p.prompt).toBeUndefined();
    const bare = params(buildAuthorizeUrl({ clientId: "oaiapp_abc", hostId: HOST, redirectUri: REDIRECT, attempt }));
    expect(bare.id_token_hint).toBeUndefined();
    expect(bare.login_hint).toBeUndefined();
    expect(params(buildAuthorizeUrl({ clientId: "oaiapp_abc", hostId: HOST, redirectUri: REDIRECT, attempt, reconsent: true })).prompt).toBe("consent");
  });
  it("only accepts the 127.0.0.1 /auth/callback loopback", () => {
    expect(redirectUriForPort(54321)).toBe("http://127.0.0.1:54321/auth/callback");
    for (const bad of [0, 70000, 1.5]) expect(() => redirectUriForPort(bad)).toThrow();
    for (const bad of ["http://localhost:1455/auth/callback", "http://127.0.0.1:1455/callback", "https://127.0.0.1:1455/auth/callback"]) {
      expect(() => buildAuthorizeUrl({ hostId: HOST, redirectUri: bad, attempt })).toThrow();
    }
    expect(() => buildAuthorizeUrl({ hostId: "me@example.com", redirectUri: REDIRECT, attempt })).toThrow();
  });
});

describe("callback", () => {
  const attempt = { state: "S1", nonce: "N1", codeVerifier: "V1", codeChallenge: "C1", createdAt: NOW, expiresAt: NOW + 600_000 };
  const cb = (q: string) => `${REDIRECT}?${q}`;
  const codeOf = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as { code?: string }).code; } return "no error"; };
  it("returns code + issued client id for a new registration", () => {
    expect(readCallback(cb("code=C&state=S1&client_id=oaiapp_new&scope=openid"), attempt, { now: () => NOW }))
      .toEqual({ code: "C", clientId: "oaiapp_new" });
  });
  it("rejects a bad state, an expired attempt, a missing or different client id", () => {
    expect(codeOf(() => readCallback(cb("code=C&state=X&client_id=a"), attempt, { now: () => NOW }))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => readCallback(cb("code=C&state=S1&client_id=a"), attempt, { now: () => NOW + 700_000 }))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => readCallback(cb("code=C&state=S1"), attempt, { now: () => NOW }))).toBe("OPENAI_ADMISSION_FAILED");
    expect(codeOf(() => readCallback(cb("code=C&state=S1&client_id=other"), attempt, { now: () => NOW, savedClientId: "oaiapp_saved" }))).toBe("OPENAI_ADMISSION_FAILED");
    expect(readCallback(cb("code=C&state=S1"), attempt, { now: () => NOW, savedClientId: "oaiapp_saved" }).clientId).toBe("oaiapp_saved");
  });
  it("access_denied is a declined consent only when the state is right", () => {
    expect(codeOf(() => readCallback(cb("error=access_denied&state=S1"), attempt, { now: () => NOW }))).toBe("OPENAI_CONSENT_DECLINED");
    expect(codeOf(() => readCallback(cb("error=access_denied&state=bad"), attempt, { now: () => NOW }))).toBe("OPENAI_ADMISSION_FAILED");
  });
});
