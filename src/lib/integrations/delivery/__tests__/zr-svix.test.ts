import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  SVIX_TOLERANCE_SECONDS,
  computeSvixSignature,
  verifySvixSignature,
} from "../zr-svix";

// A deterministic test key: "whsec_" + base64("sahelflow-svix-test-key")
const SECRET = "whsec_" + Buffer.from("sahelflow-svix-test-key", "utf8").toString("base64");
const RAW_SECRET = Buffer.from("sahelflow-svix-test-key", "utf8").toString("base64");
const BODY = JSON.stringify({ event: "parcel.state.changed", data: { tracking: "ZR-1" } });

function sign(id: string, timestamp: string, payload: string, secret = RAW_SECRET): string {
  return createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${payload}`, "utf8")
    .digest("base64");
}

describe("Svix signature verification (ZR Express webhook contract — dormant)", () => {
  it("accepts a correctly signed delivery", () => {
    const id = "msg_test_0001";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, BODY);
    expect(
      verifySvixSignature(
        BODY,
        { id, timestamp, signature: `v1,${signature}` },
        SECRET,
      ),
    ).toBe(true);
  });

  it("accepts the raw base64 secret without the whsec_ prefix", () => {
    const id = "msg_test_0002";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, BODY);
    expect(
      verifySvixSignature(
        BODY,
        { id, timestamp, signature: `v1,${signature}` },
        RAW_SECRET,
      ),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const id = "msg_test_0003";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, BODY);
    expect(
      verifySvixSignature(
        JSON.stringify({ event: "parcel.state.changed", data: { tracking: "ZR-2" } }),
        { id, timestamp, signature: `v1,${signature}` },
        SECRET,
      ),
    ).toBe(false);
  });

  it("rejects timestamps outside the anti-replay tolerance (300 s)", () => {
    expect(SVIX_TOLERANCE_SECONDS).toBe(300);
    const id = "msg_test_0004";
    const stale = String(Math.floor(Date.now() / 1000) - SVIX_TOLERANCE_SECONDS - 1);
    const signature = sign(id, stale, BODY);
    expect(
      verifySvixSignature(BODY, { id, timestamp: stale, signature: `v1,${signature}` }, SECRET),
    ).toBe(false);
  });

  it("accepts any of several space-separated v1 signatures", () => {
    const id = "msg_test_0005";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const good = sign(id, timestamp, BODY);
    const other = sign(id, timestamp, BODY, Buffer.from("another-key", "utf8").toString("base64"));
    expect(
      verifySvixSignature(
        BODY,
        { id, timestamp, signature: `v1,${other} v1,${good}` },
        SECRET,
      ),
    ).toBe(true);
  });

  it("rejects missing headers, malformed timestamps and foreign versions", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign("msg_x", timestamp, BODY);
    expect(verifySvixSignature(BODY, { id: null, timestamp, signature }, SECRET)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_x", timestamp: null, signature }, SECRET)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_x", timestamp, signature: null }, SECRET)).toBe(false);
    expect(
      verifySvixSignature(
        BODY,
        { id: "msg_x", timestamp: "not-a-number", signature: `v1,${signature}` },
        SECRET,
      ),
    ).toBe(false);
    expect(
      verifySvixSignature(
        BODY,
        { id: "msg_x", timestamp, signature: `v0,${signature}` },
        SECRET,
      ),
    ).toBe(false);
  });

  it("rejects an undecodable secret without throwing", () => {
    const id = "msg_test_0006";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(id, timestamp, BODY);
    expect(
      verifySvixSignature(
        BODY,
        { id, timestamp, signature: `v1,${signature}` },
        "whsec_@@@not-base64@@@",
      ),
    ).toBe(false);
  });

  it("round-trips through the exported computeSvixSignature helper", () => {
    const id = "msg_test_0007";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const computed = computeSvixSignature(SECRET, id, timestamp, BODY);
    expect(computed).toBe(sign(id, timestamp, BODY));
    expect(
      verifySvixSignature(BODY, { id, timestamp, signature: `v1,${computed}` }, SECRET),
    ).toBe(true);
  });
});
