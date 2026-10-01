import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { inAppMarkdownHref } from "@/components/ai/markdown/parse-markdown";
import { SETTINGS_PAGE_IDS } from "@/components/settings/settings-ia";
import { aiChatSystemPrompt } from "../locale-context";
import {
  PRODUCT_GUIDES,
  PRODUCT_NAVIGATION,
  productGuideText,
} from "../product-guide";

/** The page file a guide route must resolve to (dynamic segments excluded). */
function pageExists(route: string): boolean {
  const [path] = route.split("?");
  const segments = (path ?? "").split("/").filter(Boolean);
  return existsSync(
    resolve(process.cwd(), "src/app/(dashboard)", ...segments, "page.tsx"),
  );
}

describe("SahelFlow product guide", () => {
  it("has unique ids and real, non-empty steps", () => {
    const ids = PRODUCT_GUIDES.map((guide) => guide.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const guide of PRODUCT_GUIDES) {
      expect(guide.steps.length, guide.id).toBeGreaterThan(0);
    }
  });

  it("only points at pages that exist and that the chat renders as in-app links", () => {
    for (const guide of PRODUCT_GUIDES) {
      expect(pageExists(guide.route), `${guide.id} → ${guide.route}`).toBe(true);
      expect(inAppMarkdownHref(guide.route), guide.route).toBe(guide.route);
      const group = new URL(guide.route, "http://local").searchParams.get("group");
      if (group) expect(SETTINGS_PAGE_IDS, guide.route).toContain(group);
      for (const step of guide.steps) {
        for (const match of step.matchAll(/\((\/[^)\s]+)\)/g)) {
          expect(pageExists(match[1]!), `${guide.id} step path ${match[1]}`).toBe(true);
        }
      }
    }
    for (const entry of PRODUCT_NAVIGATION) {
      for (const match of entry.matchAll(/\((\/[^)\s]+)\)/g)) {
        expect(pageExists(match[1]!), entry).toBe(true);
      }
    }
  });

  it("never carries a phone number the remote redactor would mangle", () => {
    const text = JSON.stringify(PRODUCT_GUIDES);
    expect(text).not.toMatch(/(?:\+?213|0)[567]\d{8}/);
  });

  it("travels whole in every locale's system instruction, as guidance only", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      const prompt = aiChatSystemPrompt(locale);
      expect(prompt).toContain(productGuideText());
      expect(prompt).toContain("never action authority");
      expect(prompt).toContain("Never invent screens");
    }
    // Stays a modest share of the context window on every turn.
    expect(productGuideText().length).toBeLessThan(16_000);
  });
});
