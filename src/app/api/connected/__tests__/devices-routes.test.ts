/**
 * Owner-only phone routes: every method x (owner, member, no permission, no
 * licence, not enrolled), the repeats, and the relay's refusals as typed errors.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import { PHONE_APP_ORIGIN, parseDesktopPairingHash } from "@/lib/connected-platform/pairing-link";
import { verifyDesktopEncryptionKey } from "@/lib/connected-platform/pairing-trust";
import { base64Encode } from "@/lib/connected-platform/web/bytes";
import { deviceFingerprint } from "@/lib/connected-platform/web/fingerprint";
import { SahelFlowError } from "@/types/errors";

const WS = "ws_test_0001";
const A = "phone_aaaaaaaa";
const B = "phone_bbbbbbbb";
import { parseDesktopKeyProofField } from "../../../../../control-plane/connected/key-proof";

// 43 base64url characters whose last one carries zero trailing bits (a real 32-byte token).
const TOKEN = `${"T".repeat(42)}A`;

const h = vi.hoisted(() => ({
  root: "",
  actor: {} as Record<string, unknown>,
  permission: vi.fn(),
  licence: vi.fn(),
  enrolled: true,
  createPairing: vi.fn(),
  listDevices: vi.fn(),
  revokeDevice: vi.fn(),
  kick: vi.fn(),
  audit: [] as Array<Record<string, unknown>>,
  desktopKeys: {} as Record<string, string>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/with-error-handler", () => ({ withErrorHandler: (handler: unknown) => handler }));
vi.mock("@/lib/storage/data-root", () => ({ dataRoot: () => h.root }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { workspaceId: "ws_test_0001" } }));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: h.permission,
  trustedActorAuditIdentity: () => "actor-1",
}));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: h.licence }));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (_context: unknown, entry: Record<string, unknown>) => { h.audit.push(entry); }),
}));
vi.mock("@/lib/connected-platform/runtime", () => ({
  loadConnectedRuntimeIfEnrolled: vi.fn(async () =>
    h.enrolled
      ? { client: { createPairing: h.createPairing, listDevices: h.listDevices, revokeDevice: h.revokeDevice }, desktopKeys: h.desktopKeys }
      : null),
}));
vi.mock("@/lib/connected-platform/remote-projection-worker", () => ({ kickConnectedProjectionWorker: h.kick }));

import { readDeviceApprovals, updateDeviceApprovals, withDeviceApproved, withDeviceCreated } from "@/lib/connected-platform/device-approvals";
import { GET as listRoute } from "../devices/route";
import { POST as approveRoute } from "../devices/[deviceId]/approve/route";
import { POST as revokeRoute } from "../devices/[deviceId]/revoke/route";
import { POST as pairingRoute } from "../devices/pairing/route";

type Result = { status: number; body: Record<string, unknown> };
async function run(fn: () => Promise<Response>): Promise<Result> {
  try {
    const response = await fn();
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  } catch (error) {
    if (error instanceof SahelFlowError) return { status: error.statusCode, body: { code: error.code, message: error.message } };
    throw error;
  }
}
const callPairing = () => run(() => (pairingRoute as unknown as () => Promise<Response>)());
const callList = () => run(() => (listRoute as unknown as () => Promise<Response>)());
const withId = (route: unknown, deviceId: string) =>
  run(() => (route as (request: Request, context: { params: Promise<{ deviceId: string }> }) => Promise<Response>)(
    new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ deviceId }) }));
const callApprove = (id: string) => withId(approveRoute, id);
const callRevoke = (id: string) => withId(revokeRoute, id);

const relayRow = (id: string, extra: Record<string, unknown> = {}) => ({
  device_id: id, member_id: "member_owner_1", signing_public_key: base64Encode(new Uint8Array(32).fill(id === A ? 3 : 4)),
  revocation_epoch: 2, last_seen_at: null, ...extra,
});

beforeAll(async () => {
  const subtle = globalThis.crypto.subtle;
  const signing = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const rsa = (await subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"])) as CryptoKeyPair;
  const jwk = await subtle.exportKey("jwk", rsa.publicKey);
  h.desktopKeys = {
    signingPublicKey: base64Encode(new Uint8Array(await subtle.exportKey("raw", signing.publicKey))),
    signingPrivateKeyPkcs8: base64Encode(new Uint8Array(await subtle.exportKey("pkcs8", signing.privateKey))),
    encryptionPublicKeyJwk: JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e }),
    encryptionPrivateKeyPkcs8: "unused",
  };
});

beforeEach(async () => {
  h.root = await mkdtemp(join(tmpdir(), "sf-routes-"));
  h.actor = { kind: "person", role: "owner", workspaceMemberId: "member_owner_1" };
  h.permission.mockReset();
  h.permission.mockImplementation(async () => ({ actor: h.actor }));
  h.licence.mockReset();
  h.licence.mockResolvedValue({});
  h.enrolled = true;
  for (const fn of [h.createPairing, h.listDevices, h.revokeDevice, h.kick]) fn.mockReset();
  h.createPairing.mockResolvedValue({ pairingId: "pair_0123456789abcdef0123456789abcdef", pairingToken: TOKEN, expiresAt: "2026-10-30T23:59:00.000Z" });
  h.listDevices.mockResolvedValue({ devices: [relayRow(A), relayRow(B)] });
  h.revokeDevice.mockResolvedValue({ deviceId: A, status: "revoked", revocationEpoch: 3 });
  h.audit.length = 0;
});
afterEach(async () => { await rm(h.root, { recursive: true, force: true }); });

const ROUTES: Array<[string, () => Promise<Result>, () => number]> = [
  ["POST pairing", callPairing, () => h.createPairing.mock.calls.length],
  ["GET devices", callList, () => h.listDevices.mock.calls.length],
  ["POST approve", () => callApprove(A), () => h.listDevices.mock.calls.length],
  ["POST revoke", () => callRevoke(A), () => h.listDevices.mock.calls.length + h.revokeDevice.mock.calls.length],
];

describe.each(ROUTES)("%s: who may call it", (_name, call, relayCalls) => {
  it.each([["member", { kind: "person", role: "member", workspaceMemberId: "member_2" }], ["automation", { kind: "automation" }]])("refuses a %s before touching the relay", async (_who, actor) => {
    h.actor = actor;
    const result = await call();
    expect(result).toMatchObject({ status: 403, body: { code: "PHONE_OWNER_ONLY" } });
    expect(relayCalls()).toBe(0);
    expect(h.audit).toEqual([]);
  });
  it("refuses a signed-in actor without the permission", async () => {
    h.permission.mockRejectedValue(new SahelFlowError("no", "ACTION_FORBIDDEN", 403));
    expect(await call()).toMatchObject({ status: 403, body: { code: "ACTION_FORBIDDEN" } });
    expect(relayCalls()).toBe(0);
  });
  it("needs the connected licence entitlement", async () => {
    h.licence.mockRejectedValue(new SahelFlowError("denied", "LICENSE_FEATURE_DENIED", 403));
    expect(await call()).toMatchObject({ status: 403, body: { code: "LICENSE_FEATURE_DENIED" } });
    expect(h.licence).toHaveBeenCalledWith("sahelflow.connected", expect.anything());
    expect(relayCalls()).toBe(0);
  });
  it("answers 409 when the shop is not enrolled", async () => {
    h.enrolled = false;
    expect(await call()).toMatchObject({ status: 409, body: { code: "CONNECTED_NOT_ENROLLED" } });
    expect(relayCalls()).toBe(0);
  });
});

describe("POST /api/connected/devices/pairing", () => {
  it("returns the link, the typing code, the expiry and a signed key that verifies against the pin", async () => {
    const { status, body } = await callPairing();
    expect(status).toBe(201);
    const link = String(body.link);
    expect(link.startsWith(`${PHONE_APP_ORIGIN}/#p=`)).toBe(true);
    expect(link.includes("?")).toBe(false);
    expect(link.split("#")).toHaveLength(2);
    const fragment = parseDesktopPairingHash(`#${link.split("#")[1]}`);
    expect(fragment?.pairingToken).toBe(TOKEN);
    expect(body.desktopFingerprint).toBe(await deviceFingerprint(h.desktopKeys.signingPublicKey));
    expect(fragment?.pin).toBe(body.desktopFingerprint);
    expect(body.expiresAt).toBe("2026-10-30T23:59:00.000Z");
    expect(String(body.code).split(" / ")).toHaveLength(3);
    const proof = body.desktopKeyProof as { rsaPublicJwk: string; signature: string; context: string };
    expect(await verifyDesktopEncryptionKey({ ...proof, desktopSigningPublicKey: h.desktopKeys.signingPublicKey, pinnedFingerprint: String(body.desktopFingerprint) }))
      .toMatchObject({ ok: true });
  });
  it("hands the relay the same signed key it shows, in the shape the relay accepts", async () => {
    const { body } = await callPairing();
    const sent = (h.createPairing.mock.calls[0]?.[0] ?? {}) as { desktopKeyProof?: string };
    const proof = body.desktopKeyProof as { signature: string; context: string };
    expect(sent.desktopKeyProof).toBe(`${proof.signature}.${proof.context}`);
    expect(parseDesktopKeyProofField(sent.desktopKeyProof)).toEqual({ ok: true, proof: sent.desktopKeyProof });
  });
  it("creates the pairing for the owner's member id with a fresh phone id, records it and writes an audit row without the token", async () => {
    const { body } = await callPairing();
    expect(h.createPairing).toHaveBeenCalledWith({
      workspaceId: WS, memberId: "member_owner_1", deviceId: body.deviceId, desktopKeyProof: expect.any(String),
    });
    expect(String(body.deviceId)).toMatch(/^phone_[0-9a-f]{32}$/);
    expect((await readDeviceApprovals(WS)).created[String(body.deviceId)]).toBeTypeOf("number");
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "connected.pairing.create", entityId: body.deviceId });
    expect(JSON.stringify(h.audit)).not.toContain(TOKEN);
  });
  it("two pairings use two different phone ids", async () => {
    const first = await callPairing();
    const second = await callPairing();
    expect(first.body.deviceId).not.toBe(second.body.deviceId);
  });
  it("turns the relay's device limit into a human 409", async () => {
    h.createPairing.mockRejectedValue(new ConnectedPlatformHttpError(403, "entitlement_limit_reached"));
    const result = await callPairing();
    expect(result).toMatchObject({ status: 409, body: { code: "PHONE_DEVICE_LIMIT" } });
    expect(String(result.body.message)).toContain("3 for the owner, 2 for each team member");
    expect(h.audit).toEqual([]);
  });
  it.each([[503, "remote_unavailable", 503, "PHONE_RELAY_UNAVAILABLE"], [429, "rate_limited", 429, "PHONE_PAIRING_RATE_LIMITED"], [401, "unauthorized", 409, "PHONE_RELAY_REFUSED"]])("relay %i is typed", async (relayStatus, relayCode, status, code) => {
    h.createPairing.mockRejectedValue(new ConnectedPlatformHttpError(relayStatus, relayCode));
    expect(await callPairing()).toMatchObject({ status, body: { code } });
  });
  it("does not hide an unknown failure", async () => {
    h.createPairing.mockRejectedValue(new Error("boom"));
    await expect(callPairing()).rejects.toThrow("boom");
  });
  it("needs the owner's own member id (a local compatibility owner has none)", async () => {
    h.actor = { kind: "compatibility_local_owner", role: "owner" };
    expect(await callPairing()).toMatchObject({ status: 409, body: { code: "PHONE_OWNER_MEMBER_REQUIRED" } });
    expect(h.createPairing).not.toHaveBeenCalled();
  });
  it("uses no relay slot when the desktop cannot sign its key", async () => {
    h.desktopKeys = { ...h.desktopKeys, signingPrivateKeyPkcs8: "bm9wZQ==" };
    expect(await callPairing()).toMatchObject({ status: 503, body: { code: "PHONE_KEY_PROOF_UNAVAILABLE" } });
    expect(h.createPairing).not.toHaveBeenCalled();
  });
});

describe("GET /api/connected/devices", () => {
  it("merges the relay list with the local approvals", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(withDeviceCreated(state, A, Date.UTC(2026, 9, 30, 8)), A, 5));
    const { status, body } = await callList();
    expect(status).toBe(200);
    const devices = body.devices as Array<{ deviceId: string; status: string; fingerprint: string }>;
    expect(devices.map((device) => [device.deviceId, device.status])).toEqual([[A, "approved"], [B, "pending"]]);
    expect(devices[0]?.fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  });
  it("an empty relay list is an empty list; an unreachable relay is a typed 503", async () => {
    h.listDevices.mockResolvedValueOnce({ devices: [] });
    expect((await callList()).body.devices).toEqual([]);
    h.listDevices.mockRejectedValueOnce(new ConnectedPlatformHttpError(503, "remote_unavailable"));
    expect(await callList()).toMatchObject({ status: 503, body: { code: "PHONE_RELAY_UNAVAILABLE" } });
  });
});

describe("POST approve", () => {
  it("approves once, audits, wakes the worker; a repeat changes nothing", async () => {
    expect(await callApprove(A)).toMatchObject({ status: 200, body: { ok: true, alreadyApproved: false } });
    expect((await readDeviceApprovals(WS)).approved[A]).toBeTypeOf("number");
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "connected.device.approve", entityId: A });
    expect(h.kick).toHaveBeenCalledTimes(1);
    const first = (await readDeviceApprovals(WS)).approved[A];
    expect(await callApprove(A)).toMatchObject({ status: 200, body: { ok: true, alreadyApproved: true } });
    expect(h.audit).toHaveLength(1);
    expect(h.kick).toHaveBeenCalledTimes(1);
    expect((await readDeviceApprovals(WS)).approved[A]).toBe(first);
    expect((await readDeviceApprovals(WS)).approved[B]).toBeUndefined();
  });
  it.each([["an unknown phone", "phone_zzzzzzzz"], ["a malformed id", "x"], ["an id with a slash", "a/../../b"]])("%s is 404", async (_name, id) => {
    expect(await callApprove(id)).toMatchObject({ status: 404, body: { code: "PHONE_NOT_FOUND" } });
    expect(h.audit).toEqual([]);
  });
  it("a phone the relay marks revoked is 409 and is not approved", async () => {
    h.listDevices.mockResolvedValue({ devices: [relayRow(A, { revoked_at: "2026-10-30 10:00:00" })] });
    expect(await callApprove(A)).toMatchObject({ status: 409, body: { code: "PHONE_REVOKED" } });
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
  });
  it("an unreachable relay is a typed 503 and approves nothing", async () => {
    h.listDevices.mockRejectedValue(new ConnectedPlatformHttpError(504, "remote_timeout"));
    expect(await callApprove(A)).toMatchObject({ status: 503, body: { code: "PHONE_RELAY_UNAVAILABLE" } });
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
  });
});

describe("POST revoke", () => {
  it("wipes the local approval, revokes at the relay with the next epoch and audits", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 1));
    expect(await callRevoke(A)).toMatchObject({ status: 200, body: { ok: true, alreadyRevoked: false } });
    expect(h.revokeDevice).toHaveBeenCalledWith(A, { workspaceId: WS, revocationEpoch: 3 });
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({ action: "connected.device.revoke", entityId: A });
  });
  it("a repeat after the relay dropped the phone is 200 alreadyRevoked with no second audit row", async () => {
    await callRevoke(A);
    h.listDevices.mockResolvedValue({ devices: [relayRow(B)] });
    h.revokeDevice.mockClear();
    expect(await callRevoke(A)).toMatchObject({ status: 200, body: { ok: true, alreadyRevoked: true } });
    expect(h.revokeDevice).not.toHaveBeenCalled();
    expect(h.audit).toHaveLength(1);
  });
  it("a relay 404 counts as already revoked", async () => {
    h.revokeDevice.mockRejectedValue(new ConnectedPlatformHttpError(404, "device_not_found"));
    expect(await callRevoke(A)).toMatchObject({ status: 200, body: { alreadyRevoked: true } });
  });
  it("a relay epoch race is a 409 the seller can retry", async () => {
    h.revokeDevice.mockRejectedValue(new ConnectedPlatformHttpError(409, "revocation_epoch_conflict"));
    expect(await callRevoke(A)).toMatchObject({ status: 409, body: { code: "PHONE_REVOKE_CONFLICT" } });
  });
  it("with the relay unreachable the local approval is STILL gone (fail closed)", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 1));
    h.revokeDevice.mockRejectedValue(new ConnectedPlatformHttpError(503, "remote_unavailable"));
    expect(await callRevoke(A)).toMatchObject({ status: 503, body: { code: "PHONE_RELAY_UNAVAILABLE" } });
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
  });
  it("a malformed id is 404 and touches nothing", async () => {
    expect(await callRevoke("x")).toMatchObject({ status: 404, body: { code: "PHONE_NOT_FOUND" } });
    expect(h.listDevices).not.toHaveBeenCalled();
  });
});
