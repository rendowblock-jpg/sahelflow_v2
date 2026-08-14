import "server-only";

import { z } from "zod";
import { executeInternalComment } from "@/lib/collaboration/comments";
import type { ServiceContext } from "@/lib/data/service-base";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { trustedActorForRemoteCommand } from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { ConnectedPlatformClient } from "./client";
import { isRemoteCommandType } from "./command-policy";
import { createConnectedEnvelope, openConnectedEnvelope } from "./envelope";
import type { ConnectedKeyPair } from "./payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  isConnectedEnvelope,
  type ConnectedEnvelope,
} from "./protocol";

const commentPayload = z.object({
  entityType: z.enum(["conversation", "order", "confirmation"]),
  entityId: z.string().trim().min(1).max(256),
  body: z.string().trim().min(1).max(4000),
  mentionMemberIds: z.array(z.string().regex(/^[0-9a-f]{32}$/i)).max(10).default([]),
  expectedVersion: z.number().int().nonnegative().safe(),
}).strict();

type RemoteDevice = Readonly<{
  deviceId: string;
  memberId: string;
  signingPublicKey: string;
  encryptionPublicKey: string;
  revocationEpoch: number;
}>;

function deviceRow(value: unknown): RemoteDevice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const candidate = {
    deviceId: String(row.device_id ?? ""),
    memberId: String(row.member_id ?? ""),
    signingPublicKey: String(row.signing_public_key ?? ""),
    encryptionPublicKey: String(row.encryption_public_key ?? ""),
    revocationEpoch: Number(row.revocation_epoch),
  };
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(candidate.deviceId) &&
    /^[0-9a-f]{32}$/i.test(candidate.memberId) &&
    candidate.signingPublicKey.length >= 32 &&
    candidate.encryptionPublicKey.length >= 32 &&
    Number.isSafeInteger(candidate.revocationEpoch) && candidate.revocationEpoch >= 0
    ? Object.freeze(candidate)
    : null;
}

async function executeComment(
  context: ServiceContext & { shop: ShopContext },
  envelope: ConnectedEnvelope,
  device: RemoteDevice,
  payload: unknown,
) {
  if (!isConnectedEnvelope(envelope) || envelope.messageType !== "command.comments.write") {
    throw new SahelFlowError("Remote command is unsupported", "REMOTE_COMMAND_UNSUPPORTED", 400);
  }
  const actorContext = await trustedActorForRemoteCommand(
    envelope.memberId,
    device.deviceId,
    context.shop,
  );
  if (
    actorContext.actor.kind !== "person" ||
    actorContext.actor.policyVersion !== envelope.sequence ||
    actorContext.actor.revocationEpoch !== envelope.revocationEpoch
  ) {
    throw new SahelFlowError("Remote command policy is stale", "REMOTE_POLICY_STALE", 403);
  }
  const data = commentPayload.parse(payload);
  assertTrustedAction(
    actorContext,
    data.entityType === "conversation" ? "conversations.read" : "orders.read",
    { shopId: context.shop.shopId },
  );
  const command = await executeInternalComment(context, actorContext, {
    ...data,
    idempotencyKey: `connected:${envelope.idempotencyKey}`,
    correlationId: envelope.envelopeId,
  });
  return {
    commentId: command.result.commentId,
    aggregateVersion: command.aggregateVersion,
    replayed: command.replayed,
  };
}

export async function executeQueuedRemoteCommands(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  context: ServiceContext;
  after: number;
  limit?: number;
}>): Promise<Readonly<{ completed: number; nextCursor: number }>> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Remote command execution requires active shop authority");
  const context = { ...input.context, shop };
  const [page, deviceList] = await Promise.all([
    input.client.pollCommands(shop.workspaceId, shop.shopId, input.after, input.limit ?? 50),
    input.client.listDevices(shop.workspaceId),
  ]);
  if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < input.after) {
    throw new Error("Remote command cursor is invalid");
  }
  const devices = new Map(
    deviceList.devices.map(deviceRow).filter((value): value is RemoteDevice => value !== null)
      .map((device) => [device.deviceId, device] as const),
  );
  let completed = 0;
  for (const queued of page.commands) {
    if (!isConnectedEnvelope(queued.envelope) || queued.commandId !== queued.envelope.envelopeId) {
      throw new Error("Remote command envelope authority is invalid");
    }
    const envelope = queued.envelope;
    const device = devices.get(envelope.deviceId);
    if (
      !device || device.memberId !== envelope.memberId ||
      envelope.workspaceId !== shop.workspaceId || envelope.shopId !== shop.shopId ||
      envelope.installationId !== shop.installationId || !isRemoteCommandType(envelope.messageType)
    ) throw new Error("Remote command targets unavailable authority");

    let state: "committed" | "rejected" | "conflict" = "committed";
    let result: unknown;
    try {
      const opened = openConnectedEnvelope<unknown>(
        envelope,
        device.signingPublicKey,
        input.desktopKeys.encryptionPrivateKeyPkcs8,
      );
      result = await executeComment(context, opened.envelope, device, opened.payload);
    } catch (error) {
      state = error instanceof SahelFlowError && error.statusCode === 409 ? "conflict" : "rejected";
      result = {
        code: error instanceof SahelFlowError ? error.code : "REMOTE_COMMAND_REJECTED",
      };
    }
    const now = new Date();
    const resultEnvelope = createConnectedEnvelope(
      {
        protocolVersion: CONNECTED_PROTOCOL_VERSION,
        envelopeId: queued.commandId,
        idempotencyKey: envelope.idempotencyKey,
        workspaceId: shop.workspaceId,
        shopId: shop.shopId,
        memberId: envelope.memberId,
        deviceId: envelope.deviceId,
        installationId: shop.installationId,
        senderKind: "desktop",
        senderId: shop.installationId,
        recipientKind: "device",
        recipientId: envelope.deviceId,
        messageType: "command.result",
        sequence: envelope.sequence,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        revocationEpoch: device.revocationEpoch,
        cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
        encryptionKeyId: "device-rsa-oaep-v1",
        signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
        signingKeyId: "desktop-ed25519-v1",
      },
      { state, result },
      device.encryptionPublicKey,
      input.desktopKeys.signingPrivateKeyPkcs8,
    );
    await input.client.completeCommand(queued.commandId, state, resultEnvelope);
    completed += 1;
  }
  return Object.freeze({ completed, nextCursor: page.nextCursor });
}
