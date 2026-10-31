// W3-F wave 3 phase B: the stack opens the sealed CONVERSATIONS copy like it opens orders ({data, asOf} or null). The positive case
// (a real sealed copy opens) is proven end to end in phone-chain.test.ts.
import { describe, expect, it } from "vitest";
import { generateDeviceKeys } from "../../../src/lib/connected-platform/web";
import { createCommandStack } from "../src/app/commands";
import { saveDeviceKeys } from "../src/storage/idb";
import { NOW, memDb } from "./orders-fixtures";

const noFetch = (async () => { throw new Error("no network in this test"); }) as unknown as typeof fetch;
async function paired() {
  const db = memDb(); const g = await generateDeviceKeys(); if (!g.ok) throw new Error("keygen");
  await saveDeviceKeys(db, g.keys);
  await db.put("keys", "credentials", { deviceId: "phone_pwa_0001", deviceToken: "tok", workspaceId: "0123456789abcdef0123456789abcdef", memberId: "mem_00000001", shopId: "testshop0001" });
  await db.put("keys", "desktop", { signingPublicKey: "AAAA", signingFingerprint: "ff", rsaPublicJwk: "{}" });
  return createCommandStack({ db, relayBase: "https://r.test", fetch: noFetch, now: () => NOW });
}
describe("createCommandStack.openConversations", () => {
  it("no sealed conversations stored: null (the inbox shows an error, never an invented empty inbox)", async () => {
    const s = await paired(); expect(typeof s?.openConversations).toBe("function");
    expect(await s?.openConversations()).toBeNull();
  });
});
