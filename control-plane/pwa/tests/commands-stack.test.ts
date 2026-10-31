// W3-F3 step C(1): the stack the app builds. Real transport and outbox on an in-memory db; nothing is sent (no fetch is called).
import { describe, expect, it } from "vitest";
import { generateDeviceKeys } from "../../../src/lib/connected-platform/web";
import { createCommandStack } from "../src/app/commands";
import { saveDeviceKeys, type Db } from "../src/storage/idb";
import { NOW, memDb } from "./orders-fixtures";

const noFetch = (async () => { throw new Error("no network in this test"); }) as unknown as typeof fetch;
const creds = (shopId: string | null) => ({ deviceId: "phone_pwa_0001", deviceToken: "tok", workspaceId: "0123456789abcdef0123456789abcdef", memberId: "mem_00000001", shopId });
async function pairedDb(shopId: string | null): Promise<Db> {
  const db = memDb(); const g = await generateDeviceKeys(); if (!g.ok) throw new Error("keygen");
  await saveDeviceKeys(db, g.keys); await db.put("keys", "credentials", creds(shopId));
  await db.put("keys", "desktop", { signingPublicKey: "AAAA", signingFingerprint: "ff", rsaPublicJwk: "{}" });
  return db;
}
const input = { kind: "command.orders.confirm" as const, target: { type: "order" as const, id: "o1", expectedVersion: 3 }, labelForUi: "#1", draftText: "" };

describe("createCommandStack", () => {
  it("an unpaired phone has no stack (null), never a half built one", async () => {
    expect(await createCommandStack({ db: memDb(), relayBase: "https://r.test", fetch: noFetch, now: () => NOW })).toBeNull();
  });
  it("the shop id is a getter: the poll learns it after the stack was built, refresh() picks it up", async () => {
    const db = await pairedDb(null); const s = await createCommandStack({ db, relayBase: "https://r.test", fetch: noFetch, now: () => NOW });
    expect(s?.shopId()).toBeNull();
    await db.put("keys", "credentials", creds("testshop0001")); await s?.refresh();
    expect(s?.shopId()).toBe("testshop0001");
  });
  it("without a verified command authority nothing is sealed: enqueue says no_authority", async () => {
    const s = await createCommandStack({ db: await pairedDb("testshop0001"), relayBase: "https://r.test", fetch: noFetch, now: () => NOW });
    expect(await s?.outbox.enqueue(input)).toEqual({ ok: false, reason: "no_authority" });
  });
  it("no sealed orders stored: openOrders is null (the host shows an error, not an empty list)", async () => {
    const s = await createCommandStack({ db: await pairedDb("testshop0001"), relayBase: "https://r.test", fetch: noFetch, now: () => NOW });
    expect(await s?.openOrders()).toBeNull();
  });
});
