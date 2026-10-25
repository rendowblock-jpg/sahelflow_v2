/** Account store round trip, identity rules, sign-out, single-flight refresh. In-memory seams only. */
import { describe, expect, it, vi } from "vitest";
import { createAccountStore, type AccountIndex, type SecretSeam } from "../store";
import { OpenAiProviderError } from "../errors";
import type { TokenSet } from "../tokens";

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const REFRESH = "rt-secret-refresh-value-0001";
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJl";
function seams() {
  const secrets = new Map<string, string>();
  let index: AccountIndex = { nextId: 1, active: null, ids: [] };
  const seam: SecretSeam = {
    get: async (n) => secrets.get(n) ?? null, set: async (n, v) => { secrets.set(n, v); }, delete: async (n) => { secrets.delete(n); },
  };
  return { secrets, seam, getIndex: () => index, index: { read: async () => structuredClone(index), write: async (v: AccountIndex) => { index = structuredClone(v); } } };
}
const tokens = (over: Partial<TokenSet> = {}): TokenSet => ({
  accessToken: "AT-1", refreshToken: REFRESH, idToken: ID_TOKEN, expiresAt: NOW + 3_600_000,
  scopes: ["openid", "chatgpt.tokens.use.direct"], savedAt: NOW, ...over,
});
const ident = (over: Record<string, unknown> = {}) => ({ clientId: "oaiapp_1", subject: "user-1", email: "a@b.dz", hostId: "urn:uuid:3f0c2a0e-6b0e-4a43-9a53-1d2f6c7a9b10", ...over });
const make = (s = seams(), now = () => NOW) => ({ s, store: createAccountStore({ secrets: s.seam, index: s.index, now }) });

describe("account store", () => {
  it("saves each account in its own encrypted secret and lists no tokens", async () => {
    const { s, store } = make();
    const a = await store.save(ident(), tokens());
    const b = await store.save(ident({ clientId: "oaiapp_2", subject: "user-2" }), tokens());
    expect([a, b]).toEqual([1, 2]);
    expect([...s.secrets.keys()]).toEqual(["openai_chatgpt_account_1", "openai_chatgpt_account_2"]);
    const listing = JSON.stringify(await store.list());
    expect(listing).toContain("a@b.dz");
    expect(listing).not.toMatch(/rt-secret|AT-1|eyJ/);
    expect(JSON.stringify(s.getIndex())).not.toMatch(/rt-secret|AT-1|eyJ/);
    expect((await store.getActive())?.id).toBe(1);
    await store.setActive(2);
    expect((await store.getActive())?.id).toBe(2);
    expect((await store.get(1))?.refreshToken).toBe(REFRESH);
  });
  it("same email under another client id stays a separate account", async () => {
    const { store } = make();
    await store.save(ident(), tokens());
    await store.save(ident({ clientId: "oaiapp_other" }), tokens());
    expect((await store.list()).length).toBe(2);
  });
  it("returning sign-in replaces tokens together; a different identity is refused", async () => {
    const { store } = make();
    const id = await store.save(ident(), tokens());
    expect(await store.save(ident(), tokens({ accessToken: "AT-2", refreshToken: "RT-2" }), { expectedAccountId: id })).toBe(id);
    expect(await store.get(id)).toMatchObject({ accessToken: "AT-2", refreshToken: "RT-2" });
    const err = await store.save(ident({ subject: "someone-else" }), tokens({ accessToken: "AT-3" }), { expectedAccountId: id }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenAiProviderError);
    expect(err.code).toBe("OPENAI_ADMISSION_FAILED");
    expect((await store.get(id))?.accessToken).toBe("AT-2");
  });
  it("sign out revokes, clears every token, keeps client id + host id", async () => {
    const { store } = make();
    const id = await store.save(ident(), tokens());
    const revoke = vi.fn().mockResolvedValue(true);
    expect(await store.signOut(id, revoke)).toEqual({ revokedRemotely: true });
    expect(revoke).toHaveBeenCalledWith({ clientId: "oaiapp_1", refreshToken: REFRESH });
    const rec = await store.get(id);
    expect(rec).toMatchObject({ clientId: "oaiapp_1", hostId: ident().hostId, email: "a@b.dz" });
    expect(rec?.refreshToken ?? rec?.accessToken ?? rec?.idToken).toBeUndefined();
    expect((await store.list())[0]!.signedIn).toBe(false);
    const id2 = await store.save(ident({ clientId: "oaiapp_9", subject: "u9" }), tokens());
    expect(await store.signOut(id2, vi.fn().mockResolvedValue(false))).toEqual({ revokedRemotely: false });
    expect((await store.get(id2))?.refreshToken).toBeUndefined();
  });
  it("forget deletes the secret and the index entry", async () => {
    const { s, store } = make();
    const id = await store.save(ident(), tokens());
    await store.forget(id);
    expect(s.secrets.size).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(await store.getActive()).toBeNull();
  });
  it("never leaks a token through a storage error", async () => {
    const s = seams();
    s.seam.get = async () => { throw new Error(`disk failed near ${REFRESH} ${ID_TOKEN}`); };
    const { store } = make(s);
    s.secrets.set("openai_chatgpt_account_1", "x");
    s.index.write({ nextId: 2, active: 1, ids: [1] });
    const err = await store.get(1).catch((e) => e);
    expect(err).toBeInstanceOf(OpenAiProviderError);
    expect(String(err.message)).not.toMatch(/rt-secret|eyJ/);
  });
});

