import "server-only";

import { randomUUID } from "node:crypto";
import { getDashboardAnalytics } from "@/lib/data/analytics-data";
import { getDashboardStats, getRecentOrders } from "@/lib/data/dashboard";
import { db } from "@/lib/db";
import {
  projectDashboardForTrustedActor,
  resolveDashboardFieldAccess,
} from "@/lib/identity/dashboard-projection";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { getPhase2PresetPermissions } from "@/lib/identity/permissions";
import { ConnectedPlatformClient } from "./client";
import { remoteCommandTypesForPermissions } from "./command-policy";
import { createConnectedEnvelope } from "./envelope";
import type { ConnectedKeyPair } from "./payload-crypto";
import { readPhoneTodayCounts } from "./phone-today-counts";
import { SEAL_HARD_LIMIT, projectionMessageType, type ProjectionKind } from "./contracts";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
} from "./protocol";

export const PROJECTION_TTL_MS = 15 * 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export type RemoteDevice = Readonly<{
  deviceId: string;
  memberId: string;
  encryptionPublicKey: string;
  revocationEpoch: number;
}>;

function parseRemoteDevice(value: unknown): RemoteDevice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const deviceId = String(row.device_id ?? "");
  const memberId = String(row.member_id ?? "");
  const encryptionPublicKey = String(row.encryption_public_key ?? "");
  const revocationEpoch = Number(row.revocation_epoch);
  if (
    !DEVICE_ID.test(deviceId) ||
    !DEVICE_ID.test(memberId) ||
    encryptionPublicKey.length < 32 ||
    encryptionPublicKey.length > 4096 ||
    !Number.isSafeInteger(revocationEpoch) ||
    revocationEpoch < 0
  ) return null;
  return Object.freeze({ deviceId, memberId, encryptionPublicKey, revocationEpoch });
}

/** One counter per device and kind; the dashboard key is the one used before the other kinds existed. */
export function projectionSequenceKey(kind: ProjectionKind, deviceId: string): string {
  return `connected.projection.${kind}.${deviceId}.sequence`;
}

export async function nextProjectionSequence(kind: ProjectionKind, deviceId: string): Promise<number> {
  const key = projectionSequenceKey(kind, deviceId);
  return db.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({ where: { key } });
    const current = Number(existing?.value ?? "0");
    if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
      throw new Error("Connected projection sequence authority is invalid");
    }
    const next = current + 1;
    await tx.setting.upsert({
      where: { key },
      create: { key, value: String(next) },
      update: { value: String(next) },
    });
    return next;
  });
}

/** The enrolled device of this member, or a throw. Shared by every projection kind. */
export async function resolveRemoteDevice(
  client: ConnectedPlatformClient,
  actorContext: TrustedActorContext,
  deviceId: string,
): Promise<RemoteDevice> {
  if (!DEVICE_ID.test(deviceId)) throw new TypeError("Remote device id is invalid");
  if (actorContext.actor.kind !== "person") {
    throw new Error("Connected platform requires durable person authority");
  }
  const devices = await client.listDevices(actorContext.shop.workspaceId);
  const device = devices.devices
    .map(parseRemoteDevice)
    .find((candidate): candidate is RemoteDevice => candidate?.deviceId === deviceId);
  if (!device) throw new Error("Remote device is not enrolled or has been revoked");
  if (device.memberId !== actorContext.actor.workspaceMemberId) {
    throw new Error("Remote device belongs to another member authority");
  }
  return device;
}

/** The sealer never cuts a payload: above SEAL_HARD_LIMIT it throws. Returns the size in bytes. */
export function assertSealable(payload: unknown): number {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > SEAL_HARD_LIMIT) {
    throw new Error(`Connected projection is too large to seal (${bytes} bytes)`);
  }
  return bytes;
}

