// W3-F3 round 3d: the chip shows the PC's time: the command authority expiry comes from the verified projection (authority.expiresAt).
import { describe, expect, it } from "vitest";
import type { Db } from "../src/storage/idb";
import { authorityExpiryOf, createAuthority } from "../src/sync/authority";

const AT = Date.UTC(2026, 9, 31, 12, 0);
const auth = { policyVersion: 5, memberRevocationEpoch: 2, installationId: "installation_01", expiresAt: AT };
const snap = (a: Record<string, unknown>): unknown => ({ sequence: 1, receivedAt: 1, projection: { authority: a } });
const dbOf = (box: { v: unknown }): Db => ({ get: async () => box.v } as unknown as Db);

describe("authorityExpiryOf", () => {
  it("reads the PC time in ms", () => { expect(authorityExpiryOf(snap(auth))).toBe(AT); });
  it.each([["text", "2026-10-31"], ["zero", 0], ["negative", -5], ["NaN", Number.NaN], ["missing", undefined]])("%s gives null", (_n, v) => { expect(authorityExpiryOf(snap({ ...auth, expiresAt: v }))).toBeNull(); });
  it.each([[null], [undefined], [{}], [{ projection: {} }]])("junk %# gives null", (v) => { expect(authorityExpiryOf(v)).toBeNull(); });
});

describe("createAuthority().expiresAt", () => {
  it("undefined before load, follows the newest snapshot, and is undefined when the snapshot has no scope or no time", async () => {
    const box: { v: unknown } = { v: snap(auth) }; const a = createAuthority(dbOf(box));
    expect(a.expiresAt()).toBeUndefined();
    await a.load(); expect(a.expiresAt()).toBe(AT);
    box.v = snap({ ...auth, expiresAt: AT + 60_000 }); await a.load(); expect(a.expiresAt()).toBe(AT + 60_000);
    box.v = snap({ ...auth, expiresAt: undefined }); await a.load(); expect(a.expiresAt()).toBeUndefined();
    box.v = snap({ expiresAt: AT }); await a.load(); expect(a.expiresAt()).toBeUndefined(); expect(a.scope()).toBeNull();
  });
});
