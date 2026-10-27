/**
 * Sign in with ChatGPT, the working flow: start (listener + authorize URL),
 * complete (code exchange, ID-token validation, save), and a status the
 * Settings screen can poll because the browser's return arrives out of band.
 * Pending attempts live in memory only, are one-time use and expire.
 * Spec: developers.openai.com/siwc/token-sharing-open-source/sign-in (steps 2-5)
 */
import { randomBytes } from "node:crypto";
import { OpenAiProviderError, scrubOpenAiSecrets, type OpenAiProviderErrorCode } from "./errors";
import { startCallbackListener, type CallbackListener } from "./callback-listener";
import {
  ATTEMPT_TTL_MS, DEFAULT_CALLBACK_PORT, buildAuthorizeUrl, createAuthAttempt, readCallback, type AuthAttempt,
} from "./oauth";
import type { createAccountStore } from "./store";
import { createJwksProvider, exchangeAuthorizationCode, verifyIdToken, type Jwks } from "./tokens";

export interface SignInSummary {
  accountId: number;
  email?: string;
  /** From the ID token only when it names one; the docs do not promise a plan claim. */
  plan: string | null;
  workspace: string | null;
  planUsageEnabled: boolean;
}
export type SignInFailureReason = "declined" | "timeout" | "superseded" | "closed";
export type SignInStatus =
  | { state: "pending" }
  | { state: "done"; summary: SignInSummary }
  | { state: "failed"; code: OpenAiProviderErrorCode; reason?: SignInFailureReason };

export interface SignInDeps {
  store: Pick<ReturnType<typeof createAccountStore>, "save" | "get">;
  getHostId: () => Promise<string>;
  fetch?: typeof fetch;
  now?: () => number;
  startListener?: typeof startCallbackListener;
  jwks?: { get(kid?: string): Promise<Jwks> };
  /** Receives codes only, never a token, code, state or URL. */
  log?: (message: string) => void;
}

interface Entry {
  attempt: AuthAttempt;
  listener: CallbackListener;
  hostId: string;
  clientId?: string;
  accountId?: number;
  keepUntil: number;
  running?: Promise<SignInSummary>;
  outcome?: SignInStatus;
}

const asText = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Plan and workspace labels, only if the ID token carries them as plain strings. */
function labels(claims: Record<string, unknown>): { plan: string | null; workspace: string | null } {
  const nested = claims["https://api.openai.com/auth"];
  const scope = nested && typeof nested === "object" ? (nested as Record<string, unknown>) : {};
  return {
    plan: asText(claims.chatgpt_plan_type) ?? asText(scope.chatgpt_plan_type),
    workspace: asText(claims.workspace_name) ?? asText(scope.workspace_name),
  };
}

function kidOf(idToken: string): string | undefined {
  try { return asText((JSON.parse(Buffer.from(idToken.split(".")[0] ?? "", "base64url").toString("utf8")) as { kid?: unknown }).kid) ?? undefined; } catch { return undefined; }
}

function fromListenerError(error: string): { code: OpenAiProviderErrorCode; reason?: SignInFailureReason; message: string } {
  if (error === "access_denied") return { code: "OPENAI_CONSENT_DECLINED", reason: "declined", message: "ChatGPT plan usage was not authorized" };
  if (error === "timeout") return { code: "OPENAI_TIMEOUT", reason: "timeout", message: "The sign-in was not finished in time" };
  if (error === "superseded") return { code: "OPENAI_ADMISSION_FAILED", reason: "superseded", message: "A newer sign-in replaced this one" };
  if (error === "closed") return { code: "OPENAI_ADMISSION_FAILED", reason: "closed", message: "The sign-in was cancelled" };
  return { code: "OPENAI_ADMISSION_FAILED", message: "ChatGPT sign-in did not complete" };
}

