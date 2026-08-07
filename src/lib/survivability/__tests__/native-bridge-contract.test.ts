import { describe, expect, it } from "vitest";

import {
  verifyBridgeHandshake,
  type BridgeHandshake,
  type EndpointManifest,
} from "@/lib/survivability/native-bridge";

const ROOT = Buffer.alloc(32, 0x11);
const WORKSPACE = "10".repeat(16);
const INSTALLATION = "20".repeat(16);

function manifest(): EndpointManifest {
  return {
    formatVersion: 1,
    state: "ready",
    host: "127.0.0.1",
    port: 43_123,
    instanceId: "ab".repeat(16),
    processId: 4242,
    createdAtUnixMs: 1_700_000_000_000,
  };
}

function handshake(overrides: Partial<BridgeHandshake> = {}): BridgeHandshake {
  return {
    formatVersion: 1,
    instanceId: "ab".repeat(16),
    port: 43_123,
    workspaceId: WORKSPACE,
    installationId: INSTALLATION,
    challenge: "cd".repeat(32),
    mac: "28a9ebf9ed0a20b35a2dc279235e1d6f01165fdb98c48f8224f7465f33fa9ce6",
    ...overrides,
  };
}

describe("native survivability bridge handshake", () => {
  it("matches the shared Rust/TypeScript golden vector", () => {
    expect(() =>
      verifyBridgeHandshake(manifest(), handshake(), ROOT, {
        workspaceId: WORKSPACE,
        installationId: INSTALLATION,
      }),
    ).not.toThrow();
  });

  it("rejects endpoint substitution before sending a protected request", () => {
    expect(() =>
      verifyBridgeHandshake(
        { ...manifest(), port: 43_124 },
        handshake(),
        ROOT,
        {
          workspaceId: WORKSPACE,
          installationId: INSTALLATION,
        },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SURVIVABILITY_HANDSHAKE_MISMATCH" }),
    );
  });

  it("rejects challenge or MAC tampering", () => {
    expect(() =>
      verifyBridgeHandshake(
        manifest(),
        handshake({ challenge: "ce".repeat(32) }),
        ROOT,
        {
          workspaceId: WORKSPACE,
          installationId: INSTALLATION,
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "SURVIVABILITY_HANDSHAKE_AUTH_FAILED",
      }),
    );
  });
});
