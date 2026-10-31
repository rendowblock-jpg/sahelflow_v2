import { describe, expect, it, vi } from "vitest";
import { loadDeviceKeys, openDb, saveDeviceKeys, STORES } from "../src/storage/idb";
import { wipeAll } from "../src/storage/wipe";
import { FakeCaches, FakeIDBFactory } from "./fake-idb";

const factory = () => new FakeIDBFactory();
const open = (f: FakeIDBFactory) => openDb(f as unknown as IDBFactory);
async function pair(extractable: boolean): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: "Ed25519" }, extractable, ["sign", "verify"])) as CryptoKeyPair;
}

describe("storage wrapper", () => {
  it("creates the three stores and round-trips values", async () => {
    const f = factory(); const db = await open(f);
    expect([...(f.dbs.get("sfapp")?.stores.keys() ?? [])].sort()).toEqual([...STORES].sort());
    await db.put("settings", "locale", "fr");
    expect(await db.get("settings", "locale")).toBe("fr");
    expect(await db.get("settings", "nope")).toBeUndefined();
    expect(await db.keys("settings")).toEqual(["locale"]);
    await db.remove("settings", "locale");
    expect(await db.keys("settings")).toEqual([]);
  });
  it("stores private keys as the same non-extractable CryptoKey objects and never exports them", async () => {
    const exportSpy = vi.spyOn(crypto.subtle, "exportKey");
    const signing = await pair(false); const encryption = await pair(false);
    const f = factory(); const db = await open(f);
    await saveDeviceKeys(db, { signing, encryption });
    const raw = f.dbs.get("sfapp")?.stores.get("keys")?.get("device") as { signing: CryptoKeyPair } | undefined;
    expect(raw?.signing.privateKey).toBe(signing.privateKey);
    expect(raw?.signing.privateKey.extractable).toBe(false);
    expect(exportSpy).not.toHaveBeenCalled();
    const back = await loadDeviceKeys(db);
    expect(back?.signing.privateKey).toBe(signing.privateKey);
  });
  it("refuses an extractable private key", async () => {
    const db = await open(factory());
    await expect(saveDeviceKeys(db, { signing: await pair(true), encryption: await pair(false) })).rejects.toThrow("extractable_private_key");
    await expect(saveDeviceKeys(db, { signing: await pair(false), encryption: await pair(true) })).rejects.toThrow("extractable_private_key");
    expect(await loadDeviceKeys(db)).toBeNull();
  });
});

describe("wipeAll", () => {
  it("empties every store, deletes the database, the caches and local settings", async () => {
    const f = factory(); const db = await open(f);
    await db.put("keys", "device", { a: 1 }); await db.put("settings", "locale", "ar"); await db.put("projections", "dashboard", { b: 2 });
    const caches = new FakeCaches(["sfapp-v1", "sfapp-v2", "other"]);
    const ls = new Map<string, string>([["sf.theme", "dark"], ["sf.locale", "ar"], ["unrelated", "x"]]);
    const unregister = vi.fn(async () => undefined);
    const result = await wipeAll({ db, factory: f as unknown as IDBFactory, caches, unregister, storage: { keys: () => [...ls.keys()], remove: (k: string) => { ls.delete(k); } } });
    expect(result).toEqual({ ok: true, steps: ["stores", "database", "caches", "worker", "local"] });
    expect(f.dbs.has("sfapp")).toBe(false);
    expect(caches.names).toEqual(["other"]);
    expect(unregister).toHaveBeenCalledOnce();
    expect([...ls.keys()]).toEqual(["unrelated"]);
  });
  it("keeps going and reports the failed step when one part throws", async () => {
    const f = factory(); const db = await open(f);
    const caches = { keys: async () => { throw new Error("boom"); }, delete: async () => true };
    const result = await wipeAll({ db, factory: f as unknown as IDBFactory, caches, unregister: async () => undefined, storage: { keys: () => [], remove: () => undefined } });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failed).toEqual(["caches"]);
    expect(f.dbs.has("sfapp")).toBe(false);
  });
});
