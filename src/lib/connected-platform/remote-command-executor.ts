import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import type { ConnectedPlatformClient } from "./client";
import { HANDLERS } from "./command-handlers";
import { commandFailure } from "./command-handlers/failure";
import { isRemoteCommandType } from "./command-policy";
import { COMMAND_EXPIRY_MS, COMMAND_RESULT_TTL_MS } from "./contracts";
import { createConnectedEnvelope, openConnectedEnvelope } from "./envelope";
import type { ConnectedKeyPair } from "./payload-crypto";
import {
  CONNECTED_CIPHER_ALGORITHM,
  CONNECTED_PROTOCOL_VERSION,
  CONNECTED_SIGNATURE_ALGORITHM,
  isConnectedEnvelope,
} from "./protocol";

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

export async function executeQueuedRemoteCommands(input: Readonly<{
  client: ConnectedPlatformClient;
  desktopKeys: ConnectedKeyPair;
  context: ServiceContext;
  after: number;
  limit?: number;
  /** The clock, so a test can step past an expiry. */
  now?: () => Date;
}>): Promise<Readonly<{
  completed: number;
  nextCursor: number;
  /** What the relay said about paired and active phones; drives the poll pace. */
  hint: Readonly<{ pairedDevices?: number; activeDevices?: number }>;
}>> {
  const shop = input.context.shop;
  if (!shop) throw new Error("Remote command execution requires active shop authority");
  const context = { ...input.context, shop };
  const page = await input.client.pollCommands(
    shop.workspaceId,
    shop.shopId,
    input.after,
    input.limit ?? 50,
  );
  if (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < input.after) {
    throw new Error("Remote command cursor is invalid");
  }
  const hint = Object.freeze({
    pairedDevices: page.pairedDevices,
    activeDevices: page.activeDevices,
  });
  // The device list is only needed to open a command; asking for it on every
  // empty poll doubled the traffic for nothing.
  if (page.commands.length === 0) {
    return Object.freeze({ completed: 0, nextCursor: page.nextCursor, hint });
  }
  const deviceList = await input.client.listDevices(shop.workspaceId);
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
    const now = (input.now ?? (() => new Date()))();

    let state: "committed" | "rejected" | "conflict" = "committed";
    let result: unknown;
    // A command that cannot be run is COMPLETED with a code (never thrown): one
    // bad command must not hold the cursor, and with it every command behind it.
    try {
      if (
        !device || device.memberId !== envelope.memberId ||
        envelope.workspaceId !== shop.workspaceId || envelope.shopId !== shop.shopId ||
        envelope.installationId !== shop.installationId
      ) throw new SahelFlowError("Remote command targets unavailable authority", "REMOTE_DEVICE_UNKNOWN", 403);
      if (!isRemoteCommandType(envelope.messageType)) {
        throw new SahelFlowError("Remote command is unsupported", "REMOTE_COMMAND_UNSUPPORTED", 400);
      }
      const expiresAt = Date.parse(envelope.expiresAt);
      if (!(expiresAt > now.getTime())) {
        throw new SahelFlowError("Remote command has expired", "EXPIRED", 410);
      }
      if (expiresAt - Date.parse(envelope.issuedAt) > COMMAND_EXPIRY_MS[envelope.messageType]) {
        throw new SahelFlowError("Remote command lives too long", "EXPIRY_TOO_LONG", 400);
      }
      const opened = openConnectedEnvelope<unknown>(
        envelope,
        device.signingPublicKey,
        input.desktopKeys.encryptionPrivateKeyPkcs8,
        now,
      );
      result = await HANDLERS[envelope.messageType]({
        context,
        envelope: opened.envelope,
        device,
        payload: opened.payload,
      });
    } catch (error) {
      const failed = commandFailure(error);
      state = failed.state;
      result = failed.result;
    }
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
        expiresAt: new Date(now.getTime() + COMMAND_RESULT_TTL_MS).toISOString(),
        revocationEpoch: device?.revocationEpoch ?? 0,
        cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM,
        encryptionKeyId: "device-rsa-oaep-v1",
        signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM,
        signingKeyId: "desktop-ed25519-v1",
      },
      { state, result },
      // A device we do not know has no key to seal to: the result is sealed to this
      // computer itself, so the relay can close the command and the queue moves on.
      device?.encryptionPublicKey ?? input.desktopKeys.encryptionPublicKeyJwk,
      input.desktopKeys.signingPrivateKeyPkcs8,
    );
    await input.client.completeCommand(queued.commandId, state, resultEnvelope);
    completed += 1;
  }
  return Object.freeze({ completed, nextCursor: page.nextCursor, hint });
}
