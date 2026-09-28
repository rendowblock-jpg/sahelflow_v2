/**
 * MCP endpoint publication (FD-063 MCP-11): a client-launched bridge finds the
 * running app through `mcp/endpoint.json`, and the transport accepts the token
 * published for this launch.
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mcpEndpointFile,
  publishMcpEndpoint,
} from "@/lib/mcp/endpoint";
import { authorizeMcpTransport, resetMcpTransportToken } from "@/lib/mcp/transport-auth";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sf-mcp-endpoint-"));
  vi.stubEnv("SF_DATA_DIR", root);
  vi.stubEnv("SF_APP_URL", "http://127.0.0.1:48123/");
  vi.stubEnv("MCP_SIDECAR_TOKEN", "");
  vi.stubEnv("MCP_SIDECAR_TOKEN_FILE", "");
  resetMcpTransportToken();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetMcpTransportToken();
  rmSync(root, { recursive: true, force: true });
});

describe("MCP endpoint publication", () => {
  it("publishes this launch's origin and a private transport token", async () => {
    const descriptor = await publishMcpEndpoint();
    expect(descriptor).toMatchObject({
      version: 1,
      url: "http://127.0.0.1:48123",
      tokenFile: join(root, "mcp", "transport-token"),
    });
    expect(JSON.parse(readFileSync(mcpEndpointFile(), "utf8"))).toMatchObject({
      url: "http://127.0.0.1:48123",
    });
    const token = readFileSync(descriptor.tokenFile, "utf8");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    if (process.platform !== "win32") {
      expect(statSync(descriptor.tokenFile).mode & 0o077).toBe(0);
    }
  });

  it("mints a fresh token at every launch", async () => {
    const first = readFileSync((await publishMcpEndpoint()).tokenFile, "utf8");
    const second = readFileSync((await publishMcpEndpoint()).tokenFile, "utf8");
    expect(second).not.toBe(first);
  });

  it("authorizes the transport with the published token", async () => {
    const descriptor = await publishMcpEndpoint();
    const token = readFileSync(descriptor.tokenFile, "utf8");
    await expect(
      authorizeMcpTransport(
        new Request("http://127.0.0.1:48123/api/mcp", {
          method: "POST",
          headers: { host: "127.0.0.1:48123", authorization: `Bearer ${token}` },
        }),
      ),
    ).resolves.toEqual({ connectionId: "default" });
  });

  it("advertises a shell-provided token file instead of minting one", async () => {
    vi.stubEnv("MCP_SIDECAR_TOKEN_FILE", join(root, "shell-token"));
    const descriptor = await publishMcpEndpoint();
    expect(descriptor.tokenFile).toBe(join(root, "shell-token"));
  });
});
