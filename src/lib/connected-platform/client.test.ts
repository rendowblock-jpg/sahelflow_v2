import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedPlatformClient, ConnectedPlatformHttpError } from "./client";

const endpoints = {
  control: "https://control.sahelflow.example",
  storefront: "https://store.sahelflow.example",
  backup: "https://backup.sahelflow.example",
};

function client() {
  return new ConnectedPlatformClient({
    endpoints,
    controlToken: async () => "c".repeat(40),
    backupToken: async () => "b".repeat(40),
    timeoutMs: 2_000,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("ConnectedPlatformClient", () => {
  it("rejects insecure non-loopback origins", () => {
    expect(() => new ConnectedPlatformClient({
      endpoints: { ...endpoints, control: "http://example.com" },
      controlToken: async () => "c".repeat(40),
    })).toThrow(/HTTPS/);
  });

  it("sends control requests with no-store and bearer authority", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${"c".repeat(40)}`);
      expect(init?.cache).toBe("no-store");
      return Response.json({ devices: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().listDevices("workspace_12345678")).resolves.toEqual({ devices: [] });
  });

  it("surfaces only bounded remote error codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "tenant_scope_rejected", secret: "must-not-leak" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    )));
    await expect(client().listDevices("workspace_12345678")).rejects.toMatchObject({
      status: 403,
      code: "tenant_scope_rejected",
    } satisfies Partial<ConnectedPlatformHttpError>);
  });

  it("fails closed when a protected token provider returns invalid authority", async () => {
    const invalid = new ConnectedPlatformClient({
      endpoints,
      controlToken: async () => "short",
    });
    await expect(invalid.listDevices("workspace_12345678")).rejects.toThrow(/token authority/i);
  });

  it("sends the SHA-256 of every backup upload body, which the backup Worker requires", async () => {
    // Found by running the real backup Worker: without this header the Worker
    // answers manifest_integrity_mismatch / chunk_integrity_mismatch (409) to
    // every upload, so no desktop backup could ever reach the cloud.
    const seen: Array<{ url: string; method: string | undefined; sha: string | null; length: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url: String(input),
        method: init?.method,
        sha: headers.get("X-SahelFlow-SHA256"),
        length: headers.get("Content-Length"),
      });
      return Response.json({ backupId: "backup_12345678", status: "uploaded", replay: false });
    }));
    const manifest = new Uint8Array([1, 2, 3, 4, 5]);
    const chunk = Uint8Array.from({ length: 4096 }, (_, index) => index % 251);
    await client().uploadBackupManifest("backup_12345678", "workspace_12345678", manifest);
    await client().uploadBackupChunk("backup_12345678", 3, "workspace_12345678", chunk);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      method: "PUT",
      sha: createHash("sha256").update(manifest).digest("hex"),
      length: String(manifest.byteLength),
    });
    expect(seen[0]!.url).toContain("/v1/backups/backup_12345678/manifest");
    expect(seen[1]).toMatchObject({
      method: "PUT",
      sha: createHash("sha256").update(chunk).digest("hex"),
      length: String(chunk.byteLength),
    });
    expect(seen[1]!.url).toContain("/v1/backups/backup_12345678/chunks/3");
    expect(seen[0]!.sha).not.toBe(seen[1]!.sha);
  });
});
