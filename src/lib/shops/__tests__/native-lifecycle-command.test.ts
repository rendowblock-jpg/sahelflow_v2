import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import {
  nativeShopLifecycleAuthorizationBytes,
  signNativeShopLifecycleAuthorization,
  type NativeShopLifecycleAuthorization,
} from "../native-lifecycle-command";

const GOLDEN_MAC =
  "511273bd842a6c5d5265c78e3f74c3f4b7d8f2ee12e37774129add287c640630";

function identity(character: string): string {
  return character.repeat(32);
}

function switchAuthorization(): NativeShopLifecycleAuthorization {
  return {
    formatVersion: 1,
    issuedAtUnixMs: 1_000_000,
    expiresAtUnixMs: 1_030_000,
    request: {
      formatVersion: 1,
      operationId: identity("1"),
      operation: "switch",
      expectedRegistryRevision: 7,
      workspaceId: identity("2"),
      installationId: identity("3"),
      actorPersonId: identity("4"),
      actorMemberId: identity("5"),
      actorDeviceId: identity("6"),
      actorSessionBinding: "b".repeat(64),
      policyVersion: 3,
      revocationEpoch: 1,
      entitlementId: "license_001",
      entitlementRevision: 4,
      shopSlots: 5,
      migrationSetSha256: "a".repeat(64),
      currentShopId: "current-shop",
      currentShopIncarnationId: identity("7"),
      targetShopId: "target-shop",
      targetShopIncarnationId: identity("8"),
      recentOwnerReauthentication: false,
    },
    payload: { operation: "switch" },
  };
}

beforeEach(() => {
  process.env.SF_MASTER_KEY = "09".repeat(32);
  _resetMasterKeyCacheForTests();
});

afterEach(() => {
  delete process.env.SF_MASTER_KEY;
  _resetMasterKeyCacheForTests();
});

describe("native shop lifecycle command", () => {
  it("matches the Rust opaque-session framing and HMAC vector", () => {
    const authorization = switchAuthorization();

    expect(nativeShopLifecycleAuthorizationBytes(authorization)).toHaveLength(620);
    expect(signNativeShopLifecycleAuthorization(authorization)).toEqual({
      authorization,
      mac: GOLDEN_MAC,
    });
  });

  it("rejects operation and payload drift before signing", () => {
    const authorization = switchAuthorization();

    expect(() =>
      signNativeShopLifecycleAuthorization({
        ...authorization,
        payload: { operation: "archive" },
      }),
    ).toThrow("operation and payload do not match");
  });

  it("rejects raw or noncanonical session material", () => {
    const authorization = switchAuthorization();

    expect(() =>
      signNativeShopLifecycleAuthorization({
        ...authorization,
        request: {
          ...authorization.request,
          actorSessionBinding: "session-exact",
        },
      }),
    ).toThrow("actorSessionBinding must be exactly 32 bytes of lowercase hex");

    expect(() =>
      signNativeShopLifecycleAuthorization({
        ...authorization,
        request: {
          ...authorization.request,
          actorSessionBinding: "B".repeat(64),
        },
      }),
    ).toThrow("actorSessionBinding must be exactly 32 bytes of lowercase hex");
  });

  it("rejects unsigned commercial and registry authority gaps", () => {
    const authorization = switchAuthorization();

    expect(() =>
      signNativeShopLifecycleAuthorization({
        ...authorization,
        request: {
          ...authorization.request,
          expectedRegistryRevision: 0,
        },
      }),
    ).toThrow("expectedRegistryRevision must be positive");

    expect(() =>
      signNativeShopLifecycleAuthorization({
        ...authorization,
        request: { ...authorization.request, shopSlots: 11 },
      }),
    ).toThrow("shopSlots is outside the signed launch range");
  });
});
