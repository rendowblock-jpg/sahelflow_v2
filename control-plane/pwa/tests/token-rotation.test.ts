// W4SEC-05, phone side: the phone swaps its device token for a new one, proves it holds its signing key, never wipes because of the swap,
// and its command transport picks the new token up. Real relay worker + real SQL + real Ed25519 phone keys.
import { createHash, createPublicKey, verify as nodeVerify } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../connected/worker";
import { RELAY, WORKSPACE_ID, createWorld, type World } from "../../connected/__tests__/harness";
import { base64Decode, buildPairingExchangeBody, generateDeviceKeys, type DeviceKeys, type DevicePublicKeys } from "../../../src/lib/connected-platform/web";
import { saveDeviceKeys, type Db, type StoreName } from "../src/storage/idb";
import type { PairingIdentity } from "../src/pair/pinned";
import { createPhoneTransport } from "../src/sync/transport";

const MINUTE = 60_000; const HOUR = 60 * MINUTE; const DAY = 24 * HOUR;
let phone: { keys: DeviceKeys; publicKeys: DevicePublicKeys };
beforeAll(async () => {
  const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys");
  phone = { keys: made.keys, publicKeys: made.publicKeys };
}, 120_000);
afterEach(() => vi.useRealTimers());

const load = () => import("../src/sync/token-rotation");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

function memoryDb(): Db {
  const stores = new Map<string, Map<string, unknown>>();
  const of = (n: string): Map<string, unknown> => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  return {
    get: async <T>(n: StoreName, k: string) => of(n).get(k) as T | undefined, put: async (n, k, v) => { of(n).set(k, v); },
    remove: async (n, k) => { of(n).delete(k); }, clear: async (n) => { of(n).clear(); }, keys: async (n) => [...of(n).keys()], close: () => undefined,
  };
}
function freeze() {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE + MINUTE;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(minute + 20_000);
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

/** A paired phone on a real relay: pairing through the worker, credentials and keys in a memory database. */
async function pairedPhone() {
  freeze();
  const w: World = await createWorld();
  const created = await w.createPairing("device_phone_01", "member_owner");
  const body = buildPairingExchangeBody(created.body.pairingId ?? "", created.body.pairingToken ?? "", phone.publicKeys);
  const done = await w.call("/v1/pairings/exchange", { method: "POST", headers: { "CF-Connecting-IP": "203.0.113.7" }, body });
  expect(done.status).toBe(201);
  const issued = (await done.json()) as { deviceToken: string; deviceId: string; workspaceId: string; memberId: string };
  const db = memoryDb(); await saveDeviceKeys(db, phone.keys);
  const identity: PairingIdentity = { deviceId: issued.deviceId, deviceToken: issued.deviceToken, workspaceId: issued.workspaceId, memberId: issued.memberId, shopId: "shop_0001" };
  await db.put("keys", "credentials", identity);
  const calls: { url: string; body: string; auth: string | null }[] = [];
  let drop = 0; let blocked: Promise<void> | null = null;
  const relayFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, body: await request.clone().text(), auth: request.headers.get("authorization") });
    if (blocked) await blocked;
    const answer = await worker.fetch(request, w.env);
    if (drop > 0) { drop -= 1; throw new TypeError("network lost the answer"); }
    return answer;
  }) as typeof fetch;
  const creds = async () => (await db.get<PairingIdentity & { tokenCheckedAt?: number }>("keys", "credentials"))!;
  const projectionStatus = async (token: string) => (await w.getProjection({ deviceId: issued.deviceId, memberId: issued.memberId, token, key: undefined as never })).status;
  return { w, db, identity, calls, relayFetch, creds, projectionStatus, dropNextAnswers: (n: number) => { drop = n; }, blockUntil: (p: Promise<void>) => { blocked = p; } };
}
const make = async (r: Awaited<ReturnType<typeof pairedPhone>>, fetchImpl?: typeof fetch) => {
  const m = await load();
  return m.createTokenRotation({ getDb: async () => r.db, relayBase: RELAY, fetch: fetchImpl ?? r.relayFetch, now: Date.now });
};

describe("the numbers", () => {
  it("the phone asks the relay at most every 12 hours, and retries a failed ask after 5 minutes", async () => {
    const m = await load();
    expect(m.ROTATE_CHECK_MIN_GAP_MS).toBe(12 * HOUR);
    expect(m.ROTATE_RETRY_MIN_GAP_MS).toBe(5 * MINUTE);
  });
});

