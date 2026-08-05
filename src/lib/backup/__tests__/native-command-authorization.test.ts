import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createNativeCommandAuthorization,
  NATIVE_SURVIVABILITY_ACTIONS,
} from "@/lib/backup/native-command-authorization";
import { deriveInstallationKey } from "@/lib/crypto/key-hierarchy";

const ROOT = Buffer.alloc(32, 0x44);
const CONTEXT = {
  workspaceId: "10".repeat(16),
  installationId: "20".repeat(16),
};
const DOMAIN = Buffer.from(
  "sahelflow.native-command.authorization.v1\0",
  "utf8",
);

function frame(field: Buffer): Buffer {
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(field.length));
  return Buffer.concat([DOMAIN, length, field]);
}

describe("native survivability authorization", () => {
  it("authenticates the exact canonical payload with the purpose-separated key", () => {
    const token = createNativeCommandAuthorization({
      installationRoot: ROOT,
      shopContext: CONTEXT,
      action: NATIVE_SURVIVABILITY_ACTIONS.prepareRestore,
      resource: "backup-1234567890-abcdef1234567890",
      issuedAtUnixMs: 1_800_000_000_000,
      nonce: Buffer.alloc(16, 0x33),
    });
    const [payloadHex, macHex] = token.split(".");
    const payload = Buffer.from(payloadHex!, "hex");
    const decoded = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;

    expect(decoded).toEqual({
      formatVersion: 1,
      action: "survivability-restore:prepare",
      workspaceId: CONTEXT.workspaceId,
      installationId: CONTEXT.installationId,
      issuedAtUnixMs: 1_800_000_000_000,
      expiresAtUnixMs: 1_800_000_060_000,
      nonce: "33".repeat(16),
      resource: "backup-1234567890-abcdef1234567890",
    });

    const derived = deriveInstallationKey(ROOT, {
      ...CONTEXT,
      purpose: "native-command-bridge",
      version: 1,
    });
    const expected = createHmac("sha256", derived.key)
      .update(frame(payload))
      .digest("hex");
    derived.key.fill(0);
    expect(macHex).toBe(expected);
    expect(createHash("sha256").update(token).digest("hex")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("rejects resources that cannot be native file identities", () => {
    expect(() =>
      createNativeCommandAuthorization({
        installationRoot: ROOT,
        shopContext: CONTEXT,
        action: NATIVE_SURVIVABILITY_ACTIONS.delete,
        resource: "../outside",
      }),
    ).toThrow(/resource/i);
  });
});
