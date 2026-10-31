// S1b: the whole pairing handshake, desktop and phone, through the REAL relay
// worker on a SQL database (the node:sqlite D1 harness). The desktop side uses
// the Node modules; the phone side uses only browser-safe code (web/**,
// pairing-link.ts and pairing-trust.ts, which import nothing but web/**).
// Attacks are made by the relay itself: it rewrites its own rows.
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../../../control-plane/connected/worker";
import {
  INSTALLATION_ID,
  RELAY,
  SHOP_ID,
  WORKSPACE_ID,
  createWorld,
  type World,
} from "../../../../control-plane/connected/__tests__/harness";
import { ConnectedPlatformClient } from "../client";
import { approvedDeviceIds, emptyDeviceApprovalState, withDeviceApproved, withDeviceCreated } from "../device-approvals";
import { createConnectedEnvelope, openConnectedEnvelope } from "../envelope";
import { isRemoteCommandType } from "../command-policy";
import { buildDesktopPairingLink, parseDesktopPairingHash } from "../pairing-link";
import {
  encodeDesktopKeyProof,
  importDesktopSigningPrivateKey,
  signDesktopEncryptionKey,
  verifyDesktopKeyProof,
} from "../pairing-trust";
import { generateConnectedKeyPair, type ConnectedKeyPair } from "../payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  type ConnectedEnvelope,
} from "../protocol";
import {
  buildPairingExchangeBody,
  generateDeviceKeys,
  openEnvelopeWeb,
  sealEnvelopeWeb,
  type DeviceKeys,
  type DevicePublicKeys,
  type EnvelopeMetadata,
} from "../web";

type Phone = { keys: DeviceKeys; publicKeys: DevicePublicKeys };
type Ctx = { world: World; client: ConnectedPlatformClient; proof: string };
type Exchanged = {
  deviceId: string;
  memberId: string;
  deviceToken: string;
  desktopSigningPublicKey: string;
  desktopEncryptionPublicKey: string;
  desktopKeyProof: string | null;
};

let desktop: ConnectedKeyPair;
let goodProof: string;
let phoneA: Phone;
let phoneB: Phone;

function rsaJwk(): string {
  const jwk = generateKeyPairSync("rsa", { modulusLength: 3072 }).publicKey.export({ format: "jwk" });
  return JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e });
}

async function proofFor(rsaPublicJwk: string, signingPkcs8: string): Promise<string> {
  const key = await importDesktopSigningPrivateKey(signingPkcs8);
  if (!key) throw new Error("setup: cannot import the desktop signing key");
  const signed = await signDesktopEncryptionKey(rsaPublicJwk, key);
  if (!signed.ok) throw new Error("setup: cannot sign");
  const proof = encodeDesktopKeyProof(signed.signature, signed.context);
  if (!proof) throw new Error("setup: cannot format the proof");
  return proof;
}

async function newPhone(): Promise<Phone> {
  const made = await generateDeviceKeys();
  if (!made.ok) throw new Error(`setup: phone keys ${made.reason}`);
  return { keys: made.keys, publicKeys: made.publicKeys };
}

beforeAll(async () => {
  desktop = generateConnectedKeyPair();
  goodProof = await proofFor(desktop.encryptionPublicKeyJwk, desktop.signingPrivateKeyPkcs8);
  phoneA = await newPhone();
  phoneB = await newPhone();
}, 120_000);

afterEach(() => vi.unstubAllGlobals());

async function newCtx(): Promise<Ctx> {
  const world = await createWorld({
    desktop: { signingPublicKeyBase64: desktop.signingPublicKey, encryptionPublicKeyJwk: desktop.encryptionPublicKeyJwk },
  });
  // The desktop client talks to the worker in-process.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), world.env));
  const client = new ConnectedPlatformClient({
    endpoints: { control: RELAY, storefront: RELAY, backup: RELAY },
    controlToken: async () => world.desktopToken,
    backupToken: async () => "b".repeat(40),
    timeoutMs: 5_000,
  });
  return { world, client, proof: goodProof };
}

