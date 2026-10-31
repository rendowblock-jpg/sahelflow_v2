// W3-F3 step 2: IndexedDB version 2 (sealed + outbox), envelopes stored AS RECEIVED, purge at 24 h, decrypted copies only in memory.
import { describe, expect, it } from "vitest";
import { STALE_MS } from "../../../src/lib/connected-platform/contracts";
import { FakeDatabase } from "./fake-idb";
import { VersionedIDBFactory } from "./fake-idb-versioned";
import { LOCK_AFTER_MS } from "../src/lock/state";
import { DB_VERSION, openDb, STORES } from "../src/storage/idb";
import { createVault, getSealed, purgeOld, putSealed, type SealedRow } from "../src/storage/sealed";

const row = (receivedAt: number): SealedRow => ({ kind: "orders", envelope: { ciphertext: "AAAA", envelopeId: "e1" }, sequence: 3, receivedAt, shopId: "shop_00000001" });

describe("storage v2", () => {
  it("is version 2 and lists sealed and outbox", () => {
    expect(DB_VERSION).toBe(2); expect(STORES).toEqual(["keys", "settings", "projections", "sealed", "outbox"]);
  });
  it("an upgrade from a v1 database keeps keys, settings and projections and adds the two new stores", async () => {
    const f = new VersionedIDBFactory(); const old = new FakeDatabase("sfapp");
    for (const s of ["keys", "settings", "projections"]) old.createObjectStore(s);
    old.stores.get("keys")?.set("credentials", { deviceId: "d1" }); old.stores.get("settings")?.set("lock", { failures: 2 }); old.stores.get("projections")?.set("last", { sequence: 9 });
    f.dbs.set("sfapp", old); f.versions.set("sfapp", 1);
    const db = await openDb(f as unknown as IDBFactory);
    expect(await db.get("keys", "credentials")).toEqual({ deviceId: "d1" });
    expect(await db.get("settings", "lock")).toEqual({ failures: 2 });
    expect(await db.get("projections", "last")).toEqual({ sequence: 9 });
    await db.put("sealed", "orders", row(1)); await db.put("outbox", "c1", { commandId: "c1" });
    expect(await db.keys("sealed")).toEqual(["orders"]); expect(f.versions.get("sfapp")).toBe(2);
  });
  it("sealed keeps the envelope exactly as received", async () => {
    const db = await openDb(new VersionedIDBFactory() as unknown as IDBFactory); const r = row(5);
    await putSealed(db, r);
    expect(await getSealed(db, "orders")).toEqual(r); expect(await getSealed(db, "conversations")).toBeNull();
  });
  it("purge at open deletes sealed rows received, and outbox rows created, more than 24 h ago (exactly 24 h stays)", async () => {
    const db = await openDb(new VersionedIDBFactory() as unknown as IDBFactory); const now = 10 * STALE_MS;
    await putSealed(db, { ...row(now - STALE_MS - 1), kind: "orders" }); await putSealed(db, { ...row(now - STALE_MS), kind: "conversations" });
    await db.put("outbox", "old", { commandId: "old", createdAt: now - STALE_MS - 1 }); await db.put("outbox", "edge", { commandId: "edge", createdAt: now - STALE_MS });
    expect(await purgeOld(db, now)).toEqual({ sealed: 1, outbox: 1 });
    expect(await db.keys("sealed")).toEqual(["conversations"]); expect(await db.keys("outbox")).toEqual(["edge"]);
  });
});

describe("decrypted copy lives in memory only", () => {
  it("is dropped on lock, and after the app was hidden for 5 minutes or more", () => {
    const v = createVault(); v.put("orders", { rows: 1 });
    expect(v.get("orders")).toEqual({ rows: 1 });
    v.hide(1000); v.show(1000 + LOCK_AFTER_MS - 1); expect(v.get("orders")).toEqual({ rows: 1 });
    v.hide(2000); v.show(2000 + LOCK_AFTER_MS); expect(v.get("orders")).toBeNull();
    v.put("orders", { rows: 2 }); v.lock(); expect(v.get("orders")).toBeNull();
    v.put("orders", { rows: 3 }); v.hide(5000); v.show(4000); expect(v.get("orders")).toBeNull();
  });
});
