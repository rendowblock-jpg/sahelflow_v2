// W3-F3 step 1 (ALARM 1): a phone the PC removed must forget its customers at the next poll. The poll result used to be thrown away.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FakeCaches, FakeIDBFactory } from "./fake-idb";
import { t } from "../src/i18n";
import { reactToPoll } from "../src/sync/revoke";
import { openDb, STORES } from "../src/storage/idb";
import { wipeAll } from "../src/storage/wipe";
import { createRelayClient } from "../src/today/relay-source";
import { renderApp, type View } from "../src/views/view";

const CUSTOMER = "Karim Benali 0550123456";
async function pairedPhone(reply: () => Response) {
  const factory = new FakeIDBFactory(); const db = await openDb(factory as unknown as IDBFactory);
  await db.put("keys", "credentials", { deviceId: "phone_pwa_0001", workspaceId: "ws_00000001", memberId: "mem_00000001", deviceToken: "tok", shopId: "shop_00000001" });
  await db.put("keys", "desktop", { signingPublicKey: "x" }); await db.put("keys", "device", { signing: {}, encryption: {} });
  for (const s of STORES) await db.put(s, "row", { customer: CUSTOMER });
  const relay = createRelayClient({ baseUrl: "https://relay.test", getDb: async () => db, fetchImpl: (async () => reply()) as unknown as typeof fetch });
  const wipe = () => wipeAll({ db, factory: factory as unknown as IDBFactory, caches: new FakeCaches(["sfapp-v1"]), unregister: async () => undefined, storage: { keys: () => ["sf.locale"], remove: () => undefined } });
  return { factory, db, relay, wipe };
}
const view = (patch: Partial<View>): View => ({
  locale: "en", theme: "light", screen: "settings", state: "empty", now: 1_000_000, online: true, updateReady: false, canInstall: false, installed: true, ios: false,
  projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false, version: "t", confirmRemove: false, removeError: null, removed: false, ...patch,
});

describe("revoke wipe", () => {
  it.each([401, 403])("a poll answered %s wipes every store (the new ones too), the database and the caches", async (status) => {
    const p = await pairedPhone(() => new Response("{}", { status }));
    const raw = p.factory.dbs.get("sfapp"); expect(raw).toBeDefined();
    const poll = await p.relay.poll();
    expect(poll).toEqual({ kind: "revoked" });
    const reaction = await reactToPoll(poll, p.wipe);
    expect(reaction).toMatchObject({ kind: "revoked", wiped: true });
    for (const s of STORES) expect(raw?.stores.get(s)?.size, s).toBe(0);
    expect(p.factory.dbs.has("sfapp")).toBe(false);
  });
  it("a failed wipe step is reported, never hidden", async () => {
    expect(await reactToPoll({ kind: "revoked" }, async () => ({ ok: false, steps: [], failed: ["database"] }))).toMatchObject({ kind: "revoked", wiped: false, failed: ["database"] });
    expect(await reactToPoll({ kind: "revoked" }, async () => { throw new Error("boom"); })).toMatchObject({ kind: "revoked", wiped: false });
  });
  it("a 404 for a known shop is 'pcoff': nothing is wiped and the shop is never forgotten, however many times it repeats", async () => {
    const p = await pairedPhone(() => new Response("{}", { status: 404 }));
    for (let i = 0; i < 6; i += 1) expect(await p.relay.poll()).toEqual({ kind: "pcoff" });
    expect(await reactToPoll({ kind: "pcoff" }, p.wipe)).toEqual({ kind: "pcoff" });
    expect(await p.db.get("keys", "credentials")).toMatchObject({ shopId: "shop_00000001" });
    for (const s of STORES) expect(await p.db.get(s, "row"), s).toEqual({ customer: CUSTOMER });
  });
  it("429 carries Retry-After in ms; 5xx is 'server'; neither wipes", async () => {
    const limited = await pairedPhone(() => new Response("{}", { status: 429, headers: { "retry-after": "17" } }));
    expect(await limited.relay.poll()).toEqual({ kind: "rate_limited", retryAfterMs: 17_000 });
    const down = await pairedPhone(() => new Response("{}", { status: 503 }));
    expect(await down.relay.poll()).toEqual({ kind: "server" });
    expect(await reactToPoll({ kind: "server" }, down.wipe)).toEqual({ kind: "none" });
  });
  it("app.ts uses the poll result (the line that threw it away is gone)", () => {
    const src = readFileSync(new URL("../src/app/app.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/(^|\n)\s*(if \([^)]*\)\s*)?await relay\.poll\(/);
    expect(src).toContain("reactToPoll(");
  });
  it("the removed screen says so and shows no customer data; the PC-off strip says 'as of' the last copy", () => {
    const revoked = renderApp(view({ revoked: true, projection: null }));
    expect(revoked).toContain(t("en", "settings.revoked")); expect(revoked).not.toContain(CUSTOMER);
    const off = renderApp(view({ screen: "today", state: "pcoff", projection: { generatedAt: Date.UTC(2026, 9, 31, 7, 42), newOrders: 3, toConfirm: 1, inDelivery: 0, codToCollectDzd: 0, week: [] } }));
    expect(off).toContain("pcoff-strip"); expect(off).not.toContain(t("en", "state.pcoff", { time: "{{time}}" }));
  });
});
