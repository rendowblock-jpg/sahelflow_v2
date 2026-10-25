/**
 * Token exchange, refresh, revocation and ID-token validation (signature with
 * node:crypto against OpenAI's JWKS, no library).
 * Spec: .../sign-in#4, .../profiles-and-sessions#refreshing-tokens, .../token-reference
 */
import { createPublicKey, verify as cryptoVerify, type JsonWebKey } from "node:crypto";
import { OpenAiProviderError, scrubOpenAiSecrets } from "./errors";
import { OPENAI_ISSUER, PLAN_SCOPE, RESOURCE, TOKEN_ENDPOINT } from "./oauth";

export const JWKS_URL = `${OPENAI_ISSUER}/.well-known/jwks.json`;
export const DISCOVERY_URL = `${OPENAI_ISSUER}/.well-known/openid-configuration`;
/** Refresh when the one-hour access token has five minutes left. */
export const REFRESH_WINDOW_MS = 5 * 60_000;
const CLOCK_SKEW_SECONDS = 60;
const TOKEN_TIMEOUT_MS = 20_000;

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  scopes: string[];
  earliestRefreshAt?: number;
  savedAt: number;
}

export interface TokenDeps {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const TERMINAL_REFRESH_CODES = new Set([
  "invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
  "refresh_token_invalidated", "refresh_token_reused",
]);

const asString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

async function postForm(
  deps: TokenDeps, url: string, form: Record<string, string>, mode: "exchange" | "refresh", secrets: string[],
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(deps.timeoutMs ?? TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new OpenAiProviderError(timedOut ? "OPENAI_TIMEOUT" : "OPENAI_NETWORK_ERROR", timedOut ? "Token request timed out" : "Token request could not reach OpenAI");
  }
  const text = await response.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { body = {}; }
  if (response.ok) return body;
  const upstream = asString(body.error) ?? "";
  const detail = scrubOpenAiSecrets(asString(body.error_description) ?? `Token endpoint HTTP ${response.status}`, ...secrets);
  const base = { status: response.status, upstreamCode: upstream || undefined };
  if (response.status >= 500) throw new OpenAiProviderError("OPENAI_PROVIDER_UNAVAILABLE", detail, base);
  if (mode === "refresh" && TERMINAL_REFRESH_CODES.has(upstream)) throw new OpenAiProviderError("OPENAI_SESSION_REVOKED", detail, base);
  throw new OpenAiProviderError("OPENAI_ADMISSION_FAILED", detail, base);
}

/** A JWT payload without checking it (the access token is opaque to us; used only for its exp/scope). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>; } catch { return null; }
}

/** The access-token claims the docs name. Workspace and plan are not claims there: the client id is the workspace binding. */
export function decodeAccessTokenClaims(accessToken: string) {
  const claims = decodeJwtPayload(accessToken);
  if (!claims) return null;
  return {
    subject: asString(claims.sub),
    audience: asString(claims.aud),
    clientId: asString(claims.client_id),
    scopes: (asString(claims.scope) ?? "").split(/\s+/).filter(Boolean),
    issuer: asString(claims.iss),
    expiresAt: typeof claims.exp === "number" ? claims.exp * 1000 : undefined,
  };
}

function parseEarliest(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === "string" && value) {
    const parsed = Number.isNaN(Number(value)) ? Date.parse(value) : Number(value) * (Number(value) > 1e12 ? 1 : 1000);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toTokenSet(body: Record<string, unknown>, now: number, fallbackRefresh?: string): TokenSet {
  const accessToken = asString(body.access_token);
  if (!accessToken) throw new OpenAiProviderError("OPENAI_ADMISSION_FAILED", "The token answer had no access token");
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : undefined;
  const expiresAt = expiresIn ? now + expiresIn * 1000 : decodeAccessTokenClaims(accessToken)?.expiresAt ?? now + 3_600_000;
  return {
    accessToken,
    refreshToken: asString(body.refresh_token) ?? fallbackRefresh,
    idToken: asString(body.id_token),
    expiresAt,
    scopes: (asString(body.scope) ?? "").split(/\s+/).filter(Boolean),
    earliestRefreshAt: parseEarliest(body.earliest_refresh_at),
    savedAt: now,
  };
}

export async function exchangeAuthorizationCode(
  deps: TokenDeps,
  input: { clientId: string; code: string; codeVerifier: string; redirectUri: string },
): Promise<TokenSet> {
  const body = await postForm(deps, TOKEN_ENDPOINT, {
    grant_type: "authorization_code", client_id: input.clientId, code: input.code,
    code_verifier: input.codeVerifier, redirect_uri: input.redirectUri, resource: RESOURCE,
  }, "exchange", [input.code, input.codeVerifier]);
  return toTokenSet(body, (deps.now ?? Date.now)());
}

/** One attempt, never retried here: a rotating refresh token must not be spent twice. */
export async function refreshTokenSet(deps: TokenDeps, input: { clientId: string; refreshToken: string }): Promise<TokenSet> {
  const body = await postForm(deps, TOKEN_ENDPOINT, {
    grant_type: "refresh_token", client_id: input.clientId, refresh_token: input.refreshToken, resource: RESOURCE,
  }, "refresh", [input.refreshToken]);
  return toTokenSet(body, (deps.now ?? Date.now)(), input.refreshToken);
}

export function needsRefresh(
  token: { accessExpiresAt?: number; earliestRefreshAt?: number }, now: number, windowMs: number = REFRESH_WINDOW_MS,
): boolean {
  if (token.earliestRefreshAt !== undefined && now < token.earliestRefreshAt) return false;
  if (token.accessExpiresAt === undefined) return true;
  return token.accessExpiresAt - now <= windowMs;
}

export const hasPlanUsage = (scopes: readonly string[]): boolean => scopes.includes(PLAN_SCOPE);

/**
 * Is ChatGPT plan usage allowed? The token response's granted scopes decide;
 * an access token that is a readable JWT must agree. A missing permission is a
 * flag on the saved account, not an error: the sign-in is kept.
 */
export function planUsageFromTokens(tokens: { accessToken: string; scopes: readonly string[] }): boolean {
  if (!hasPlanUsage(tokens.scopes)) return false;
  const claimed = decodeAccessTokenClaims(tokens.accessToken)?.scopes ?? [];
  return claimed.length === 0 || claimed.includes(PLAN_SCOPE);
}

/** A valid ID token alone does not allow plan usage; the granted scopes must say so. */
export function requirePlanUsage(scopes: readonly string[]): void {
  if (!hasPlanUsage(scopes)) throw new OpenAiProviderError("OPENAI_CONSENT_DECLINED", "ChatGPT plan usage was not granted");
}

export interface Jwks { keys: Array<JsonWebKey & { kid?: string; alg?: string }> }

const refuseId = (why: string) => new OpenAiProviderError("OPENAI_ADMISSION_FAILED", `ID token refused: ${why}`);

/** Signature, issuer, audience (the issued client id), expiry and nonce, as sign-in.md step 4 demands. */
export function verifyIdToken(
  idToken: string,
  options: { jwks: Jwks; clientId: string; nonce: string; now: () => number; issuer?: string; skewSeconds?: number },
): { subject: string; email?: string; claims: Record<string, unknown> } {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw refuseId("not a JWT");
  const [head = "", body = "", signature = ""] = parts;
  let header: { alg?: string; kid?: string };
  try { header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")); } catch { throw refuseId("unreadable header"); }
  if (header.alg !== "RS256" && header.alg !== "ES256") throw refuseId("unsupported algorithm");
  const candidates = options.jwks.keys.filter((k) => (header.kid ? k.kid === header.kid : options.jwks.keys.length === 1) && (!k.alg || k.alg === header.alg));
  if (candidates.length === 0) throw refuseId("unknown signing key");
  let valid = false;
  try {
    const key = createPublicKey({ key: candidates[0] as JsonWebKey, format: "jwk" });
    const data = Buffer.from(`${head}.${body}`);
    const sig = Buffer.from(signature, "base64url");
    valid = header.alg === "ES256"
      ? cryptoVerify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, sig)
      : cryptoVerify("sha256", data, key, sig);
  } catch { valid = false; }
  if (!valid) throw refuseId("bad signature");
  const claims = decodeJwtPayload(idToken);
  if (!claims) throw refuseId("unreadable claims");
  const nowSeconds = options.now() / 1000;
  const skew = options.skewSeconds ?? CLOCK_SKEW_SECONDS;
  if (claims.iss !== (options.issuer ?? OPENAI_ISSUER)) throw refuseId("wrong issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(options.clientId)) throw refuseId("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp + skew <= nowSeconds) throw refuseId("expired");
  if (typeof claims.iat === "number" && claims.iat - skew > nowSeconds) throw refuseId("issued in the future");
  if (typeof claims.nbf === "number" && claims.nbf - skew > nowSeconds) throw refuseId("not valid yet");
  if (claims.nonce !== options.nonce) throw refuseId("wrong nonce");
  const subject = asString(claims.sub);
  if (!subject) throw refuseId("no subject");
  return { subject, email: asString(claims.email), claims };
}

/** JWKS fetched from the issuer, cached; fetched again once when an unknown key id shows up. */
export function createJwksProvider(deps: TokenDeps & { ttlMs?: number } = {}) {
  let cached: { jwks: Jwks; at: number } | null = null;
  const load = async (): Promise<Jwks> => {
    const response = await (deps.fetch ?? fetch)(JWKS_URL, { signal: AbortSignal.timeout(deps.timeoutMs ?? TOKEN_TIMEOUT_MS) }).catch(() => null);
    if (!response?.ok) throw new OpenAiProviderError("OPENAI_NETWORK_ERROR", "OpenAI signing keys could not be loaded");
    const jwks = (await response.json().catch(() => null)) as Jwks | null;
    if (!jwks || !Array.isArray(jwks.keys)) throw new OpenAiProviderError("OPENAI_PROVIDER_UNAVAILABLE", "OpenAI signing keys were unreadable");
    cached = { jwks, at: (deps.now ?? Date.now)() };
    return jwks;
  };
  return {
    async get(kid?: string): Promise<Jwks> {
      const fresh = cached && (deps.now ?? Date.now)() - cached.at < (deps.ttlMs ?? 10 * 60_000);
      if (cached && fresh && (!kid || cached.jwks.keys.some((k) => k.kid === kid))) return cached.jwks;
      return load();
    },
  };
}

/** End the renewable session. true = OpenAI confirmed; false = not confirmed (the caller still clears local tokens). */
export async function revokeRefreshToken(
  deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> },
  input: { clientId: string; refreshToken: string },
): Promise<boolean> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let endpoint: string | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(500 * attempt * attempt);
    try {
      if (!endpoint) {
        const found = await f(DISCOVERY_URL, { signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
        if (!found.ok) { if (found.status >= 500) continue; return false; }
        endpoint = asString(((await found.json()) as Record<string, unknown>).revocation_endpoint);
        if (!endpoint) return false;
      }
      const res = await f(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: input.refreshToken, token_type_hint: "refresh_token", client_id: input.clientId }).toString(),
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
      if (res.status === 200) return true;
      if (res.status < 500) return false;
    } catch { /* network failure: retry with backoff while the token is still held */ }
  }
  return false;
}
