import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";

/**
 * R50 (Modal probe b6509a98): the queue search field is 124 px wide inside the
 * list pane. "Search conversations" measured 141 px there, the French phrase is
 * longer still, and the Arabic one showed an ellipsis in the screenshot. The
 * field now shows a short word; the full phrase stays the accessible name.
 */
describe("inbox queue search placeholder", () => {
  it("is a short word in every language and shorter than the accessible name", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      const placeholder = getInboxWorkspaceCopy(locale, "searchPlaceholder");
      const name = getInboxWorkspaceCopy(locale, "searchConversations");
      expect(Array.from(placeholder).length, locale).toBeLessThanOrEqual(16);
      expect(placeholder.length, locale).toBeLessThan(name.length);
    }
  });

  it("the field uses the short word and keeps the full phrase as its label", () => {
    const source = readFileSync(join(process.cwd(), "src/components/inbox/inbox-v3-queue.tsx"), "utf8");
    expect(source).toContain('placeholder={copy("searchPlaceholder")}');
    expect(source).toContain('aria-label={copy("searchConversations")}');
  });
});