// (a) desktop: relay pairing carrying the proof, and the link the seller scans.
async function desktopPairs(ctx: Ctx, deviceId: string, options: { proof?: string | null; linkKey?: string } = {}) {
  const proof = options.proof === undefined ? ctx.proof : options.proof;
  const pairing = await ctx.client.createPairing({
    workspaceId: WORKSPACE_ID,
    memberId: "member_owner",
    deviceId,
    ...(proof === null ? {} : { desktopKeyProof: proof }),
  });
  const link = await buildDesktopPairingLink({
    pairingId: pairing.pairingId,
    pairingToken: pairing.pairingToken,
    desktopSigningPublicKey: options.linkKey ?? desktop.signingPublicKey,
  });
  if (!link) throw new Error("setup: no link");
  return { pairing, link };
}

// (b) phone: read the fragment, exchange, verify the desktop's key against the pin.
async function phonePairs(ctx: Ctx, hash: string, phone: Phone) {
  const fragment = parseDesktopPairingHash(hash);
  if (!fragment) throw new Error("phone could not read the link");
  const response = await ctx.world.call("/v1/pairings/exchange", {
    method: "POST",
    headers: { "CF-Connecting-IP": "203.0.113.9" },
    body: buildPairingExchangeBody(fragment.pairingId, fragment.pairingToken, phone.publicKeys),
  });
  expect(response.status).toBe(201);
  const exchanged = (await response.json()) as Exchanged;
  const verdict = await verifyDesktopKeyProof({
    rsaPublicJwk: exchanged.desktopEncryptionPublicKey,
    desktopKeyProof: exchanged.desktopKeyProof,
    desktopSigningPublicKey: exchanged.desktopSigningPublicKey,
    pinnedFingerprint: fragment.pin,
  });
  return { fragment, exchanged, verdict };
}

function phoneDevice(exchanged: Exchanged, phone: Phone) {
  return {
    deviceId: exchanged.deviceId,
    memberId: exchanged.memberId,
    token: exchanged.deviceToken,
    key: { privateKey: phone.keys.signing.privateKey, publicKeyBase64: phone.publicKeys.signingPublicKey },
  };
}

// (c) desktop: publish a projection sealed to the phone's RSA key.
async function desktopPublishes(ctx: Ctx, deviceId: string, sequence = 1) {
  const listed = await ctx.client.listDevices(WORKSPACE_ID);
  const row = (listed.devices as Array<{ device_id: string; member_id: string; encryption_public_key: string }>)
    .find((d) => d.device_id === deviceId);
  if (!row) throw new Error("device not listed");
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const policy = await ctx.client.putCommandPolicy({
    workspaceId: WORKSPACE_ID, shopId: SHOP_ID, memberId: row.member_id, deviceId,
    policyVersion: 1, memberRevocationEpoch: 0, deviceRevocationEpoch: 0,
    allowedCommands: ["command.comments.write"], expiresAt,
  });
  expect(policy.status).toBe("stored");
  const envelopeId = `projection_${randomUUID().replaceAll("-", "")}`;
  const envelope = createConnectedEnvelope(
    {
      protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId, idempotencyKey: envelopeId,
      workspaceId: WORKSPACE_ID, shopId: SHOP_ID, memberId: row.member_id, deviceId,
      installationId: INSTALLATION_ID, senderKind: "desktop", senderId: INSTALLATION_ID,
      recipientKind: "device", recipientId: deviceId, messageType: "projection.dashboard", sequence,
      issuedAt: new Date(Date.now() - 1_000).toISOString(), expiresAt, revocationEpoch: 0,
      cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "enckey_00000001",
      signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "sigkey_00000001",
    },
    { stats: { ordersToday: 7 }, connectedCommandAuthority: { allowedCommands: ["command.comments.write"] } },
    row.encryption_public_key,
    desktop.signingPrivateKeyPkcs8,
  );
  await ctx.client.putProjection(envelope);
}

// The desktop tick: only phones the seller approved get a projection.
async function desktopTick(ctx: Ctx, approved: ReadonlySet<string>) {
  const listed = await ctx.client.listDevices(WORKSPACE_ID);
  const ids = (listed.devices as Array<{ device_id: string }>).map((d) => d.device_id);
  for (const id of ids) if (approved.has(id)) await desktopPublishes(ctx, id);
}