describe("usable access token", () => {
  it("returns a fresh token without refreshing", async () => {
    const { store } = make();
    const id = await store.save(ident(), tokens());
    const refresh = vi.fn();
    expect(await store.usableAccessToken(id, refresh)).toBe("AT-1");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("refreshes once for concurrent callers and stores the replacement together", async () => {
    const { store } = make();
    const id = await store.save(ident(), tokens({ expiresAt: NOW + 60_000 }));
    const refresh = vi.fn().mockResolvedValue(tokens({ accessToken: "AT-new", refreshToken: "RT-new", expiresAt: NOW + 3_600_000 }));
    const got = await Promise.all([1, 2, 3].map(() => store.usableAccessToken(id, refresh)));
    expect(got).toEqual(["AT-new", "AT-new", "AT-new"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ clientId: "oaiapp_1", refreshToken: REFRESH });
    expect(await store.get(id)).toMatchObject({ accessToken: "AT-new", refreshToken: "RT-new" });
  });
  it("does not hammer the endpoint after a temporary failure", async () => {
    let t = NOW;
    const { store } = make(seams(), () => t);
    const id = await store.save(ident(), tokens({ expiresAt: NOW + 60_000 }));
    const refresh = vi.fn().mockRejectedValue(new OpenAiProviderError("OPENAI_NETWORK_ERROR", "down"));
    await expect(store.usableAccessToken(id, refresh)).rejects.toMatchObject({ code: "OPENAI_NETWORK_ERROR" });
    await expect(store.usableAccessToken(id, refresh)).rejects.toMatchObject({ code: "OPENAI_NETWORK_ERROR" });
    expect(refresh).toHaveBeenCalledTimes(1);
    t += 31_000;
    await expect(store.usableAccessToken(id, refresh)).rejects.toBeInstanceOf(OpenAiProviderError);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect((await store.get(id))?.refreshToken).toBe(REFRESH);
  });
  it("a revoked session clears the tokens and asks for a new sign-in", async () => {
    const { store } = make();
    const id = await store.save(ident(), tokens({ expiresAt: NOW + 60_000 }));
    const refresh = vi.fn().mockRejectedValue(new OpenAiProviderError("OPENAI_SESSION_REVOKED", "gone"));
    await expect(store.usableAccessToken(id, refresh)).rejects.toMatchObject({ code: "OPENAI_SESSION_REVOKED" });
    const rec = await store.get(id);
    expect(rec?.refreshToken).toBeUndefined();
    expect(rec?.accessToken).toBeUndefined();
    expect(rec?.clientId).toBe("oaiapp_1");
    expect(rec?.idToken).toBe(ID_TOKEN);
    expect((await store.list())[0]!.signedIn).toBe(false);
  });
});

describe("plan usage permission is a flag, not an error", () => {
  const noPlan = (over: Partial<TokenSet> = {}) => tokens({ scopes: ["openid", "email", "offline_access"], ...over });
  it("keeps the sign-in and marks plan usage disabled", async () => {
    const { store } = make();
    const id = await store.save(ident(), noPlan());
    expect(await store.get(id)).toMatchObject({ planUsageEnabled: false, refreshToken: REFRESH, clientId: "oaiapp_1" });
    expect(await store.list()).toEqual([expect.objectContaining({ id, signedIn: true, planUsageEnabled: false })]);
    const id2 = await store.save(ident({ clientId: "oaiapp_2", subject: "u2" }), tokens());
    expect((await store.get(id2))?.planUsageEnabled).toBe(true);
  });
  it("a disabled account never reaches inference or the token endpoint", async () => {
    const { store } = make();
    const id = await store.save(ident(), noPlan({ expiresAt: NOW + 60_000 }));
    const refresh = vi.fn();
    await expect(store.usableAccessToken(id, refresh)).rejects.toMatchObject({ code: "OPENAI_CONSENT_DECLINED" });
    expect(refresh).not.toHaveBeenCalled();
  });
  it("signing in again with consent turns it on; a refresh that drops it turns it off and keeps the sign-in", async () => {
    const { store } = make();
    const id = await store.save(ident(), noPlan());
    await store.save(ident(), tokens({ expiresAt: NOW + 60_000 }), { expectedAccountId: id });
    expect((await store.get(id))?.planUsageEnabled).toBe(true);
    const refresh = vi.fn().mockResolvedValue(noPlan({ accessToken: "AT-n", refreshToken: "RT-n", expiresAt: NOW + 3_600_000 }));
    await expect(store.usableAccessToken(id, refresh)).rejects.toMatchObject({ code: "OPENAI_CONSENT_DECLINED" });
    expect(await store.get(id)).toMatchObject({ planUsageEnabled: false, refreshToken: "RT-n" });
    expect((await store.list())[0]!.signedIn).toBe(true);
  });
});
