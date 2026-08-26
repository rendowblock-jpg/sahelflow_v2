process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import { db, shopContext } from "@/lib/db";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import { processWhatsAppInbound } from "../inbound-processor";
import {
  drainDueWhatsAppMediaFetches,
  reconcileQueuedWhatsAppMediaFetches,
} from "../media-fetch-worker";
import { WHATSAPP_MEDIA_FETCH_EFFECT_TYPE } from "../media-fetch-contract";
import {
  removeWhatsAppMediaRoot,
  whatsAppMediaRoot,
} from "../media-object-store";
import { SidecarRequestError } from "../sidecar-client";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};
let testRoot = "";

function jpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "binary"),
    Buffer.from("private-media-payload", "utf8"),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function mediaResponse(bytes: Buffer): Response {
  const body = new Uint8Array(bytes.length);
  body.set(bytes);
  return new Response(body);
}

function envelope(bytes: Buffer, id = "PROVIDER-INBOUND-MEDIA-1"): WhatsAppInboundEnvelope {
  return {
    spoolId: "d".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt: "2026-08-26T16:00:00.000Z",
    message: {
      key: {
        remoteJid: "213555000333@s.whatsapp.net",
        fromMe: false,
        id,
      },
      message: {
        imageMessage: {
          mimetype: "image/jpeg",
          fileLength: bytes.length,
          width: 320,
          height: 240,
          url: "https://mmg.whatsapp.net/private-provider-media",
          directPath: "/private/provider/direct-path",
          mediaKey: "provider-media-secret-key",
        },
      },
      messageTimestamp: 1_787_759_200,
      pushName: "Media Client",
    },
  };
}

async function clean(): Promise<void> {
  await db.notificationDeliveryAttempt.deleteMany();
  await db.operationalNotification.deleteMany();
  await db.notificationEvent.deleteMany();
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.auditLog.deleteMany();
}

beforeEach(async () => {
  await clean();
  testRoot = mkdtempSync(join(tmpdir(), "sahelflow-media-fetch-"));
  process.env.SF_DATA_DIR = testRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(testRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
});

describe("durable WhatsApp inbound media fetch", () => {
  it("reconciles canonical ingress into an encrypted object without durable provider retrieval secrets", async () => {
    const bytes = jpeg();
    const ingress = await persistWhatsAppInbound(context, envelope(bytes));
    await expect(
      processWhatsAppInbound(context, ingress.ingressEventId),
    ).resolves.toMatchObject({ state: "applied", messageId: ingress.ingressEventId });

    await expect(
      reconcileQueuedWhatsAppMediaFetches(context),
    ).resolves.toBe(1);
    const intent = await db.outboxIntent.findFirstOrThrow({
      where: { effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE },
    });
    expect(intent.effectKey).toBe(`whatsapp-media-fetch:${ingress.ingressEventId}`);
    expect(intent.payloadJson).not.toContain("mmg.whatsapp.net");
    expect(intent.payloadJson).not.toContain("provider/direct-path");
    expect(intent.payloadJson).not.toContain("provider-media-secret-key");

    let transientProviderDescriptorSeen = false;
    await expect(
      drainDueWhatsAppMediaFetches(context, 1, async (message) => {
        const raw = JSON.stringify(message.message);
        transientProviderDescriptorSeen =
          raw.includes("private-provider-media") &&
          raw.includes("provider-media-secret-key");
        const response = mediaResponse(bytes);
        response.headers.set("Content-Type", "application/octet-stream");
        return response;
      }),
    ).resolves.toBe(1);
    expect(transientProviderDescriptorSeen).toBe(true);

    const succeeded = await db.outboxIntent.findUniqueOrThrow({
      where: { id: intent.id },
    });
    expect(succeeded).toMatchObject({
      status: "succeeded",
      outcomeState: "receipt",
      lastErrorCode: null,
      attemptCount: 1,
    });
    expect(succeeded.receiptJson).not.toBeNull();
    expect(succeeded.receiptJson).not.toContain(
      createHash("sha256").update(bytes).digest("hex"),
    );

    const key = await getBusinessEnvelopeKey(context);
    try {
      const receipt = openBusinessPayloadWithKey<{
        objectId: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
      }>(
        succeeded.receiptJson!,
        {
          kind: "outbox-intent-receipt",
          recordKey: succeeded.effectKey,
          recordType: succeeded.effectType,
          commandId: succeeded.commandId,
        },
        key,
      );
      expect(receipt).toMatchObject({
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.length,
        mediaType: "image/jpeg",
      });
      expect(receipt.objectId).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      key.fill(0);
    }

    const objectFiles = readdirSync(whatsAppMediaRoot(context));
    expect(objectFiles).toHaveLength(1);
    const objectBytes = readFileSync(
      join(whatsAppMediaRoot(context), objectFiles[0]!),
    );
    expect(objectBytes.includes(bytes)).toBe(false);
    expect(objectBytes.includes(Buffer.from("private-media-payload"))).toBe(false);

    await expect(reconcileQueuedWhatsAppMediaFetches(context)).resolves.toBe(0);
    await expect(
      drainDueWhatsAppMediaFetches(context, 1, async () => mediaResponse(bytes)),
    ).resolves.toBe(0);
  });

  it("dead-letters a MIME/content mismatch without repeated provider reads", async () => {
    const bytes = jpeg();
    const ingress = await persistWhatsAppInbound(
      context,
      envelope(bytes, "PROVIDER-INBOUND-MEDIA-MISMATCH"),
    );
    await processWhatsAppInbound(context, ingress.ingressEventId);
    await reconcileQueuedWhatsAppMediaFetches(context);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("mismatch"),
    ]);

    await drainDueWhatsAppMediaFetches(
      context,
      1,
      async () => mediaResponse(png),
    );
    await expect(
      db.outboxIntent.findFirstOrThrow({
        where: { effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE },
        select: { status: true, lastErrorCode: true, attemptCount: true },
      }),
    ).resolves.toEqual({
      status: "dead_letter",
      lastErrorCode: "MEDIA_CONTENT_TYPE_MISMATCH",
      attemptCount: 1,
    });
  });

  it("schedules a bounded retry for transient provider/media availability", async () => {
    const bytes = jpeg();
    const ingress = await persistWhatsAppInbound(
      context,
      envelope(bytes, "PROVIDER-INBOUND-MEDIA-RETRY"),
    );
    await processWhatsAppInbound(context, ingress.ingressEventId);
    await reconcileQueuedWhatsAppMediaFetches(context);

    await drainDueWhatsAppMediaFetches(context, 1, async () => {
      throw new SidecarRequestError(
        "media unavailable",
        "WHATSAPP_MEDIA_UNAVAILABLE",
        true,
        false,
        502,
      );
    });
    const intent = await db.outboxIntent.findFirstOrThrow({
      where: { effectType: WHATSAPP_MEDIA_FETCH_EFFECT_TYPE },
      select: {
        status: true,
        lastErrorCode: true,
        nextAttemptAt: true,
        attemptCount: true,
      },
    });
    expect(intent).toMatchObject({
      status: "retrying",
      lastErrorCode: "WHATSAPP_MEDIA_UNAVAILABLE",
      attemptCount: 1,
    });
    expect(intent.nextAttemptAt).not.toBeNull();
  });
});
