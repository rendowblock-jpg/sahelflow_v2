import { describe, expect, it } from "vitest";

import { mergeDevices, pairingRefusalFromRelay, relativeTimeParts } from "./desktop-devices";
import { base64Encode } from "./web/bytes";

const key = (seed: number) => base64Encode(new Uint8Array(32).fill(seed));
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  device_id: id, member_id: "member_owner_1", signing_public_key: key(7), revocation_epoch: 1, last_seen_at: null, ...extra,
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
