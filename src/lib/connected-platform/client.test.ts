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

  it("states the exact SHA-256 of every backup object it uploads (the Worker refuses an upload without it)", async () => {
    const manifest = new TextEncoder().encode("encrypted manifest bytes");
    const chunk = new Uint8Array(4096).map((_, index) => (index * 7) % 251);
    const seen: Array<{ url: string; sha: string | null; length: string | null; body: Uint8Array }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url: String(input),
        sha: headers.get("X-SahelFlow-SHA256"),
        length: headers.get("Content-Length"),
        body: init?.body as Uint8Array,
      });
      return Response.json({ backupId: "backup-1760000000000-aaaaaaaaaaaaaaaa", status: "uploaded", replay: false });
    }));
    await client().uploadBackupManifest("backup-1760000000000-aaaaaaaaaaaaaaaa", "workspace_12345678", manifest);
    await client().uploadBackupChunk("backup-1760000000000-aaaaaaaaaaaaaaaa", 3, "workspace_12345678", chunk);

    expect(seen).toHaveLength(2);
    for (const [index, bytes] of [manifest, chunk].entries()) {
      const sent = seen[index]!;
      expect(sent.sha).toBe(createHash("sha256").update(bytes).digest("hex"));
      expect(sent.length).toBe(String(bytes.byteLength));
      // The hash must describe the bytes that were really sent, not the caller's buffer.
      expect(createHash("sha256").update(sent.body).digest("hex")).toBe(sent.sha);
    }
    expect(seen[0]!.url).toContain("/manifest");
    expect(seen[1]!.url).toContain("/chunks/3");
  });
});