describe("swap against the real relay", () => {
  it("an old token is swapped, the new one is saved with the rest of the credentials, and it is the one that works", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY);
    expect(await rotation.check()).toBe("rotated");
    const saved = await r.creds();
    expect(saved.deviceToken).not.toBe(r.identity.deviceToken);
    expect(saved).toMatchObject({ deviceId: r.identity.deviceId, workspaceId: r.identity.workspaceId, memberId: r.identity.memberId, shopId: "shop_0001", tokenCheckedAt: Date.now() });
    expect(await r.projectionStatus(saved.deviceToken)).not.toBe(401);
    expect(r.w.rows<{ token_hash: string }>("SELECT token_hash FROM connected_device")[0]?.token_hash).toBe(sha(saved.deviceToken));
  });

  it("a young token: the relay says not due, the token stays, the check time is saved", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(DAY);
    expect(await rotation.check()).toBe("not_due");
    expect((await r.creds()).deviceToken).toBe(r.identity.deviceToken);
    expect((await r.creds()).tokenCheckedAt).toBe(Date.now());
  });

  it("asks at most once in 12 hours (no request at all in between), and again after that", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    expect(await rotation.check()).toBe("not_due");
    expect(r.calls).toHaveLength(1);
    advance(12 * HOUR - 1);
    expect(await rotation.check()).toBe("recent");
    expect(r.calls).toHaveLength(1);
    advance(1);
    expect(await rotation.check()).toBe("not_due");
    expect(r.calls).toHaveLength(2);
  });

  it("a phone that is not paired makes no request", async () => {
    const r = await pairedPhone(); await r.db.clear("keys"); const rotation = await make(r);
    expect(await rotation.check()).toBe("not_paired");
    expect(r.calls).toHaveLength(0);
  });

  it("two checks at the same time make one request", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY);
    const [a, b] = await Promise.all([rotation.check(), rotation.check()]);
    expect(r.calls).toHaveLength(1);
    expect([a, b].sort()).toEqual(["rotated", "rotated"]);
  });

  it("the request carries a signature made with the phone's own key over this token, this device and this time (nothing secret in it)", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY); await rotation.check();
    const call = r.calls[0]!;
    expect(new URL(call.url).pathname).toBe("/v1/devices/rotate-token");
    expect(call.auth).toBe(`Bearer ${r.identity.deviceToken}`);
    const sent = JSON.parse(call.body) as { workspaceId: string; deviceId: string; issuedAt: number; signature: string };
    expect(Object.keys(sent).sort()).toEqual(["deviceId", "issuedAt", "signature", "workspaceId"]);
    expect(sent.issuedAt).toBe(Date.now());
    expect(call.body).not.toContain(r.identity.deviceToken);
    const message = `sahelflow.device-token-rotate.v1\n${WORKSPACE_ID}\n${r.identity.deviceId}\n${sha(r.identity.deviceToken)}\n${sent.issuedAt}`;
    const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(base64Decode(phone.publicKeys.signingPublicKey))]), format: "der", type: "spki" });
    expect(nodeVerify(null, Buffer.from(message), publicKey, Buffer.from(base64Decode(sent.signature)))).toBe(true);
  });

  it("a lost answer: the phone keeps the old token, asks again 5 minutes later with it, and ends with a working token", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY);
    r.dropNextAnswers(1);
    expect(await rotation.check()).toBe("later");
    expect((await r.creds()).deviceToken).toBe(r.identity.deviceToken);
    expect(await rotation.check()).toBe("later"); // too soon: no second request yet
    expect(r.calls).toHaveLength(1);
    advance(5 * MINUTE);
    expect(await rotation.check()).toBe("rotated");
    const saved = await r.creds();
    expect(await r.projectionStatus(saved.deviceToken)).not.toBe(401);
    expect(r.calls).toHaveLength(2);
    expect(r.calls[1]!.auth).toBe(`Bearer ${r.identity.deviceToken}`);
  });

  it("does not undo a credential change made while the request was in flight (the shop learned by a poll is kept)", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY);
    let release: () => void = () => undefined; r.blockUntil(new Promise<void>((resolve) => { release = resolve; }));
    const pending = rotation.check();
    await vi.waitFor(() => expect(r.calls).toHaveLength(1));
    await r.db.put("keys", "credentials", { ...r.identity, shopId: "shop_learned" });
    release();
    expect(await pending).toBe("rotated");
    expect(await r.creds()).toMatchObject({ shopId: "shop_learned" });
  });

  it("does not write a token into credentials that now belong to another pairing", async () => {
    const r = await pairedPhone(); const rotation = await make(r);
    advance(8 * DAY);
    let release: () => void = () => undefined; r.blockUntil(new Promise<void>((resolve) => { release = resolve; }));
    const pending = rotation.check();
    await vi.waitFor(() => expect(r.calls).toHaveLength(1));
    const repaired = { ...r.identity, deviceId: "device_other_99", deviceToken: "n".repeat(43) };
    await r.db.put("keys", "credentials", repaired);
    release(); await pending;
    expect(await r.creds()).toEqual(repaired);
  });
});

