// W3-F3 round 3b: the command authority comes from the LAST VERIFIED dashboard projection. Anything missing means no scope (no guess).
import { describe, expect, it } from "vitest";
import type { Db } from "../src/storage/idb";
import { authorityOf, createAuthority } from "../src/sync/authority";

const snap = (a: Record<string, unknown>): unknown => ({ sequence: 1, receivedAt: 1, projection: { authority: a } });
const good = { policyVersion: 5, memberRevocationEpoch: 2, installationId: "installation_01" };
const dbOf = (box: { v: unknown }): Db => ({ get: async () => box.v } as unknown as Db);

describe("authorityOf", () => {
  it("reads the policy version, the member epoch and the PC installation id", () => {
    expect(authorityOf(snap(good))).toEqual({ policyVersion: 5, revocationEpoch: 2, installationId: "installation_01" });
    expect(authorityOf(snap({ ...good, memberRevocationEpoch: 0 }))?.revocationEpoch).toBe(0);
  });
  it.each([
    ["policy 0", { policyVersion: 0 }], ["policy 1.5", { policyVersion: 1.5 }], ["no policy", { policyVersion: undefined }],
    ["epoch -1", { memberRevocationEpoch: -1 }], ["epoch as text", { memberRevocationEpoch: "2" }], ["no epoch", { memberRevocationEpoch: undefined }],
    ["short installation id", { installationId: "short" }], ["no installation id", { installationId: undefined }],
  ])("%s gives no authority", (_n, over) => { expect(authorityOf(snap({ ...good, ...over }))).toBeNull(); });
  it.each([[null], [undefined], [42], [{}], [{ projection: {} }], [{ projection: { authority: [] } }]])("junk %# gives no authority", (v) => { expect(authorityOf(v)).toBeNull(); });
});

describe("createAuthority", () => {
  it("knows nothing before load, then follows the newest snapshot, and forgets when the snapshot has no scope", async () => {
    const box: { v: unknown } = { v: snap(good) }; const a = createAuthority(dbOf(box));
    expect(a.scope()).toBeNull(); expect(a.policyVersion()).toBeNull();
    await a.load(); expect(a.policyVersion()).toBe(5); expect(a.scope()).toEqual({ installationId: "installation_01", revocationEpoch: 2 });
    box.v = snap({ ...good, policyVersion: 6, memberRevocationEpoch: 3 }); await a.load(); expect(a.policyVersion()).toBe(6); expect(a.scope()?.revocationEpoch).toBe(3);
    box.v = snap({ policyVersion: 7 }); await a.load(); expect(a.scope()).toBeNull(); expect(a.policyVersion()).toBeNull();
  });
});
