import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The logo files are OpenAI's own and must stay unmodified; the copy must exist in ar, fr and en with the factual
// sentences intact and without engineer words.
const root = process.cwd();
const bytes = (path: string) => readFileSync(join(root, path));
const text = (path: string) => bytes(path).toString("utf8");
type Strings = Record<string, string>;
const load = (l: string) => JSON.parse(text(`src/lib/i18n/locales/${l}.json`)) as Strings;
const locales: Record<"ar" | "fr" | "en", Strings> = { ar: load("ar"), fr: load("fr"), en: load("en") };
const KEYS = Object.keys(locales.en).filter((k) => k.startsWith("aiKey.chatgpt."));

describe("ChatGPT logo files", () => {
  it("are byte-identical to the files OpenAI's Sign in with ChatGPT docs load (hashes pinned)", () => {
    const sha = (path: string) => createHash("sha256").update(bytes(path)).digest("hex");
    expect(sha("public/brand/chatgpt/chatgpt-logo-black.svg")).toBe("b8b9aba7ba591f54bf1805f422bc23f32c44ee993643cc378cc77f766061f7a1");
    expect(sha("public/brand/chatgpt/chatgpt-logo-white.svg")).toBe("568ce2e8701934856aaafc0ed1c3d0300f6c2ff384d0ae743dd1dea08570e12c");
  });

  it("travel with a trademark notice that names the source and says there is no endorsement", () => {
    const notice = text("public/brand/chatgpt/NOTICE.md");
    expect(notice).toContain("https://developers.openai.com/assets/siwc/sign-in-buttons/chatgpt-logo-black.svg");
    expect(notice).toContain("https://developers.openai.com/assets/siwc/sign-in-buttons/chatgpt-logo-white.svg");
    expect(notice).toContain("ChatGPT and the ChatGPT logo are trademarks of OpenAI");
    expect(notice).toContain("SahelFlow is not endorsed by OpenAI");
  });

  it("are used by the sign-in button only", () => {
    const users = (readdirSync(join(root, "src"), { recursive: true }) as string[])
      .filter((f) => /\.(tsx?|css)$/.test(f) && !/__tests__|\.test\./.test(f))
      .filter((f) => text(join("src", f)).includes("brand/chatgpt"));
    expect(users.map((f) => f.replaceAll("\\", "/"))).toEqual(["components/settings/chatgpt-plan-card.tsx"]);
  });
});

describe("ChatGPT card copy", () => {
  it("has the same keys in the same order in ar, fr and en, none empty", () => {
    expect(KEYS.length).toBeGreaterThanOrEqual(30);
    for (const l of ["ar", "fr", "en"] as const) {
      expect(Object.keys(locales[l]).filter((k) => k.startsWith("aiKey.chatgpt."))).toEqual(KEYS);
      for (const key of KEYS) expect(locales[l][key]?.trim(), `${l} ${key}`).toBeTruthy();
    }
  });

  it("keeps the facts: disclosure, usage link text, no engineer words, ChatGPT stays in Latin letters", () => {
    expect(locales.en["aiKey.chatgpt.signIn"]).toBe("Continue with ChatGPT");
    expect(locales.en["aiKey.chatgpt.disclosure"]).toBe(
      "Order messages that the offline reader cannot read are sent to OpenAI and use your ChatGPT plan's allowance. SahelFlow never sees your ChatGPT conversations.",
    );
    expect(locales.en["aiKey.chatgpt.welcome"]).toBe(
      "You're using your ChatGPT plan. Eligible requests in SahelFlow use your plan; you can manage usage in ChatGPT settings.",
    );
    expect(locales.en["aiKey.chatgpt.error.notEligible"]).toBe(
      "Your ChatGPT plan cannot be used by apps. SahelFlow needs ChatGPT Go, Plus or Pro. You can use the free Groq key instead.",
    );
    expect(locales.en["aiKey.chatgpt.error.quota"]).toBe("Usage limit reached");
    expect(locales.en["aiKey.chatgpt.manageUsage"]).toBe("Manage usage");
    expect(locales.en["aiKey.chatgpt.error.declined"]).toBe("No problem, nothing was changed.");
    for (const l of ["ar", "fr", "en"] as const) {
      for (const key of ["signIn", "title", "disclosure", "welcome", "manageUsageInChatGpt"]) {
        expect(locales[l][`aiKey.chatgpt.${key}`], `${l} ${key}`).toContain("ChatGPT");
      }
      expect(locales[l]["aiKey.chatgpt.disclosure"]).toContain("OpenAI");
      for (const key of KEYS) expect(locales[l][key], `${l} ${key}`).not.toMatch(/quota|token|oauth|jeton|توكن|كوتا/i);
      // No time or figure for the limit: the provider does not give a reliable one.
      expect(locales[l]["aiKey.chatgpt.error.quota"]).not.toMatch(/\d/);
    }
    expect(locales.ar["aiKey.chatgpt.disclosure"]).toMatch(/[\u0600-\u06FF]/);
  });
});
