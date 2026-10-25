import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-text contract (same style as the neighbouring settings/onboarding contract tests): the Groq card reuses
// AiKeyPanel through a `provider` prop, Groq comes first in Settings and in onboarding, and all new copy exists in
// ar, fr and en with the factual sentences intact.
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
type Strings = Record<string, string>;
const load = (l: string) => JSON.parse(read(`src/lib/i18n/locales/${l}.json`)) as Strings;
const locales: Record<"ar" | "fr" | "en", Strings> = { ar: load("ar"), fr: load("fr"), en: load("en") };
const NEW_KEYS = Object.keys(locales.en).filter((k) => k.startsWith("aiKey.groq.") || k.startsWith("aiKey.order."));

describe("Groq key card", () => {
  it("is the same AiKeyPanel with a provider prop, not a copy", () => {
    const panel = read("src/components/settings/ai-key-panel.tsx");
    expect(panel).toContain('groq: "/api/secrets/groq-key"');
    expect(panel).toContain('provider = "gemini"');
    expect(panel).toContain("fetch(KEY_ENDPOINTS[provider]");
    expect(panel).not.toMatch(/fetch\("\/api\/secrets\/gemini-key"/);
    expect(panel).toContain('"gsk_..."');
  });

  it("comes before Gemini in Settings and in onboarding step 4", () => {
    for (const file of ["src/components/settings/settings-pages.tsx", "src/components/onboarding/onboarding-wizard.tsx"]) {
      const source = read(file);
      const groq = source.indexOf('provider="groq"');
      const gemini = source.indexOf("<AiKeyPanel", groq + 1);
      expect(groq).toBeGreaterThan(-1);
      expect(gemini).toBeGreaterThan(groq);
    }
    expect(read("src/components/settings/settings-pages.tsx")).toContain("<AiProviderOrderCard canManage={access.aiKey} />");
  });
});

describe("Groq and order copy", () => {
  it("has the same keys in ar, fr and en, none empty", () => {
    expect(NEW_KEYS.length).toBeGreaterThanOrEqual(18);
    for (const l of ["ar", "fr"] as const) {
      for (const key of NEW_KEYS) expect(locales[l][key], `${l} ${key}`).toBeTruthy();
    }
    for (const l of ["ar", "fr", "en"] as const) {
      expect(Object.keys(locales[l]).filter((k) => k.startsWith("aiKey.groq.") || k.startsWith("aiKey.order."))).toEqual(NEW_KEYS);
    }
  });

  it("keeps the disclosure and the limits sentence factual, in every language", () => {
    expect(locales.en["aiKey.groq.disclosure"]).toBe(
      "Order messages that the offline reader cannot read are sent to Groq (servers in the United States). Groq says it does not keep requests by default, and may keep them up to 30 days to fix errors or stop abuse.",
    );
    for (const l of ["ar", "fr", "en"] as const) {
      expect(locales[l]["aiKey.groq.disclosure"]).toContain("30");
      expect(locales[l]["aiKey.groq.disclosure"]).toContain("Groq");
      // No quota figure that Groq can change.
      expect(locales[l]["aiKey.groq.limits"]).not.toMatch(/\d/);
      // Honesty: the chat assistant still needs Gemini.
      expect(locales[l]["aiKey.groq.assistantNote"]).toContain("Gemini");
    }
    expect(locales.ar["aiKey.groq.disclosure"]).toMatch(/[\u0600-\u06FF]/);
  });

  it("offers the two orders in plain words", () => {
    expect(locales.en["aiKey.order.groqFirst"]).toBe("Groq first (recommended: fast and free)");
    expect(locales.en["aiKey.order.geminiFirst"]).toBe("Gemini first");
  });
});