describe("it never wipes and never trusts a strange answer", () => {
  const scripted = async (status: number, body: unknown) => {
    const r = await pairedPhone();
    const calls: number[] = [];
    const fetchImpl = (async () => { calls.push(1); return Response.json(body, { status }); }) as unknown as typeof fetch;
    return { r, calls, rotation: await make(r, fetchImpl) };
  };
  it.each([[401, { error: "unauthorized" }], [403, { error: "invalid_proof" }], [404, { error: "not_found" }], [409, { error: "rotation_conflict" }], [429, { error: "rate_limited" }], [500, {}], [503, {}]])(
    "HTTP %i changes nothing and says 'later' (the poll, not the swap, decides what a 401 means)", async (status, body) => {
      const { r, rotation } = await scripted(status, body);
      expect(await rotation.check()).toBe("later");
      expect(await r.creds()).toEqual(r.identity);
    });
  it("a network error says 'later'", async () => {
    const r = await pairedPhone();
    const rotation = await make(r, (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
    expect(await rotation.check()).toBe("later");
    expect(await r.creds()).toEqual(r.identity);
  });
  it.each([[{ rotated: true }], [{ rotated: true, deviceToken: "" }], [{ rotated: true, deviceToken: "short" }], [{ rotated: true, deviceToken: 12345 }],
    [{ rotated: true, deviceToken: "bad token with spaces and more than thirty two characters" }], [{ rotated: true, deviceToken: "x".repeat(300) }], ["not an object"]])(
    "a 'rotated' answer without a usable token (%j) is ignored", async (body) => {
      const { r, rotation } = await scripted(200, body);
      expect(await rotation.check()).toBe("later");
      expect(await r.creds()).toEqual(r.identity);
    });
});

describe("the command transport uses the token that is current NOW", () => {
  const rig = (token?: () => string | Promise<string>) => {
    const seen: (string | null)[] = [];
    const fetchImpl = (async (_u: RequestInfo | URL, init?: RequestInit) => { seen.push(new Headers(init?.headers).get("authorization")); return Response.json({}, { status: 202 }); }) as typeof fetch;
    const transport = createPhoneTransport({
      relayBase: RELAY, keys: {} as never, pinned: {} as never, scope: () => null, fetch: fetchImpl, now: Date.now,
      identity: { deviceId: "device_phone_01", deviceToken: "OLD-TOKEN-0000000000000000000000000000000", workspaceId: WORKSPACE_ID, memberId: "member_owner", shopId: null },
      ...(token ? { token } : {}),
    } as never);
    return { transport, seen };
  };
  it("posts and status checks read the token per request", async () => {
    let current = "NEW-TOKEN-1111111111111111111111111111111";
    const { transport, seen } = rig(() => current);
    await transport.post("{}"); current = "NEWER-TOKEN-222222222222222222222222222222";
    await transport.status("cmd_00000001");
    expect(seen).toEqual([`Bearer NEW-TOKEN-1111111111111111111111111111111`, `Bearer NEWER-TOKEN-222222222222222222222222222222`]);
  });
  it("accepts an async getter (the token lives in IndexedDB)", async () => {
    const { transport, seen } = rig(async () => "FROM-IDB-333333333333333333333333333333");
    await transport.post("{}");
    expect(seen).toEqual(["Bearer FROM-IDB-333333333333333333333333333333"]);
  });
  it("without a getter it still uses the token it was built with (nothing else changes)", async () => {
    const { transport, seen } = rig();
    await transport.post("{}");
    expect(seen).toEqual(["Bearer OLD-TOKEN-0000000000000000000000000000000"]);
  });
});
