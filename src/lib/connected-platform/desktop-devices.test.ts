import { describe, expect, it } from "vitest";

import { mergeDevices, normalizePairingCodeInput, pairingCodeMatches, pairingRefusalFromRelay, relativeTimeParts } from "./desktop-devices";
import { base64Encode, base64UrlEncode } from "./web/bytes";

const key = (seed: number) => base64Encode(new Uint8Array(32).fill(seed));
const rsa = (seed: number) => JSON.stringify({ kty: "RSA", n: base64UrlEncode(new Uint8Array(384).fill(seed)), e: "AQAB" });
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  device_id: id, member_id: "member_owner_1", signing_public_key: key(7), encryption_public_key: rsa(1), revocation_epoch: 1, last_seen_at: null, ...extra,
});

describe("mergeDevices", () => {
  it("marks a relay device pending until the desktop approved it", async () => {
    const views = await mergeDevices(
      [row("phone_aaaaaaaa"), row("phone_bbbbbbbb", { signing_public_key: key(9) })],
      { approved: { phone_bbbbbbbb: 5 }, created: { phone_aaaaaaaa: Date.UTC(2026, 9, 30, 10), phone_bbbbbbbb: Date.UTC(2026, 9, 30, 9) } },
    );
    expect(views.map((view) => [view.deviceId, view.status])).toEqual([["phone_bbbbbbbb", "approved"], ["phone_aaaaaaaa", "pending"]]);
    expect(views[0]?.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(views[0]?.fingerprint).not.toBe(views[1]?.fingerprint);
    expect(views[1]?.createdAt).toBe("2026-10-30T10:00:00.000Z");
  });
  it("reads D1 timestamps as UTC and keeps a relay revoked row revoked even if once approved", async () => {
    const [view] = await mergeDevices([row("phone_cccccccc", { last_seen_at: "2026-10-30 12:30:00", revoked_at: "2026-10-30 13:00:00" })], { approved: { phone_cccccccc: 1 }, created: {} });
    expect(view?.lastSeenAt).toBe("2026-10-30T12:30:00.000Z");
    expect(view?.status).toBe("revoked");
  });
  it("skips rows with bad ids and gives a null fingerprint for a bad key", async () => {
    const views = await mergeDevices([row("x"), null, "junk", row("phone_dddddddd", { signing_public_key: "nope" })], { approved: {}, created: {} });
    expect(views).toHaveLength(1);
    expect(views[0]?.fingerprint).toBeNull();
    expect(views[0]?.createdAt).toBeNull();
  });
});

describe("relativeTimeParts", () => {
  const now = 1_000_000_000_000;
  it.each([
    [0, 0, "second"], [30_000, 0, "second"], [44_000, 0, "second"],
    [60_000, -1, "minute"], [44 * 60_000, -44, "minute"],
    [3_600_000, -1, "hour"], [21 * 3_600_000, -21, "hour"],
    [86_400_000, -1, "day"], [10 * 86_400_000, -10, "day"],
    [60 * 86_400_000, -2, "month"],
  ])("%i ms ago -> %i %s", (ago, value, unit) => {
    expect(relativeTimeParts(now - ago, now)).toEqual({ value, unit });
  });
  it("handles the future and a broken clock", () => {
    expect(relativeTimeParts(now + 120_000, now)).toEqual({ value: 2, unit: "minute" });
    expect(relativeTimeParts(Number.NaN, now)).toEqual({ value: 0, unit: "second" });
  });
});

describe("pairingRefusalFromRelay", () => {
  it("turns the relay limit into a human 409", () => {
    expect(pairingRefusalFromRelay(403, "entitlement_limit_reached")).toMatchObject({ code: "PHONE_DEVICE_LIMIT", status: 409 });
    expect(pairingRefusalFromRelay(403, "entitlement_limit_reached")?.message).toContain("3 for the owner, 2 for each team member");
  });
  it.each([[429, "rate_limited", "PHONE_PAIRING_RATE_LIMITED"], [401, "unauthorized", "PHONE_RELAY_REFUSED"], [503, "remote_unavailable", "PHONE_RELAY_UNAVAILABLE"], [504, "remote_timeout", "PHONE_RELAY_UNAVAILABLE"]])("%i %s", (status, code, expected) => {
    expect(pairingRefusalFromRelay(status, code)?.code).toBe(expected);
  });
  it("leaves unknown errors alone", () => {
    expect(pairingRefusalFromRelay(500, "boom")).toBeNull();
    expect(pairingRefusalFromRelay(403, "other")).toBeNull();
  });
});

describe("mergeDevices: the relay's real dates (S1b)", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const row = (over: Record<string, unknown>) => ({
    device_id: "phone_aaaaaaaa", member_id: "member_aaaaaaaa", signing_public_key: key, encryption_public_key: "j",
    revocation_epoch: 0, last_seen_at: null, created_at: "2026-10-29 08:30:00", revoked_at: null, ...over,
  });
  const local = { approved: {}, created: { phone_aaaaaaaa: Date.parse("2026-10-01T00:00:00.000Z") } };

  it("uses the relay's created_at over the local record and reports revoked_at as revokedAt", async () => {
    const { mergeDevices } = await import("./desktop-devices");
    const [view] = await mergeDevices([row({ revoked_at: "2026-10-30 10:00:00" })], local);
    expect(view).toMatchObject({ createdAt: "2026-10-29T08:30:00.000Z", revokedAt: "2026-10-30T10:00:00.000Z", status: "revoked" });
  });
  it("a live device has revokedAt null", async () => {
    const { mergeDevices } = await import("./desktop-devices");
    const [view] = await mergeDevices([row({})], local);
    expect(view).toMatchObject({ createdAt: "2026-10-29T08:30:00.000Z", revokedAt: null, status: "pending" });
  });
});

