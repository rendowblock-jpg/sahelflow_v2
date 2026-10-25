/**
 * "Sign in with ChatGPT" OAuth pieces that need no network: per-attempt state,
 * nonce and PKCE (S256), the authorize URL, and the loopback callback check.
 * Spec: developers.openai.com/siwc/token-sharing-open-source/sign-in
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OpenAiProviderError } from "./errors";
import { isValidHostId } from "./host-id";

export const OPENAI_ISSUER = "https://auth.openai.com";
export const AUTHORIZE_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/authorize`;
export const TOKEN_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/oauth/token`;
export const RESOURCE = "https://api.openai.com/v1";
export const DYNAMIC_CLIENT_ID = "dynamic_agent_client";
export const AGENT_NAME_HINT = "SahelFlow";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const SCOPES = ["openid", "profile", "email", "offline_access", "resource.invoke", PLAN_SCOPE] as const;
export const CALLBACK_PATH = "/auth/callback";
/** The documented example port; any free port may be used on a later sign-in. */
export const DEFAULT_CALLBACK_PORT = 1455;
/** The documented web example expires a sign-in transaction after 10 minutes. */
export const ATTEMPT_TTL_MS = 10 * 60_000;

/**
 * Where the loopback listener lives. The app's own server port is chosen by the
 * OS on every start, so the callback port comes from a listener opened only
 * during sign-in (default DEFAULT_CALLBACK_PORT, else any free port) and closed
 * by release(). Implemented by the route slice.
 */
export interface CallbackOriginProvider {
  acquire(): Promise<{ port: number; release(): Promise<void> | void }>;
}

export interface AuthAttempt {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: number;
  expiresAt: number;
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createAuthAttempt(
  now: () => number = Date.now,
  random: (bytes: number) => Buffer = randomBytes,
): AuthAttempt {
  const codeVerifier = random(32).toString("base64url");
  const createdAt = now();
  return {
    state: random(24).toString("base64url"),
    nonce: random(24).toString("base64url"),
    codeVerifier,
    codeChallenge: pkceChallenge(codeVerifier),
    createdAt,
    expiresAt: createdAt + ATTEMPT_TTL_MS,
  };
}

const LOOPBACK = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/auth\/callback$/;

function validLoopback(uri: string): boolean {
  const match = LOOPBACK.exec(uri);
  if (!match) return false;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535;
}

export function redirectUriForPort(port: number): string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Callback port is invalid");
  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

export interface AuthorizeUrlInput {
  /** The issued client id of a saved account. Omit for a first registration. */
  clientId?: string;
  hostId: string;
  redirectUri: string;
  attempt: Pick<AuthAttempt, "state" | "nonce" | "codeChallenge">;
  idTokenHint?: string;
  loginHint?: string;
  /** Ask for consent again (user chose "enable ChatGPT plan usage" after declining). */
  reconsent?: boolean;
}

export function buildAuthorizeUrl(input: AuthorizeUrlInput): string {
  if (!validLoopback(input.redirectUri)) throw new TypeError("redirect_uri must be http://127.0.0.1:<port>/auth/callback");
  if (!isValidHostId(input.hostId)) throw new TypeError("ext_agent_host_id has an unaccepted format");
  const registering = !input.clientId;
  const params = new URLSearchParams();
  params.set("client_id", input.clientId ?? DYNAMIC_CLIENT_ID);
  // The name is sent on first registration only, never on a returning sign-in.
  if (registering) params.set("agent_name_hint", AGENT_NAME_HINT);
  params.set("ext_agent_host_id", input.hostId);
  if (!registering && input.idTokenHint) params.set("id_token_hint", input.idTokenHint);
  if (!registering && input.loginHint) params.set("login_hint", input.loginHint);
  params.set("response_type", "code");
  params.set("redirect_uri", input.redirectUri);
  params.set("scope", SCOPES.join(" "));
  params.set("resource", RESOURCE);
  params.set("state", input.attempt.state);
  params.set("nonce", input.attempt.nonce);
  params.set("code_challenge_method", "S256");
  params.set("code_challenge", input.attempt.codeChallenge);
  if (input.reconsent) params.set("prompt", "consent");
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/** Strip the id_token_hint before an authorize URL goes into a log or a diagnostic. */
export function redactAuthorizeUrl(url: string): string {
  return url.replace(/([?&]id_token_hint=)[^&]*/g, "$1[redacted]");
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const refuse = (message: string) => new OpenAiProviderError("OPENAI_ADMISSION_FAILED", message);

/** Validate the browser's return to the loopback callback. State first, then the OAuth error, then the client id. */
export function readCallback(
  callbackUrl: string,
  attempt: AuthAttempt,
  options: { now?: () => number; savedClientId?: string } = {},
): { code: string; clientId: string } {
  const query = new URL(callbackUrl).searchParams;
  const state = query.get("state") ?? "";
  if (!sameText(state, attempt.state)) throw refuse("The sign-in answer did not match this attempt");
  if ((options.now ?? Date.now)() > attempt.expiresAt) throw refuse("This sign-in attempt expired");
  const error = query.get("error");
  if (error === "access_denied") {
    throw new OpenAiProviderError("OPENAI_CONSENT_DECLINED", "ChatGPT plan usage was not authorized");
  }
  if (error) throw refuse(`ChatGPT sign-in returned an error (${error.slice(0, 64)})`);
  const code = query.get("code");
  if (!code) throw refuse("The sign-in answer had no code");
  const returned = query.get("client_id") ?? undefined;
  if (options.savedClientId) {
    if (returned && returned !== options.savedClientId) throw refuse("The sign-in answer named a different client");
    return { code, clientId: options.savedClientId };
  }
  if (!returned || returned === DYNAMIC_CLIENT_ID) throw refuse("Registration did not return a client id");
  return { code, clientId: returned };
}
