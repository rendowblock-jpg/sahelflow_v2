process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { deleteWhatsAppChats } from "../chat-delete";
import { queueWhatsAppDocument } from "../durable-send";
import {
  removeWhatsAppMediaRoot,
  whatsAppMediaRoot,
} from "../media-object-store";
import { normalizeWhatsAppJid } from "../types";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal(
    "chat-delete-test-session",
  ),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};

let mediaTestRoot = "";

async function clean(): Promise<void> {
  await db.whatsAppOutboundEffect.deleteMany();
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
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
  mediaTestRoot = mkdtempSync(join(tmpdir(), "sahelflow-chat-delete-"));
  process.env.SF_DATA_DIR = mediaTestRoot;
});

afterEach(async () => {
  await removeWhatsAppMediaRoot(context).catch(() => undefined);
  rmSync(mediaTestRoot, { recursive: true, force: true });
  delete process.env.SF_DATA_DIR;
  await clean();
  await db.$disconnect();
});

async function seedChat(index: number) {
  const sourceId = normalizeWhatsAppJid(`055500011${index}`);
  const conversation = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: `Chat ${index}`,
      sourceId,
      lastMessageAt: new Date(0),
    },
  });
  const inbound = await db.message.create({
    data: {
      conversationId: conversation.id,
      body: "Inbound question",
      direction: "inbound",
      timestamp: new Date(0),
    },
  });
  const event = await db.providerIngressEvent.create({
    data: {
      id: `evt-${index}`,
      ingressKey: `ingress-key-${index}`,
      provider: "whatsapp",
      environment: "test",
      providerAccountHash: "0".repeat(64),
      eventType: "message",
      sourceId,
      providerEventId: `WAMIDIN${index}000000`,
      payloadJson: "{}",
      payloadHash: "0".repeat(64),
      status: "applied",
      conversationId: conversation.id,
      messageId: inbound.id,
    },
  });
  await db.providerIngressAttempt.create({
    data: {
      id: `att-${index}`,
      ingressEventId: event.id,
      attemptNumber: 1,
      state: "applied",
    },
  });
  const outbound = await db.message.create({
    data: {
      conversationId: conversation.id,
      body: "Outbound reply",
      direction: "outbound",
      timestamp: new Date(1),
      messageType: "text",
    },
  });
  const effect = await db.whatsAppOutboundEffect.create({
    data: {
      effectKey: `wa:ek-${index}`,
      messageId: outbound.id,
      providerMessageId: `WAMIDOUT${index}000000`,
    },
  });
  const command = await db.businessCommand.create({
    data: {
      id: `cmd-${index}`,
      idempotencyKey: effect.effectKey,
      commandType: "whatsapp_message.queue.v1",
      aggregateType: "whatsapp-message",
      aggregateId: outbound.id,
      requestHash: "0".repeat(64),
      actor: "test",
      correlationId: outbound.id,
      expectedVersion: 0,
      committedVersion: 1,
    },
  });
  await db.outboxIntent.create({
    data: {
      id: `intent-${index}`,
      effectKey: effect.effectKey,
      commandId: command.id,
      effectType: "whatsapp.text.send.v1",
      payloadJson: "{}",
      status: "succeeded",
      outcomeState: "receipt",
    },
  });
  return conversation;
}

describe("permanent WhatsApp chat deletion", () => {
  it("removes the chat with messages, effects, ingress history and intents, leaving other chats untouched", async () => {
    const deleted = await seedChat(1);
    const survivor = await seedChat(2);

    const result = await deleteWhatsAppChats(context, [
      deleted.id,
      "does-not-exist",
    ]);

    expect(result.deletedConversationIds).toEqual([deleted.id]);
    expect(result.deletedMessageCount).toBe(2);

    expect(await db.conversation.count()).toBe(1);
    expect(
      (await db.conversation.findMany()).map((entry) => entry.id),
    ).toEqual([survivor.id]);
    // Messages cascade with the conversation.
    expect(await db.message.count()).toBe(2);
    // Outbound effects, ingress events, attempts and outbox intents of the
    // deleted chat are gone; pending sends can never resurrect the chat.
    expect(await db.whatsAppOutboundEffect.count()).toBe(1);
    expect(await db.providerIngressEvent.count()).toBe(1);
    expect(await db.providerIngressAttempt.count()).toBe(1);
    expect(await db.outboxIntent.count()).toBe(1);
    // Append-only business-command audit history survives the deletion —
    // including the deleted chat's own command records.
    expect(await db.businessCommand.count()).toBe(2);

    expect(
      await db.whatsAppOutboundEffect.findFirst({
        where: { effectKey: "wa:ek-2" },
      }),
    ).not.toBeNull();
  });

  it("also removes not-yet-applied inbound events for the chat's source", async () => {
    const chat = await seedChat(3);
    if (!chat.sourceId) throw new Error("seed conversation missing sourceId");
    await db.providerIngressEvent.create({
      data: {
        id: "evt-pending",
        ingressKey: "ingress-key-pending",
        provider: "whatsapp",
        environment: "test",
        providerAccountHash: "0".repeat(64),
        eventType: "message",
        sourceId: chat.sourceId,
        providerEventId: "WAMIDPENDING00001",
        payloadJson: "{}",
        payloadHash: "0".repeat(64),
        status: "received",
      },
    });

    await deleteWhatsAppChats(context, [chat.id]);

    expect(await db.providerIngressEvent.count()).toBe(0);
    expect(await db.conversation.count()).toBe(0);
  });

  it("removes the chat's staged encrypted media objects after the commit", async () => {
    const chat = await seedChat(4);
    if (!chat.sourceId) throw new Error("seed conversation missing sourceId");
    const bytes = Buffer.concat([
      Buffer.from("%PDF-1.4\n", "ascii"),
      Buffer.from("chat-delete media payload\n", "utf8"),
      Buffer.from("%%EOF", "ascii"),
    ]);
    const body = new Response(new Uint8Array(bytes)).body;
    if (!body) throw new Error("ReadableStream unavailable");
    await queueWhatsAppDocument(context, {
      clientMessageId: "99999999-9999-4999-8999-999999999999",
      to: chat.sourceId,
      caption: "Facture",
      fileName: "facture.pdf",
      declaredMime: "application/pdf",
      declaredSize: bytes.length,
      source: body,
    });
    expect(existsSync(whatsAppMediaRoot(context))).toBe(true);

    await deleteWhatsAppChats(context, [chat.id]);

    const remaining = existsSync(whatsAppMediaRoot(context))
      ? readdirSync(whatsAppMediaRoot(context))
      : [];
    expect(remaining).toHaveLength(0);
    expect(await db.conversation.count()).toBe(0);
    expect(await db.message.count()).toBe(0);
  });

  it("ignores non-WhatsApp conversations and empty input", async () => {
    const local = await db.conversation.create({
      data: {
        channel: "local",
        contactName: "Saved history",
        lastMessageAt: new Date(0),
      },
    });

    const empty = await deleteWhatsAppChats(context, []);
    expect(empty.deletedConversationIds).toEqual([]);

    const result = await deleteWhatsAppChats(context, [local.id]);
    expect(result.deletedConversationIds).toEqual([]);
    expect(await db.conversation.count()).toBe(1);
  });
});
