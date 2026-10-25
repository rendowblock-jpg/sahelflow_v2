/**
 * Saved ChatGPT accounts. One encrypted secret per account
 * (`openai_chatgpt_account_<n>`) holds the whole record, so the access token,
 * expiry, scopes and the rotating refresh token are replaced together. A small
 * non-secret index (ids, active id) lives in the settings table.
 */
import type { ServiceContext } from "@/lib/data/service-base";
import { OpenAiProviderError } from "./errors";
import { needsRefresh, planUsageFromTokens, type TokenSet } from "./tokens";

export const ACCOUNT_SECRET_PREFIX = "openai_chatgpt_account_";
export const ACCOUNT_INDEX_SETTING_KEY = "ai_openai_chatgpt_accounts";
/** After a temporary refresh failure, leave the token endpoint alone this long. */
export const REFRESH_BACKOFF_MS = 30_000;

export interface SecretSeam {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}
export interface AccountIndex { nextId: number; active: number | null; ids: number[] }
export interface IndexSeam { read(): Promise<AccountIndex>; write(value: AccountIndex): Promise<void> }

export interface AccountIdentity { clientId: string; subject: string; email?: string; hostId: string }
export interface AccountRecord extends AccountIdentity {
  version: 1;
  idToken?: string;
  refreshToken?: string;
  accessToken?: string;
  accessExpiresAt?: number;
  earliestRefreshAt?: number;
  scopes: string[];
  planUsageEnabled: boolean;
  savedAt: number;
}
export interface AccountSummary {
  id: number; email?: string; clientId: string; planUsageEnabled: boolean; signedIn: boolean; active: boolean;
}

const secretName = (id: number) => `${ACCOUNT_SECRET_PREFIX}${id}`;
// Storage failures never echo the underlying message: it could hold a token.
const unreadable = () => new OpenAiProviderError("OPENAI_PROVIDER_UNAVAILABLE", "The saved ChatGPT sign-in could not be read");

