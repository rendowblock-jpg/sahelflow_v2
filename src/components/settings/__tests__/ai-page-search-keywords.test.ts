import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { settingsPageMatches } from "../settings-ia";

/** The words the Settings directory search checks for the AI page (read from the page list itself). */
function aiPageKeywords(): string {
  const pages = readFileSync(resolve(process.cwd(), "src/components/settings/settings-pages.tsx"), "utf8");
  const start = pages.indexOf('id: "ai",');
  expect(start).toBeGreaterThan(-1);
  const match = /keywords:\s*"([^"]+)"/.exec(pages.slice(start, start + 600));
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

describe("Settings directory search finds the AI page by every provider a seller can set up", () => {
  it.each(["gemini", "groq", "chatgpt", "openai", "Groq", "ChatGPT"])("typing %s opens the AI page", (word) => {
    expect(settingsPageMatches({ keywords: aiPageKeywords() }, "", word)).toBe(true);
  });

  it("the older words still work", () => {
    for (const word of ["ai", "ia", "clé", "مفتاح", "consent", "agent"]) {
      expect(settingsPageMatches({ keywords: aiPageKeywords() }, "", word)).toBe(true);
    }
  });

  it("a word that is not about AI does not match", () => {
    expect(settingsPageMatches({ keywords: aiPageKeywords() }, "", "imprimante")).toBe(false);
  });
});
