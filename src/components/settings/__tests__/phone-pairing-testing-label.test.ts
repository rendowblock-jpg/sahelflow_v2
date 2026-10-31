// W3b F6b: the desktop pairing card must say "In testing" (and why) wherever the phone link can show. Reads the card as text.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8");
const card = read("src/components/settings/phone-pairing-card.tsx");
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  return a < 0 || b < 0 ? "" : src.slice(a, b);
};

describe("the phone pairing card says it is in testing wherever it shows the link", () => {
  it("has one TestingNote that renders the label and the sentence", () => {
    const note = between(card, "function TestingNote", "\nexport function PhonePairingCard");
    expect(note).toContain('t("phones.testing.label")');
    expect(note).toContain('t("phones.testing.note")');
    expect(note).toContain('data-testid="phone-pairing-testing-label"');
  });

  it("shows it in the card header, always visible", () => {
    expect(between(card, "<CardHeader", "</CardHeader>")).toContain("<TestingNote");
  });

  it("never renders the link without the label coming first in the same component", () => {
    const hits = Array.from(card.matchAll(/\{pairing\.link\}/g));
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      const at = hit.index ?? 0;
      const start = Math.max(card.lastIndexOf("\nfunction ", at), card.lastIndexOf("\nexport function ", at));
      expect(card.slice(start, at)).toContain("<TestingNote");
    }
  });

  it("has the strings in ar, fr and en and the lookup is wired into the runtime chain", async () => {
    const mod = await import("@/lib/i18n/phone-app-testing-runtime");
    expect(mod.getPhoneAppTestingRuntimeTranslation("en", "phones.testing.label")).toBe("In testing");
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const key of ["phones.testing.label", "phones.testing.note"]) {
        expect((mod.getPhoneAppTestingRuntimeTranslation(locale, key) ?? "").length).toBeGreaterThan(5);
      }
    }
    expect(mod.getPhoneAppTestingRuntimeTranslation("en", "phones.testing.note")).toContain("phone-link server is live");
    const chain = read("src/lib/i18n/runtime-translations.ts");
    expect(chain).toContain('import { getPhoneAppTestingRuntimeTranslation } from "@/lib/i18n/phone-app-testing-runtime";');
    expect(chain).toContain("getPhoneAppTestingRuntimeTranslation(locale, key) ??");
  });
});