async function fullPairing(ctx: Ctx, deviceId: string, phone: Phone) {
  const { link } = await desktopPairs(ctx, deviceId);
  const paired = await phonePairs(ctx, link.hash, phone);
  expect(paired.verdict.ok).toBe(true);
  return paired;
}

describe("pairing handshake: desktop and phone through the real relay", () => {
  it("(a-d) pairs, opens the sealed dashboard, and the desktop opens the phone's command", async () => {
    const ctx = await newCtx();
    const { exchanged, verdict, fragment } = await fullPairing(ctx, "phone_handshake_01", phoneA);
    if (!verdict.ok) throw new Error("unreachable");
    expect(fragment.pin).toBe(verdict.signingFingerprint);
    // the key the phone will seal to is the verified one, not the relay's string
    expect(exchanged.desktopKeyProof).toBe(ctx.proof);

    // (c) the seller approves; the desktop publishes; the phone opens it
    const state = withDeviceApproved(withDeviceCreated(emptyDeviceApprovalState(WORKSPACE_ID), exchanged.deviceId, 1), exchanged.deviceId, 2);
    await desktopTick(ctx, approvedDeviceIds(state));
    const got = await ctx.world.getProjection(phoneDevice(exchanged, phoneA));
    expect(got.status).toBe(200);
    const opened = await openEnvelopeWeb<{ stats: { ordersToday: number } }>(
      await got.json(), exchanged.desktopSigningPublicKey, phoneA.keys.encryption.privateKey,
      { expect: { recipientId: exchanged.deviceId, deviceId: exchanged.deviceId, minSequence: 1 } },
    );
    expect(opened).toMatchObject({ ok: true, payload: { stats: { ordersToday: 7 } } });

    // (d) the phone seals a command to the verified RSA key; the desktop polls and opens it
    const id = `command_${randomUUID().replaceAll("-", "")}`;
    const metadata: EnvelopeMetadata = {
      protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId: id, idempotencyKey: id,
      workspaceId: WORKSPACE_ID, shopId: SHOP_ID, memberId: exchanged.memberId, deviceId: exchanged.deviceId,
      installationId: INSTALLATION_ID, senderKind: "device", senderId: exchanged.deviceId,
      recipientKind: "desktop", recipientId: INSTALLATION_ID, messageType: "command.comments.write", sequence: 1,
      issuedAt: new Date(Date.now() - 1_000).toISOString(), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      revocationEpoch: 0, cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "enckey_00000001",
      signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "sigkey_00000001",
    };
    const sealed = await sealEnvelopeWeb(metadata, { text: "hello from the phone" }, verdict.rsaPublicJwk, phoneA.keys.signing.privateKey);
    const submitted = await ctx.world.call("/v1/commands", { method: "POST", token: exchanged.deviceToken, body: sealed });
    expect(submitted.status, "relay policy check on submit").toBeLessThan(300);

    const page = await ctx.client.pollCommands(WORKSPACE_ID, SHOP_ID, 0);
    expect(page.commands).toHaveLength(1);
    const queued = page.commands[0]?.envelope as ConnectedEnvelope;
    expect(isRemoteCommandType(queued.messageType)).toBe(true);
    const listed = (await ctx.client.listDevices(WORKSPACE_ID)).devices as Array<{ device_id: string; signing_public_key: string }>;
    const signer = listed.find((d) => d.device_id === queued.deviceId);
    expect(signer?.signing_public_key).toBe(phoneA.publicKeys.signingPublicKey);
    const atDesktop = openConnectedEnvelope<{ text: string }>(queued, signer?.signing_public_key ?? "", desktop.encryptionPrivateKeyPkcs8);
    expect(atDesktop.payload).toEqual({ text: "hello from the phone" });
  }, 60_000);

  it("an old desktop that sends no proof is refused by the phone with proof_missing", async () => {
    const ctx = await newCtx();
    const { link } = await desktopPairs(ctx, "phone_handshake_02", { proof: null });
    const { exchanged, verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(exchanged.desktopKeyProof).toBeNull();
    expect(verdict).toEqual({ ok: false, reason: "proof_missing" });
  }, 60_000);

  it("ATTACK: the relay swaps the RSA key in the exchange response -> bad_signature", async () => {
    const ctx = await newCtx();
    const { link } = await desktopPairs(ctx, "phone_handshake_03");
    ctx.world.d1.sqlite.prepare("UPDATE connected_workspace SET desktop_encryption_public_key = ?").run(rsaJwk());
    const { verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(verdict).toEqual({ ok: false, reason: "bad_signature" });
  }, 60_000);

  it("ATTACK: the relay swaps the signing key -> key_mismatch_with_pin", async () => {
    const ctx = await newCtx();
    const { link } = await desktopPairs(ctx, "phone_handshake_04");
    const attacker = generateConnectedKeyPair();
    ctx.world.d1.sqlite.prepare("UPDATE connected_workspace SET desktop_signing_public_key = ?").run(attacker.signingPublicKey);
    // even a proof the attacker signs for its own key cannot get past the pin
    ctx.world.d1.sqlite
      .prepare("UPDATE connected_pairing SET desktop_key_proof = ?")
      .run(await proofFor(desktop.encryptionPublicKeyJwk, attacker.signingPrivateKeyPkcs8));
    const { verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(verdict).toEqual({ ok: false, reason: "key_mismatch_with_pin" });
  }, 60_000);

  it("ATTACK: the relay strips the proof -> proof_missing", async () => {
    const ctx = await newCtx();
    const { link } = await desktopPairs(ctx, "phone_handshake_05");
    ctx.world.d1.sqlite.prepare("UPDATE connected_pairing SET desktop_key_proof = NULL").run();
    const { exchanged, verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(exchanged.desktopKeyProof).toBeNull();
    expect(verdict).toEqual({ ok: false, reason: "proof_missing" });
  }, 60_000);

  it("ATTACK: the relay replays an old proof (made for another RSA key) -> bad_signature", async () => {
    const ctx = await newCtx();
    const oldProof = await proofFor(rsaJwk(), desktop.signingPrivateKeyPkcs8); // genuine, but for a key the desktop no longer uses
    const { link } = await desktopPairs(ctx, "phone_handshake_06", { proof: oldProof });
    const { verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(verdict).toEqual({ ok: false, reason: "bad_signature" });
  }, 60_000);

  it("ATTACK: a link carrying another desktop's fingerprint -> key_mismatch_with_pin", async () => {
    const ctx = await newCtx();
    const { link } = await desktopPairs(ctx, "phone_handshake_07", { linkKey: generateConnectedKeyPair().signingPublicKey });
    const { verdict } = await phonePairs(ctx, link.hash, phoneA);
    expect(verdict).toEqual({ ok: false, reason: "key_mismatch_with_pin" });
  }, 60_000);

  it("an unapproved device gets no projection; the approved one does", async () => {
    const ctx = await newCtx();
    const a = await fullPairing(ctx, "phone_handshake_08", phoneA);
    const b = await fullPairing(ctx, "phone_handshake_09", phoneB);
    let state = withDeviceCreated(withDeviceCreated(emptyDeviceApprovalState(WORKSPACE_ID), a.exchanged.deviceId, 1), b.exchanged.deviceId, 1);
    state = withDeviceApproved(state, a.exchanged.deviceId, 2);
    await desktopTick(ctx, approvedDeviceIds(state));
    expect((await ctx.world.getProjection(phoneDevice(a.exchanged, phoneA))).status).toBe(200);
    expect((await ctx.world.getProjection(phoneDevice(b.exchanged, phoneB))).status).toBe(404);
  }, 60_000);

  it("phone-side code is browser-safe: pairing-link.ts and pairing-trust.ts import nothing but web/**", () => {
    for (const file of ["pairing-link.ts", "pairing-trust.ts"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const imports = [...source.matchAll(/^\s*(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1] ?? "");
      for (const spec of imports) {
        expect(spec.startsWith("node:"), `${file} imports ${spec}`).toBe(false);
        expect(/envelope"$|payload-crypto"$|\/server-only/.test(spec), `${file} imports ${spec}`).toBe(false);
        expect(spec.startsWith("./web/") || spec === "./pairing-trust" || spec === "./web", `${file} imports ${spec}`).toBe(true);
      }
    }
  });
});