/** Seals one projection to the phone key, PUTs it and checks the acknowledged sequence. */
export async function sealAndPutProjection(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  actorContext: TrustedActorContext;
  device: RemoteDevice;
  kind: ProjectionKind;
  payload: unknown;
  sequence: number;
  issuedAt: Date;
  expiresAt: Date;
}>): Promise<void> {
  assertSealable(input.payload);
  const { device, actorContext } = input;
  const envelopeId = `projection_${randomUUID().replace(/-/g, "")}`;
  const envelope = createConnectedEnvelope(
    {
      protocolVersion: CONNECTED_PROTOCOL_VERSION,
      envelopeId,
      idempotencyKey: envelopeId,
      workspaceId: actorContext.shop.workspaceId,
      shopId: actorContext.shop.shopId,
      memberId: device.memberId,
      deviceId: device.deviceId,
      installationId: actorContext.shop.installationId,
      senderKind: "desktop",
      senderId: actorContext.shop.installationId,
      recipientKind: "device",
      recipientId: device.deviceId,
      messageType: projectionMessageType(input.kind),
      sequence: input.sequence,
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: input.expiresAt.toISOString(),
      revocationEpoch: device.revocationEpoch,
      cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
      encryptionKeyId: "device-rsa-oaep-v1",
      signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
      signingKeyId: "desktop-ed25519-v1",
    },
    input.payload,
    device.encryptionPublicKey,
    input.desktopKeys.signingPrivateKeyPkcs8,
  );
  const stored = await input.client.putProjection(envelope);
  if (stored.status !== "stored" || stored.sequence !== input.sequence) {
    throw new Error("Connected projection was not acknowledged at the expected sequence");
  }
}

export async function publishRemoteDashboardProjection(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  actorContext: TrustedActorContext;
  deviceId: string;
  now?: Date;
}>): Promise<Readonly<{ sequence: number }>> {
  const device = await resolveRemoteDevice(input.client, input.actorContext, input.deviceId);
  // resolveRemoteDevice proved this is a person; the type system cannot see across the call, so narrow again here.
  const actor = input.actorContext.actor;
  if (actor.kind !== "person") throw new Error("Connected platform requires durable person authority");

  const fieldAccess = resolveDashboardFieldAccess(input.actorContext);
  const [stats, recentOrders, analytics, todayCounts] = await Promise.all([
    getDashboardStats(fieldAccess),
    fieldAccess.orders ? getRecentOrders(8, fieldAccess) : Promise.resolve([]),
    getDashboardAnalytics(fieldAccess),
    // A number this member may not see is never queried (same gates as the projection).
    readPhoneTodayCounts({
      want: {
        ordersWaiting: fieldAccess.orders,
        whatsappHeld: fieldAccess.conversations,
        codToCollectDzd: fieldAccess.orderFinancials,
      },
    }),
  ]);
  const projection = projectDashboardForTrustedActor(
    { stats, recentOrders, analytics, todayCounts },
    fieldAccess,
  );
  const sequence = await nextProjectionSequence("dashboard", device.deviceId);
  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + PROJECTION_TTL_MS);
  const actorPermissions = actor.permissions ?? getPhase2PresetPermissions(actor.role);
  const allowedCommands = remoteCommandTypesForPermissions(actorPermissions);
  const policy = await input.client.putCommandPolicy({
    workspaceId: input.actorContext.shop.workspaceId,
    shopId: input.actorContext.shop.shopId,
    memberId: device.memberId,
    deviceId: device.deviceId,
    policyVersion: actor.policyVersion,
    memberRevocationEpoch: actor.revocationEpoch,
    deviceRevocationEpoch: device.revocationEpoch,
    allowedCommands: [...allowedCommands],
    expiresAt: expiresAt.toISOString(),
  });
  if (policy.status !== "stored" || policy.policyVersion !== actor.policyVersion) {
    throw new Error("Connected command authorization was not acknowledged");
  }
  const projectionPayload = {
    ...projection,
    connectedCommandAuthority: {
      policyVersion: actor.policyVersion,
      memberRevocationEpoch: actor.revocationEpoch,
      allowedCommands,
      expiresAt: expiresAt.toISOString(),
    },
  };
  await sealAndPutProjection({
    client: input.client,
    desktopKeys: input.desktopKeys,
    actorContext: input.actorContext,
    device,
    kind: "dashboard",
    payload: projectionPayload,
    sequence,
    issuedAt,
    expiresAt,
  });
  return Object.freeze({ sequence });
}
