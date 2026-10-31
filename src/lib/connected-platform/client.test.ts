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

describe("hosted photos (check and put)", () => {
  const STOREFRONT = "storefront_12345678";
  const WORKSPACE = "workspace_12345678";
  const HASH = "0123456789abcdef01234567";
  const webp = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 5, 6]);
  const digest = createHash("sha256").update(webp).digest("hex");

  it("check: POST with exact URL, JSON body and the bearer token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return Response.json({ origin: "https://media.example.test", widths: [640, 1280], present: [HASH] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const answer = await client().checkStorefrontMedia(STOREFRONT, { workspaceId: WORKSPACE, hashes: [HASH] });
    expect(answer.present).toEqual([HASH]);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe(`https://store.sahelflow.example/v1/desktop/storefronts/${STOREFRONT}/media/check`);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ workspaceId: WORKSPACE, hashes: [HASH] }));
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${"c".repeat(40)}`);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("put: PUT with exact URL, image/webp, the digest header and the bytes", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return Response.json({ status: "stored", url: "https://media.example.test/m/x", bytes: webp.byteLength, width: 640 }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const answer = await client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, webp, digest);
    expect(answer.status).toBe("stored");
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe(`https://store.sahelflow.example/v1/desktop/storefronts/${STOREFRONT}/media/${HASH}/640?workspaceId=${WORKSPACE}`);
    expect(init?.method).toBe("PUT");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("image/webp");
    expect(headers.get("X-SahelFlow-SHA256")).toBe(digest);
    expect(headers.get("Authorization")).toBe(`Bearer ${"c".repeat(40)}`);
    expect(Array.from(init?.body as Uint8Array)).toEqual(Array.from(webp));
  });

  it("put: 200 (already there) succeeds like 201", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "exists", url: "u", bytes: 10, width: 1280 })));
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 1280, WORKSPACE, webp, digest)).resolves.toMatchObject({ status: "exists" });
  });

  it.each([
    [409, "media_conflict"],
    [413, "media_too_large"],
    [415, "unsupported_media_type"],
    [507, "media_quota_exceeded"],
    [400, "digest_mismatch"],
  ])("put: %i becomes a typed error with the Worker's code", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: code }, { status })));
    const failure = await client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, webp, digest).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ConnectedPlatformHttpError);
    expect(failure).toMatchObject({ status, code });
  });

  it("keeps Retry-After of a 503 in the error, and none when the Worker sent none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "media_unavailable" }, { status: 503, headers: { "Retry-After": "5" } })));
    const busy = await client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, webp, digest).catch((e: unknown) => e);
    expect(busy).toMatchObject({ status: 503, code: "media_unavailable", retryAfterSeconds: 5 });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "media_unavailable" }, { status: 503 })));
    const off = await client().checkStorefrontMedia(STOREFRONT, { workspaceId: WORKSPACE, hashes: [HASH] }).catch((e: unknown) => e);
    expect(off).toMatchObject({ status: 503, code: "media_unavailable" });
    expect((off as ConnectedPlatformHttpError).retryAfterSeconds).toBeUndefined();
  });

  it("maps a timeout to 504 and a network failure to 503", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("slow"), { name: "TimeoutError" }); }));
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, webp, digest)).rejects.toMatchObject({ status: 504, code: "remote_timeout" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, webp, digest)).rejects.toMatchObject({ status: 503, code: "remote_unavailable" });
  });

  it("refuses a body over the width's cap BEFORE sending anything", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const tooBig640 = new Uint8Array(160 * 1024 + 1);
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, tooBig640, digest)).rejects.toMatchObject({ status: 413 });
    const tooBig1280 = new Uint8Array(600 * 1024 + 1);
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 1280, WORKSPACE, tooBig1280, digest)).rejects.toMatchObject({ status: 413 });
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, new Uint8Array(0), digest)).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a body exactly at the cap and refuses names the Worker would not know", async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: "stored", url: "u", bytes: 1, width: 640 }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await client().putStorefrontMedia(STOREFRONT, HASH, 640, WORKSPACE, new Uint8Array(160 * 1024), digest);
    await client().putStorefrontMedia(STOREFRONT, HASH, 1280, WORKSPACE, new Uint8Array(600 * 1024), digest);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(client().putStorefrontMedia(STOREFRONT, HASH, 800, WORKSPACE, webp, digest)).rejects.toThrow(TypeError);
    await expect(client().putStorefrontMedia(STOREFRONT, "../etc", 640, WORKSPACE, webp, digest)).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
