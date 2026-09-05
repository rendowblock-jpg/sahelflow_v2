import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp Inbox parity source slice", () => {
  it("persists protected drafts and clears them only after a send is accepted", () => {
    const schema = source("prisma/schema.prisma");
    const protectedFields = source("src/lib/crypto/protected-pii.ts");
    const route = source("src/app/api/conversations/[id]/draft/route.ts");
    // INB-27: draft pins live in the drafts hook; send pins in the outbox
    // hook; selection ordering in the thread hook.
    const drafts = source("src/hooks/inbox/use-inbox-drafts.ts");
    const outbox = source("src/hooks/inbox/use-inbox-outbox.ts");
    const thread = source("src/hooks/inbox/use-inbox-thread.ts");

    expect(schema).toContain("draftBody     String?");
    expect(protectedFields).toContain('"draftBody"');
    expect(route).toContain('requireTrustedAction("conversations.reply")');
    expect(route).toContain("const result = await db.$transaction");
    expect(route).toContain("data: { draftRevision: revision }");
    expect(route).toContain("data: { draftBody: normalized || null }");
    expect(route).toContain("draftRevision: { lt: revision }");
    expect(route).toContain("current?.draftRevision === revision");
    expect(route).toContain("data: { draftRevision: promotedRevision }");
    expect(route).toContain("return { applied: true, revision: promotedRevision }");
    expect(drafts).toContain("DRAFT_SAVE_DELAY_MS");
    expect(drafts).toContain("draftReadyConversationRef");
    expect(drafts).toContain("draftWriteQueueRef");
    expect(drafts).toContain("draftRevisionRef");
    expect(drafts).toContain("DRAFT_LOAD_ATTEMPTS");
    expect(drafts).toContain("if (!response || !isCurrentDraft()) return");
    expect(drafts).toContain("if (data.applied === true) return true");
    expect(drafts).toContain("DRAFT_WRITE_ATTEMPTS");
    expect(drafts).toContain("attempt < DRAFT_WRITE_ATTEMPTS");
    // The draft loader never races its own finally-cleanup: no finally inside
    // the loader body (the old slice invariant, re-anchored to the module).
    const draftLoader = drafts.slice(drafts.indexOf("const loadDraft"));
    expect(draftLoader).not.toContain("finally");
    expect(draftLoader.indexOf("await response.json()"))
      .toBeLessThan(draftLoader.indexOf("draftReadyConversationRef.current ="));
    expect(drafts).toContain(
      "draftWriteQueueRef.current.get(chat.conversationId)",
    );
    expect(drafts).toContain('window.addEventListener("pagehide"');
    expect(drafts).toContain(
      'document.addEventListener("visibilitychange"',
    );
    expect(drafts).toContain("keepalive: true");
    const selectChat = thread.indexOf("const selectChat");
    expect(
      thread.indexOf(
        "previousChat?.conversationId === chat.conversationId",
        selectChat,
      ),
    ).toBeLessThan(thread.indexOf("void persistDraft(", selectChat));
    expect(
      thread.indexOf("void persistDraft(", selectChat),
    ).toBeLessThan(thread.indexOf("activeChatRef.current = chat", selectChat));
    const sendReply = outbox.indexOf("const sendReply");
    const clearAcceptedDraft = outbox.indexOf(
      "const clearAcceptedDraft",
      sendReply,
    );
    expect(clearAcceptedDraft).toBeGreaterThan(sendReply);
    expect(
      outbox.indexOf(
        "activeChatRef.current?.conversationId === chat.conversationId",
        clearAcceptedDraft,
      ),
    ).toBeGreaterThan(clearAcceptedDraft);
    expect(outbox.indexOf("clearAcceptedDraft();", sendReply))
      .toBeGreaterThan(outbox.indexOf('fetch("/api/whatsapp/send"'));
  });

  it("marks unread without reducing an existing inbound unread count", () => {
    const route = source("src/app/api/conversations/[id]/unread/route.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const queue = source("src/hooks/inbox/use-inbox-chat-queue.ts");

    expect(route).toContain("where: { id, unreadCount: 0 }");
    expect(route).toContain("data: { unreadCount: { increment: 1 } }");
    expect(thread).toContain('copy("markUnread")');
    expect(thread).toContain("if (updated) onBackToQueue()");
    expect(queue).toContain("explicitUnreadHoldRef");
    expect(queue).toContain("readStateWriteQueueRef");
    expect(queue).toContain("messageLoadGenerationRef.current += 1");
    expect(queue.match(/chatLoadGenerationRef\.current \+= 1/g)?.length)
      .toBeGreaterThanOrEqual(2);
    expect(queue.indexOf("await readStateWriteQueueRef.current"))
      .toBeLessThan(queue.indexOf('/unread`'));
  });

  it("never projects raw attachment ciphertext or provider paths to the Inbox", () => {
    const route = source("src/app/api/conversations/[id]/route.ts");
    const inbound = source("src/lib/whatsapp/inbound-processor.ts");
    const metadata = source("src/lib/whatsapp/message-attachments.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(route).toContain("attachments: undefined");
    expect(route).toContain(
      "projectWhatsAppMessageAttachmentForContactAccess",
    );
    expect(route).toContain("getBusinessEnvelopeKey(context)");
    expect(route).toContain("openWhatsAppMessageAttachmentWithKey");
    expect(route).toContain("attachmentKey?.fill(0)");
    expect(metadata).toContain("Provider URLs, media");
    expect(metadata).not.toContain("source.directPath");
    expect(inbound).toContain("normalizeWhatsAppMessageContent");
    expect(inbound).toContain("extractWhatsAppMessageAttachment(messageContent)");
    expect(source("src/hooks/inbox/use-inbox-transport.ts")).toContain(
      "void loadMessages(activeChat, { background: true })",
    );
    expect(thread).toContain("https://www.openstreetmap.org/");
    expect(thread).toContain('rel="noopener noreferrer"');
  });

  it("keeps authenticated media ranges bounded and pending media live", () => {
    const route = source("src/app/api/inbox/media/[id]/route.ts");
    const statusRoute = source("src/app/api/inbox/media/[id]/status/route.ts");
    const batchStatusRoute = source("src/app/api/inbox/media/status/route.ts");
    const messageRoute = source(
      "src/app/api/whatsapp/chats/[jid]/messages/route.ts",
    );
    const mediaObject = source("src/lib/whatsapp/media-object-provenance.ts");
    const mediaProjection = source(
      "src/lib/whatsapp/media-status-projection.ts",
    );
    const mediaUi = source("src/components/inbox/inbox-media-attachment.tsx");
    const handler = route.slice(route.indexOf("export const GET"));
    const prepareCall = handler.indexOf(
      "const prepared = await prepareInboxWhatsAppMedia",
    );
    const rangeParse = handler.indexOf('parseRange(request.headers.get("range")');
    const openCall = handler.indexOf(
      "const opened = await openPreparedInboxWhatsAppMedia",
    );

    expect(prepareCall).toBeGreaterThanOrEqual(0);
    expect(rangeParse).toBeGreaterThan(prepareCall);
    expect(openCall).toBeGreaterThan(rangeParse);
    expect(mediaObject).toContain("WhatsAppMediaPlaintextRange");
    expect(mediaObject).toContain("const overlapStart = Math.max");
    expect(mediaObject).toContain("const overlapEnd = Math.min");
    expect(mediaObject).toContain("plaintextHash.update(plaintext)");
    expect(mediaObject).toContain("ciphertextHash.update(ciphertext)");

    expect(statusRoute).toContain('requireTrustedAction("conversations.read")');
    expect(statusRoute).toContain('"customers.contact.read"');
    expect(statusRoute).toContain("WHATSAPP_MEDIA_FETCH_EFFECT_TYPE");
    expect(statusRoute).toContain("projectInboxLocalMedia(");
    expect(mediaProjection).toContain(
      "`/api/inbox/media/${encoded}/status`",
    );
    expect(messageRoute).toContain("projectInboxLocalMedia(");

    expect(batchStatusRoute).toContain("MAX_PENDING_MEDIA_BATCH = 200");
    expect(batchStatusRoute).toContain('requireTrustedAction("conversations.read")');
    expect(batchStatusRoute).toContain('"customers.contact.read"');
    expect(batchStatusRoute).toContain("db.message.findMany");
    expect(batchStatusRoute).toContain("db.outboxIntent.findMany");
    expect(batchStatusRoute).toContain("effectKey: { in: effectKeys }");
    expect(batchStatusRoute).toContain("projectInboxLocalMedia(");

    expect(mediaUi).toContain("PENDING_MEDIA_POLL_MS = 3_000");
    expect(mediaUi).toContain("MAX_PENDING_MEDIA_BATCH = 200");
    expect(mediaUi).toContain(
      'PENDING_MEDIA_BATCH_URL = "/api/inbox/media/status"',
    );
    expect(mediaUi).toContain("pendingMediaListeners = new Map");
    expect(mediaUi).toContain("pendingMediaPollTimer");
    expect(mediaUi).toContain("pollPendingMediaBatch");
    expect(mediaUi).toContain("body: JSON.stringify({ messageIds })");
    expect(mediaUi).toContain("subscribePendingMedia");
    expect(mediaUi).not.toContain("fetch(pendingStatusUrl");

    expect(mediaUi).toContain('const response = await fetch(href, { cache: "no-store" })');
    expect(mediaUi).toContain("if (!response.ok) throw new Error");
    expect(mediaUi).toContain("URL.createObjectURL(blob)");
    expect(mediaUi).toContain("const [previewFailed, setPreviewFailed]");
    expect(mediaUi).toContain("const [downloadFailed, setDownloadFailed]");
    expect(mediaUi).toContain("onError={() => setPreviewFailed(true)}");
    expect(mediaUi).toContain("onFailure={() => setDownloadFailed(true)}");
    expect(mediaUi).not.toContain('local.state === "failed" || previewFailed');
    expect(mediaUi).not.toContain("<a ");
  });
});
