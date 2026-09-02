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
  const hook = source("src/hooks/use-inbox-workspace.ts");

  it("keeps quoted-reply context on the durable send path", () => {
    expect(thread).toContain("data-inbox-reply-chip=\"true\"");
    expect(thread).toContain("quotedMessageId");
    expect(hook).toContain("quotedMessageId");
    expect(hook).toContain("quotedMessageId: trimmedQuotedId");
    // All five send entry points accept and forward the quoted target.
    // Ledger INB-28 disposition: the four media senders share ONE factory
    // signature, so the counted occurrences are sendReply + the factory.
    expect(hook.match(/quotedMessageId\?: string \| null/g)?.length).toBe(2);
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
    expect(thread).toContain("writeClipboardText");
    expect(thread).toContain("navigator.clipboard?.writeText");
    expect(thread).toContain("messageCopyFailed");
    expect(thread).toContain("messageCopied");
  });

  it("exposes truthful upload progress and pre-effect cancellation only", () => {
    expect(hook).toContain("postFormWithUploadProgress");
    expect(hook).toContain("cancellable: progress < 100");
    expect(hook).toContain('"AbortError"');
    expect(thread).toContain("cancelUpload");
    expect(thread).toContain("uploadProgress");
  });

  it("consumes only the derived bounded thumbnail variant", () => {
    const projection = source("src/lib/whatsapp/media-status-projection.ts");
    expect(attachment).toContain("thumbnailUrl");
    expect(projection).toContain("?variant=thumbnail");
    // The inline image falls back to the authenticated canonical read.
    expect(attachment).toContain("inlineImageSrc = thumbnailUrl ?? readUrl");
  });
});
