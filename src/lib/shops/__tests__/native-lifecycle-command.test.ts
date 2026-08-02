import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import {
  nativeShopLifecycleAuthorizationBytes,
  signNativeShopLifecycleAuthorization,
  type NativeShopLifecycleAuthorization,
} from "../native-lifecycle-command";

const GOLDEN_MAC =
  "68abd891f99707bf0ce89bc506db3f23dd72a9ad245cd1a1b86085af5588997b";

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
      actorSessionId: "session-exact",
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
  it("matches the Rust golden framing and HMAC vector", () => {
    const authorization = switchAuthorization();

    expect(nativeShopLifecycleAuthorizationBytes(authorization)).toHaveLength(569);
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
