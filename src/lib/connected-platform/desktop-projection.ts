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
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
} from "./protocol";

const PROJECTION_TYPE = "dashboard";
const PROJECTION_TTL_MS = 15 * 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

type RemoteDevice = Readonly<{
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

async function nextProjectionSequence(deviceId: string): Promise<number> {
  const key = `connected.projection.${PROJECTION_TYPE}.${deviceId}.sequence`;
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

export async function publishRemoteDashboardProjection(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  actorContext: TrustedActorContext;
  deviceId: string;
  now?: Date;
}>): Promise<Readonly<{ sequence: number }>> {
  if (!DEVICE_ID.test(input.deviceId)) throw new TypeError("Remote device id is invalid");
  if (input.actorContext.actor.kind !== "person") {
    throw new Error("Connected platform requires durable person authority");
  }

  const devices = await input.client.listDevices(input.actorContext.shop.workspaceId);
  const device = devices.devices
    .map(parseRemoteDevice)
    .find((candidate): candidate is RemoteDevice => candidate?.deviceId === input.deviceId);
  if (!device) throw new Error("Remote device is not enrolled or has been revoked");
  if (device.memberId !== input.actorContext.actor.workspaceMemberId) {
    throw new Error("Remote device belongs to another member authority");
  }

  const fieldAccess = resolveDashboardFieldAccess(input.actorContext);
  const [stats, recentOrders, analytics] = await Promise.all([
    getDashboardStats(fieldAccess),
    fieldAccess.orders ? getRecentOrders(8, fieldAccess) : Promise.resolve([]),
    getDashboardAnalytics(fieldAccess),
  ]);
  const projection = projectDashboardForTrustedActor(
    { stats, recentOrders, analytics },
    fieldAccess,
  );
  const sequence = await nextProjectionSequence(device.deviceId);
  const issuedAt = input.now ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + PROJECTION_TTL_MS);
  const actorPermissions = input.actorContext.actor.permissions ??
    getPhase2PresetPermissions(input.actorContext.actor.role);
  const policy = await input.client.putCommandPolicy({
    workspaceId: input.actorContext.shop.workspaceId,
    shopId: input.actorContext.shop.shopId,
    memberId: device.memberId,
    deviceId: device.deviceId,
    policyVersion: input.actorContext.actor.policyVersion,
    memberRevocationEpoch: input.actorContext.actor.revocationEpoch,
    deviceRevocationEpoch: device.revocationEpoch,
    allowedCommands: [...remoteCommandTypesForPermissions(actorPermissions)],
    expiresAt: expiresAt.toISOString(),
  });
  if (policy.status !== "stored" || policy.policyVersion !== input.actorContext.actor.policyVersion) {
    throw new Error("Connected command authorization was not acknowledged");
  }
  const envelopeId = `projection_${randomUUID().replace(/-/g, "")}`;
  const envelope = createConnectedEnvelope(
    {
      protocolVersion: CONNECTED_PROTOCOL_VERSION,
      envelopeId,
      idempotencyKey: envelopeId,
      workspaceId: input.actorContext.shop.workspaceId,
      shopId: input.actorContext.shop.shopId,
      memberId: device.memberId,
      deviceId: device.deviceId,
      installationId: input.actorContext.shop.installationId,
      senderKind: "desktop",
      senderId: input.actorContext.shop.installationId,
      recipientKind: "device",
      recipientId: device.deviceId,
      messageType: `projection.${PROJECTION_TYPE}`,
      sequence,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revocationEpoch: device.revocationEpoch,
      cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
      encryptionKeyId: "device-rsa-oaep-v1",
      signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
      signingKeyId: "desktop-ed25519-v1",
    },
    projection,
    device.encryptionPublicKey,
    input.desktopKeys.signingPrivateKeyPkcs8,
  );
  const stored = await input.client.putProjection(envelope);
  if (stored.status !== "stored" || stored.sequence !== sequence) {
    throw new Error("Connected projection was not acknowledged at the expected sequence");
  }
  return Object.freeze({ sequence });
}
