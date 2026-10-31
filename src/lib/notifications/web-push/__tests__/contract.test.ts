import { describe, expect, it } from "vitest";

import { subscribeCommandSchema, unsubscribeCommandSchema } from "../contract";

const POINT = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]);
const AUTH = Buffer.alloc(16, 9);
const valid = {
  v: 1,
  endpoint: "https://fcm.googleapis.com/fcm/send/TEST-ONLY-1",
  p256dh: POINT.toString("base64url"),
  auth: AUTH.toString("base64url"),
  locale: "ar",
  deviceLabel: "Phone",
};

describe("command.push.subscribe payload", () => {
  it("accepts a valid payload, with or without a label", () => {
    expect(subscribeCommandSchema.safeParse(valid).success).toBe(true);
    const { deviceLabel: _unused, ...withoutLabel } = valid;
    expect(subscribeCommandSchema.safeParse(withoutLabel).success).toBe(true);
    expect(subscribeCommandSchema.safeParse({ ...valid, locale: "fr-DZ" }).success).toBe(true);
  });

  it.each<[string, Record<string, unknown>]>([
    ["version 2", { v: 2 }],
    ["no version", { v: undefined }],
    ["http endpoint", { endpoint: "http://fcm.googleapis.com/fcm/send/x" }],
    ["loopback endpoint", { endpoint: "https://127.0.0.1/x" }],
    ["look-alike endpoint", { endpoint: "https://fcm.googleapis.com.evil.example/x" }],
    ["endpoint not a string", { endpoint: 5 }],
    ["p256dh 64 bytes", { p256dh: Buffer.alloc(64, 4).toString("base64url") }],
    ["p256dh not starting with 0x04", { p256dh: Buffer.concat([Buffer.from([2]), Buffer.alloc(64, 7)]).toString("base64url") }],
    ["p256dh with padding", { p256dh: POINT.toString("base64") }],
    ["p256dh not base64url", { p256dh: "not base64url!" }],
    ["auth 15 bytes", { auth: Buffer.alloc(15, 1).toString("base64url") }],
    ["auth 17 bytes", { auth: Buffer.alloc(17, 1).toString("base64url") }],
    ["empty locale", { locale: "" }],
    ["long locale", { locale: "a".repeat(40) }],
    ["locale with spaces", { locale: "ar DZ" }],
    ["empty label", { deviceLabel: "" }],
    ["long label", { deviceLabel: "x".repeat(81) }],
    ["unknown key", { extra: "x" }],
  ])("refuses %s", (_label, change) => {
    expect(subscribeCommandSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it("refuses anything that is not an object", () => {
    for (const value of [null, undefined, "x", 5, []]) {
      expect(subscribeCommandSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("command.push.unsubscribe payload", () => {
  it("takes a 12-hex endpoint hash and nothing else", () => {
    expect(unsubscribeCommandSchema.safeParse({ v: 1, endpointHash: "0123456789ab" }).success).toBe(true);
    for (const bad of [
      { v: 1, endpointHash: "0123456789AB" },
      { v: 1, endpointHash: "0123456789a" },
      { v: 1, endpointHash: "https://fcm.googleapis.com/x" },
      { v: 2, endpointHash: "0123456789ab" },
      { v: 1, endpointHash: "0123456789ab", endpoint: "x" },
    ]) {
      expect(unsubscribeCommandSchema.safeParse(bad).success).toBe(false);
    }
  });
});