describe("mergeDevices: the code covers the RSA encryption key too", () => {
  const fingerprintOf = async (extra: Record<string, unknown>) =>
    (await mergeDevices([row("phone_eeeeeeee", extra)], { approved: {}, created: {} }))[0]?.fingerprint;

  it("a row with no encryption key, or an invalid one, has no code (so it cannot be approved)", async () => {
    expect(await fingerprintOf({ encryption_public_key: undefined })).toBeNull();
    expect(await fingerprintOf({ encryption_public_key: null })).toBeNull();
    expect(await fingerprintOf({ encryption_public_key: "nope" })).toBeNull();
    expect(await fingerprintOf({ encryption_public_key: JSON.stringify({ kty: "RSA", e: "AQAB" }) })).toBeNull();
    expect(await fingerprintOf({ encryption_public_key: 5 })).toBeNull();
  });
  it("the same signing key with another RSA key gives another code; the same keys give the same code", async () => {
    const one = await fingerprintOf({});
    expect(one).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(await fingerprintOf({ encryption_public_key: rsa(2) })).not.toBe(one);
    expect(await fingerprintOf({})).toBe(one);
  });
});

describe("typed pairing code", () => {
  const CODE = "A1B2-C3D4-E5F6-7788";
  it("normalises case, spaces, dashes, Arabic-Indic and Eastern digits and full-width characters", () => {
    expect(normalizePairingCodeInput(" a1b2 c3d4-e5f6_7788 ")).toBe("A1B2C3D4E5F67788");
    expect(normalizePairingCodeInput("A\u0661B\u0662-C\u0663D\u0664 E\u0665F\u0666 \u0667\u0667\u0668\u0668")).toBe("A1B2C3D4E5F67788");
    expect(normalizePairingCodeInput("A\u06F1B\u06F2C\u06F3D\u06F4E\u06F5F\u06F6\u06F7\u06F7\u06F8\u06F8")).toBe("A1B2C3D4E5F67788");
    expect(normalizePairingCodeInput("\uFF21\uFF11\uFF22\uFF12-C3D4-E5F6-7788")).toBe("A1B2C3D4E5F67788");
    expect(normalizePairingCodeInput("xyz!")).toBe("");
  });
  it("matches only the exact code, and never when the device has no code", () => {
    expect(pairingCodeMatches("a1b2 c3d4 e5f6 7788", CODE)).toBe(true);
    expect(pairingCodeMatches(CODE, CODE)).toBe(true);
    expect(pairingCodeMatches("A1B2-C3D4-E5F6-7789", CODE)).toBe(false);
    expect(pairingCodeMatches("A1B2-C3D4-E5F6", CODE)).toBe(false);
    expect(pairingCodeMatches("A1B2-C3D4-E5F6-7788-0", CODE)).toBe(false);
    expect(pairingCodeMatches("", CODE)).toBe(false);
    expect(pairingCodeMatches(CODE, null)).toBe(false);
    expect(pairingCodeMatches("", null)).toBe(false);
  });
});