export function createAccountStore(deps: { secrets: SecretSeam; index: IndexSeam; now?: () => number }) {
  const now = deps.now ?? Date.now;
  const inflight = new Map<number, Promise<string>>();
  const backoff = new Map<number, { until: number; error: OpenAiProviderError }>();

  async function readIndex(): Promise<AccountIndex> {
    try { return await deps.index.read(); } catch { throw unreadable(); }
  }
  async function readRecord(id: number): Promise<AccountRecord | null> {
    try {
      const raw = await deps.secrets.get(secretName(id));
      return raw ? (JSON.parse(raw) as AccountRecord) : null;
    } catch { throw unreadable(); }
  }
  async function writeRecord(id: number, record: AccountRecord): Promise<void> {
    try { await deps.secrets.set(secretName(id), JSON.stringify(record)); } catch { throw unreadable(); }
  }
  const signedIn = (r: AccountRecord) => Boolean(r.refreshToken || r.accessToken);

  const store = {
    async list(): Promise<AccountSummary[]> {
      const index = await readIndex();
      const out: AccountSummary[] = [];
      for (const id of index.ids) {
        const r = await readRecord(id);
        if (r) out.push({ id, email: r.email, clientId: r.clientId, planUsageEnabled: r.planUsageEnabled, signedIn: signedIn(r), active: index.active === id });
      }
      return out;
    },
    async get(id: number): Promise<(AccountRecord & { id: number }) | null> {
      const r = await readRecord(id);
      return r ? { ...r, id } : null;
    },
    async getActive() {
      const index = await readIndex();
      return index.active === null ? null : store.get(index.active);
    },
    async setActive(id: number): Promise<void> {
      const index = await readIndex();
      if (!index.ids.includes(id)) throw new OpenAiProviderError("OPENAI_REQUEST_INVALID", "Unknown ChatGPT account");
      await deps.index.write({ ...index, active: id });
    },
    /** Save a validated sign-in. A returning account must match the identity it was registered with. */
    async save(identity: AccountIdentity, tokens: TokenSet, options: { expectedAccountId?: number } = {}): Promise<number> {
      const index = await readIndex();
      let id: number | undefined;
      if (options.expectedAccountId !== undefined) {
        const expected = await readRecord(options.expectedAccountId);
        if (!expected || expected.clientId !== identity.clientId || expected.subject !== identity.subject) {
          throw new OpenAiProviderError("OPENAI_ADMISSION_FAILED", "The sign-in belongs to a different ChatGPT account");
        }
        id = options.expectedAccountId;
      } else {
        for (const known of index.ids) {
          const r = await readRecord(known);
          if (r && r.clientId === identity.clientId && r.subject === identity.subject) { id = known; break; }
        }
      }
      const isNew = id === undefined;
      const accountId = id ?? index.nextId;
      const previous = isNew ? null : await readRecord(accountId);
      await writeRecord(accountId, {
        version: 1, ...identity,
        email: identity.email ?? previous?.email,
        idToken: tokens.idToken ?? previous?.idToken,
        refreshToken: tokens.refreshToken, accessToken: tokens.accessToken,
        accessExpiresAt: tokens.expiresAt, earliestRefreshAt: tokens.earliestRefreshAt,
        scopes: tokens.scopes, planUsageEnabled: planUsageFromTokens(tokens), savedAt: tokens.savedAt,
      });
      backoff.delete(accountId);
      if (isNew) {
        await deps.index.write({ nextId: accountId + 1, ids: [...index.ids, accountId], active: index.active ?? accountId });
      }
      return accountId;
    },
    /** Revoke (best effort), then clear every token. Client id, identity and host id stay for a later sign-in. */
    async signOut(
      id: number, revoke: (input: { clientId: string; refreshToken: string }) => Promise<boolean>,
    ): Promise<{ revokedRemotely: boolean }> {
      const record = await readRecord(id);
      if (!record) return { revokedRemotely: true };
      let revokedRemotely = true;
      if (record.refreshToken) {
        revokedRemotely = await revoke({ clientId: record.clientId, refreshToken: record.refreshToken }).catch(() => false);
      }
      const { idToken: _id, refreshToken: _rt, accessToken: _at, accessExpiresAt: _ae, earliestRefreshAt: _er, ...kept } = record;
      await writeRecord(id, { ...kept, scopes: [], planUsageEnabled: false });
      return { revokedRemotely };
    },
    async forget(id: number): Promise<void> {
      const index = await readIndex();
      try { await deps.secrets.delete(secretName(id)); } catch { throw unreadable(); }
      const ids = index.ids.filter((x) => x !== id);
      await deps.index.write({ nextId: index.nextId, ids, active: index.active === id ? ids[0] ?? null : index.active });
    },
    /**
     * The access token to use now. Refreshes only inside the expiry window, once
     * for any number of concurrent callers, and not again for 30 s after a
     * temporary failure. A revoked session clears the tokens.
     */
    async usableAccessToken(
      id: number, refresh: (input: { clientId: string; refreshToken: string }) => Promise<TokenSet>,
    ): Promise<string> {
      const record = await readRecord(id);
      if (!record || !signedIn(record)) throw new OpenAiProviderError("OPENAI_SESSION_REVOKED", "Signed out of ChatGPT");
      // Without the plan permission the sign-in stays, but no inference goes out.
      if (!record.planUsageEnabled) throw new OpenAiProviderError("OPENAI_CONSENT_DECLINED", "ChatGPT plan usage is not enabled for this account");
      if (record.accessToken && !needsRefresh(record, now())) return record.accessToken;
      const running = inflight.get(id);
      if (running) return running;
      const waiting = backoff.get(id);
      if (waiting && now() < waiting.until) throw waiting.error;
      const job = (async () => {
        if (!record.refreshToken) throw new OpenAiProviderError("OPENAI_SESSION_REVOKED", "No refresh token is saved");
        try {
          const tokens = await refresh({ clientId: record.clientId, refreshToken: record.refreshToken });
          const scopes = tokens.scopes.length ? tokens.scopes : record.scopes;
          const planUsageEnabled = planUsageFromTokens({ accessToken: tokens.accessToken, scopes });
          await writeRecord(id, {
            ...record, idToken: tokens.idToken ?? record.idToken, refreshToken: tokens.refreshToken ?? record.refreshToken,
            accessToken: tokens.accessToken, accessExpiresAt: tokens.expiresAt, earliestRefreshAt: tokens.earliestRefreshAt,
            scopes, planUsageEnabled, savedAt: tokens.savedAt,
          });
          backoff.delete(id);
          // The new tokens are kept, but a grant that lost the plan permission is not used.
          if (!planUsageEnabled) throw new OpenAiProviderError("OPENAI_CONSENT_DECLINED", "ChatGPT plan usage is no longer granted");
          return tokens.accessToken;
        } catch (error) {
          if (error instanceof OpenAiProviderError && error.code === "OPENAI_SESSION_REVOKED") {
            const { refreshToken: _rt, accessToken: _at, accessExpiresAt: _ae, earliestRefreshAt: _er, ...kept } = record;
            await writeRecord(id, { ...kept, planUsageEnabled: false });
            backoff.delete(id);
          } else if (error instanceof OpenAiProviderError && error.code !== "OPENAI_CONSENT_DECLINED") {
            backoff.set(id, { until: now() + REFRESH_BACKOFF_MS, error });
          }
          throw error;
        }
      })();
      inflight.set(id, job);
      try { return await job; } finally { inflight.delete(id); }
    },
  };
  return store;
}

/** The production seams: encrypted secrets and the settings table. Imported late so tests stay light. */
export function createSecretSeam(context: ServiceContext): SecretSeam {
  return {
    get: async (name) => (await import("@/lib/secrets")).getSecret(context, name),
    set: async (name, value) => (await import("@/lib/secrets")).setSecret(context, name, value),
    delete: async (name) => (await import("@/lib/secrets")).deleteSecret(context, name),
  };
}
export function createSettingsIndexSeam(context: ServiceContext): IndexSeam {
  const empty: AccountIndex = { nextId: 1, active: null, ids: [] };
  return {
    read: async () => (await import("@/lib/settings")).getJson<AccountIndex>(context, ACCOUNT_INDEX_SETTING_KEY, empty),
    write: async (value) => (await import("@/lib/settings")).setSetting(context, ACCOUNT_INDEX_SETTING_KEY, JSON.stringify(value)),
  };
}
