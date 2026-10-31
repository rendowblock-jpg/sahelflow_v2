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

describe("ConnectedPlatformClient.revokeDevice", () => {
  const input = { workspaceId: "workspace_12345678", revocationEpoch: 2 };

  it("posts the revocation with the desktop bearer and returns the relay answer", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${"c".repeat(40)}`);
      expect(JSON.parse(String(init?.body))).toEqual(input);
      return Response.json({ deviceId: "device_12345678", status: "revoked", revocationEpoch: 2 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().revokeDevice("device_12345678", input)).resolves.toEqual({
      deviceId: "device_12345678",
      status: "revoked",
      revocationEpoch: 2,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://control.sahelflow.example/v1/desktop/devices/device_12345678/revoke",
    );
  });

  it("refuses a device id that would change the route, before any request", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().revokeDevice("device/../revoke", input)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [409, "revocation_epoch_conflict"],
    [404, "device_not_found"],
    [401, "unauthorized"],
  ])("turns relay status %i into a typed error", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: code }, { status })));
    await expect(client().revokeDevice("device_12345678", input)).rejects.toMatchObject({
      name: "ConnectedPlatformHttpError",
      status,
      code,
    });
  });

  it("reports an unreachable relay as remote_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const error = await client().revokeDevice("device_12345678", input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectedPlatformHttpError);
    expect(error).toMatchObject({ status: 503, code: "remote_unavailable" });
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses epoch %s before any request", async (revocationEpoch) => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().revokeDevice("device_12345678", { ...input, revocationEpoch })).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createPairing and listDevices (S1b)", () => {
  const PROOF = `${"A".repeat(86)}==.sahelflow.pairing.rsa-key.v1`;
  const ids = { workspaceId: "workspace_12345678", memberId: "member_12345678", deviceId: "phone_12345678" };

  function bodies() {
    const sent: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? "null")));
      return Response.json({ pairingId: "pair_x", pairingToken: "t", expiresAt: "2026-10-31T00:00:00.000Z" }, { status: 201 });
    }));
    return sent;
  }

  it("passes desktopKeyProof to the relay when there is one", async () => {
    const sent = bodies();
    await client().createPairing({ ...ids, desktopKeyProof: PROOF });
    expect(sent).toEqual([{ ...ids, desktopKeyProof: PROOF }]);
  });

  it("sends no desktopKeyProof member at all when there is none", async () => {
    const sent = bodies();
    await client().createPairing(ids);
    expect(sent).toEqual([ids]);
    expect(sent[0]).not.toHaveProperty("desktopKeyProof");
  });

  it("types the relay's device rows with created_at and revoked_at", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ devices: [{
      device_id: "phone_12345678", member_id: "member_12345678", signing_public_key: "k", encryption_public_key: "j",
      revocation_epoch: 0, last_seen_at: null, created_at: "2026-10-30 10:00:00", revoked_at: null,
    }] })));
    const listed = await client().listDevices("workspace_12345678");
    expect(listed.devices[0]?.created_at).toBe("2026-10-30 10:00:00");
    expect(listed.devices[0]?.revoked_at).toBeNull();
  });
});
