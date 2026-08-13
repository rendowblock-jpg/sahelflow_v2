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
});
