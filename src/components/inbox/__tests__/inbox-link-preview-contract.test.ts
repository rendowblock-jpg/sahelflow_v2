import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Ledger INB-16 — inbox link previews: server-side metadata fetch with SSRF
 * discipline, viewport-gated client, honest absence on failure, and zero
 * fabricated content in the card.
 */
describe("inbox link preview surface (INB-16)", () => {
  it("fetches metadata server-side only, through a bounded guarded route", () => {
    const route = source("src/app/api/inbox/link-preview/route.ts");
    const lib = source("src/lib/inbox/link-preview.ts");

    expect(route).toContain('requireTrustedAction("conversations.read")');
    expect(route).toContain("url: z.string().min(1).max(2048)");
    expect(route).toContain("getLinkPreview");
    // SSRF discipline in the server lib.
    expect(lib).toContain("isBlockedLiteralHost");
    expect(lib).toContain("isBlockedIPv4");
    expect(lib).toContain('redirect: "manual"');
    expect(lib).toContain("MAX_REDIRECT_HOPS");
    expect(lib).toContain("MAX_HTML_BYTES");
    expect(lib).toContain("PREVIEW_TIMEOUT_MS");
    expect(lib).toContain("import \"server-only\"");
    // Honest absence: no fabricated fallback metadata.
    expect(lib).toContain("if (!title && !description) return null;");
  });

  it("renders the card client-side only after real metadata arrives", () => {
    const card = source("src/components/inbox/link-preview-card.tsx");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(card).toContain("IntersectionObserver");
    expect(card).toContain('"/api/inbox/link-preview"');
    expect(card).toContain('target="_blank"');
    expect(card).toContain('rel="noopener noreferrer nofollow"');
    expect(card).toContain('data-inbox-link-preview="true"');
    expect(card).not.toContain("dangerouslySetInnerHTML");
    // At most one preview per bubble, text bubbles only.
    expect(thread).toContain("!media && linkUrl");
    expect(thread).toContain("firstHttpUrlInText");
    expect(thread).toContain("<InboxLinkPreview");
    expect(thread).toContain('copy("linkPreviewLabel")');
  });

  it("ships the link preview label in en/fr/ar", () => {
    expect(getInboxWorkspaceCopy("en", "linkPreviewLabel")).toBe(
      "Link preview",
    );
    expect(getInboxWorkspaceCopy("fr", "linkPreviewLabel")).toBe(
      "Aperçu du lien",
    );
    expect(getInboxWorkspaceCopy("ar", "linkPreviewLabel")).toBe(
      "معاينة الرابط",
    );
  });
});
