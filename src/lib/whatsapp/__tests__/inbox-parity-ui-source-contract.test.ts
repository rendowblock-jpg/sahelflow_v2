import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * #317 conversation-native interaction surface. These pins keep the visible
 * reply/copy/paste/drop/progress affordances and the bounded thumbnail
 * consumption wired to the validated encrypted staging + read authorities.
 */
describe("inbox conversation-native interaction source contract", () => {
  const thread = source("src/components/inbox/inbox-v3-thread.tsx");
  const attachment = source("src/components/inbox/inbox-media-attachment.tsx");
  // INB-27: the durable send path lives in the outbox hook module.
  const hook = source("src/hooks/inbox/use-inbox-outbox.ts");

  it("keeps quoted-reply context on the durable send path", () => {
    expect(thread).toContain("data-inbox-reply-chip=\"true\"");
    expect(thread).toContain("quotedMessageId");
    expect(hook).toContain("quotedMessageId");
    expect(hook).toContain("quotedMessageId: trimmedQuotedId");
    // Ledger INB-28: text send and the one media factory accept the quote.
    // A helper type also names the field, so this pins the two functions.
    expect(hook).toContain("async (quotedMessageId?: string | null)");
    expect(hook).toContain("async (file: File, quotedMessageId?: string | null)");
  });

  it("routes paste and drop ingestion through the validated send paths", () => {
    expect(thread).toContain("onPaste=");
    expect(thread).toContain("onDrop=");
    expect(thread).toContain("ingestSharedFile");
    expect(thread).toContain("void sendImage(file, quotedId)");
    expect(thread).toContain("void sendVideo(file, quotedId)");
    expect(thread).toContain("void sendVoice(file, quotedId)");
    expect(thread).toContain("void sendDocument(file, quotedId)");
  });

  it("keeps safe message copy permission-preserving with a failure state", () => {
    expect(source("src/components/inbox/inbox-thread-message.tsx")).toContain("writeClipboardText");
    expect(source("src/components/inbox/inbox-thread-message.tsx")).toContain("navigator.clipboard?.writeText");
    expect(source("src/components/inbox/inbox-thread-message.tsx")).toContain("messageCopyFailed");
    expect(source("src/components/inbox/inbox-thread-message.tsx")).toContain("messageCopied");
  });

  it("exposes truthful upload progress and pre-effect cancellation only", () => {
    expect(hook).toContain("postFormWithUploadProgress");
    expect(hook).toContain("cancellable: progress < 100");
    expect(hook).toContain('"AbortError"');
    expect(thread).toContain("cancelUpload");
    expect(source("src/components/inbox/inbox-thread-message.tsx")).toContain("uploadProgress");
  });

  it("consumes only the derived bounded thumbnail variant", () => {
    const projection = source("src/lib/whatsapp/media-status-projection.ts");
    expect(attachment).toContain("thumbnailUrl");
    expect(projection).toContain("?variant=thumbnail");
    // The inline image falls back to the authenticated canonical read.
    expect(attachment).toContain("inlineImageSrc = thumbnailUrl ?? readUrl");
  });
});