export function createSignInService(deps: SignInDeps) {
  const now = deps.now ?? Date.now;
  const pending = new Map<string, Entry>();
  const jwks = deps.jwks ?? createJwksProvider({ fetch: deps.fetch, now });

  const purge = () => {
    for (const [id, entry] of pending) if (now() > entry.keepUntil) pending.delete(id);
  };

  async function startSignIn(input: { accountId?: number } = {}): Promise<{ url: string; attemptId: string }> {
    purge();
    const hostId = await deps.getHostId();
    let clientId: string | undefined;
    let idTokenHint: string | undefined;
    let loginHint: string | undefined;
    if (input.accountId !== undefined) {
      const saved = await deps.store.get(input.accountId);
      if (!saved) throw new OpenAiProviderError("OPENAI_REQUEST_INVALID", "Unknown ChatGPT account");
      clientId = saved.clientId;
      idTokenHint = saved.idToken;
      loginHint = saved.email;
    }
    const attempt = createAuthAttempt(now);
    const listener = await (deps.startListener ?? startCallbackListener)({
      ports: [DEFAULT_CALLBACK_PORT, 0], timeoutMs: ATTEMPT_TTL_MS, expectedState: attempt.state,
    });
    let url: string;
    try {
      url = buildAuthorizeUrl({ clientId, hostId, redirectUri: listener.redirectUri, attempt, idTokenHint, loginHint });
    } catch (error) {
      await listener.close();
      throw error;
    }
    const attemptId = randomBytes(16).toString("base64url");
    pending.set(attemptId, { attempt, listener, hostId, clientId, accountId: input.accountId, keepUntil: attempt.expiresAt + ATTEMPT_TTL_MS });
    return { url, attemptId };
  }

  async function run(entry: Entry): Promise<SignInSummary> {
    const { attempt, listener } = entry;
    const heard = await listener.result;
    if ("error" in heard) {
      const mapped = fromListenerError(heard.error);
      throw Object.assign(new OpenAiProviderError(mapped.code, mapped.message), { reason: mapped.reason });
    }
    const query = new URLSearchParams({ state: attempt.state, code: heard.code });
    if (heard.issuedClientId) query.set("client_id", heard.issuedClientId);
    const { code, clientId } = readCallback(`${listener.redirectUri}?${query.toString()}`, attempt, { now, savedClientId: entry.clientId });
    const tokens = await exchangeAuthorizationCode({ fetch: deps.fetch, now }, {
      clientId, code, codeVerifier: attempt.codeVerifier, redirectUri: listener.redirectUri,
    });
    if (!tokens.idToken) throw new OpenAiProviderError("OPENAI_ADMISSION_FAILED", "The sign-in answer had no ID token");
    const verified = verifyIdToken(tokens.idToken, { jwks: await jwks.get(kidOf(tokens.idToken)), clientId, nonce: attempt.nonce, now });
    const accountId = await deps.store.save(
      { clientId, subject: verified.subject, email: verified.email, hostId: entry.hostId }, tokens,
      entry.accountId !== undefined ? { expectedAccountId: entry.accountId } : {},
    );
    const saved = await deps.store.get(accountId);
    // A missing plan permission keeps the account but turns plan usage off.
    return { accountId, email: saved?.email, ...labels(verified.claims), planUsageEnabled: saved?.planUsageEnabled === true };
  }

  async function completeSignIn(attemptId: string): Promise<SignInSummary> {
    purge();
    const entry = pending.get(attemptId);
    if (!entry) throw new OpenAiProviderError("OPENAI_REQUEST_INVALID", "This sign-in attempt is unknown or expired");
    entry.running ??= run(entry).then(
      (summary) => { entry.outcome = { state: "done", summary }; return summary; },
      (error: unknown) => {
        const { attempt } = entry;
        const known = error instanceof OpenAiProviderError ? error : null;
        const code = known?.code ?? "OPENAI_PROVIDER_UNAVAILABLE";
        const reason = (error as { reason?: SignInFailureReason }).reason;
        entry.outcome = { state: "failed", code, ...(reason ? { reason } : {}) };
        deps.log?.(`openai sign-in failed: ${code}`);
        // Only a scrubbed copy leaves this module.
        const message = scrubOpenAiSecrets(known?.message ?? "ChatGPT sign-in failed", attempt.state, attempt.nonce, attempt.codeVerifier);
        throw new OpenAiProviderError(code, message, { status: known?.status, upstreamCode: known?.upstreamCode });
      },
    ).finally(() => {
      // One-time use: the secrets of the attempt are dropped, only the outcome stays for polling.
      void entry.listener.close();
      entry.attempt = { ...entry.attempt, state: "", nonce: "", codeVerifier: "", codeChallenge: "" };
    });
    return entry.running;
  }

  function getSignInStatus(attemptId: string): SignInStatus | null {
    purge();
    const entry = pending.get(attemptId);
    return entry ? entry.outcome ?? { state: "pending" } : null;
  }

  return { startSignIn, completeSignIn, getSignInStatus };
}

export type SignInService = ReturnType<typeof createSignInService>;
