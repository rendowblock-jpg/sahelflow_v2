/**
 * The AI workspace (agents page + action proposal card) must never promise
 * that the assistant sends or changes something by itself: every sentence that
 * names such an act also says the seller reviews / approves first. The scan
 * reads the copy source for ar, fr and en. Keys that are the SELLER's own
 * actions or plain status words are listed on purpose; a new string that names
 * an act without an approval cue fails here and must be reworded.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Loc = "en" | "fr" | "ar";

const ACT: Record<Loc, RegExp> = {
  en: /\b(send|sends|sent|sending|apply|applies|applied|execut\w*|reply|replies|change|changes|update|updates|create|creates|delete|deletes)\b/i,
  fr: /(envoi|envoy|appliqu|exécut|répond|réponse|modifi|chang|mett|créer|crée|supprim)/i,
  ar: /(إرسال|يرسل|ترسل|تنفيذ|ينفذ|تطبيق|يطبق|رد|يرد|تغيير|يغير|إنشاء|حذف|تحديث)/,
};
const CUE: Record<Loc, RegExp> = {
  en: /(approv|review|confirm|propos|authori|never)/i,
  fr: /(approuv|révis|valid|confirm|propos|autoris|examen|vérif|jamais)/i,
  ar: /(وافق|اعتماد|اعتمد|مراجع|تأكيد|اقتراح|مقترح|تفويض|إذن|لن|أبداً|أبدا|تراجع)/,
};
// The seller's own send / edit / retry and status words: they do not say the AI acts alone.
const SELLER_SIDE = new Set([
  "sessionCreateFailed", "feedbackUp", "feedbackDown", "screenshotRemove", "imageRejected", "send",
  "setupUnavailableDescription", "providerDegradedDescription", "invalidMessage", "responseNotPersisted",
  "executing", "streamTimeout", "editMessage", "editingNotice", "cancelEdit", "followUpOrderStatus",
  "recentDecisionsDescription", "shortcutSwitchSessions",
]);

function catalogs(): Record<Loc, Array<[string, string]>> {
  const source = readFileSync(join(process.cwd(), "src/lib/i18n/ai-workspace.ts"), "utf8");
  const starts = (["en", "fr", "ar"] as const)
    .map((loc) => [loc, source.indexOf(`\n  ${loc}: {`)] as const)
    .sort((a, b) => a[1] - b[1]);
  const out: Record<Loc, Array<[string, string]>> = { en: [], fr: [], ar: [] };
  starts.forEach(([loc, from], index) => {
    const to = starts[index + 1]?.[1] ?? source.length;
    const block = source.slice(from, to);
    for (const m of block.matchAll(/^\s+(\w+):\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm)) {
      out[loc].push([m[1] ?? "", m[2] ?? ""]);
    }
  });
  return out;
}

export function actsWithoutApproval(locale: Loc, entries: Array<[string, string]>): string[] {
  return entries
    .filter(([key, text]) => !SELLER_SIDE.has(key) && ACT[locale].test(text) && !CUE[locale].test(text))
    .map(([key, text]) => `${locale}.${key}: ${text}`);
}

describe("AI workspace wording: the seller approves first", () => {
  const all = catalogs();

  it("reads a real catalog for each locale", () => {
    for (const loc of ["en", "fr", "ar"] as const) expect(all[loc].length, loc).toBeGreaterThan(100);
  });

  for (const loc of ["en", "fr", "ar"] as const) {
    it(`${loc}: no sentence names an act of the assistant without saying the seller approves or reviews`, () => {
      expect(actsWithoutApproval(loc, all[loc])).toEqual([]);
    });
    it(`${loc}: the four statements that carry the promise are present and carry the cue`, () => {
      for (const key of ["emptyThreadDescription", "noActionsDescription", "exactApprovalNotice", "launchPendingPrompt"]) {
        const text = all[loc].find(([k]) => k === key)?.[1] ?? "";
        expect(text.length, `${loc}.${key} exists`).toBeGreaterThan(20);
        expect(CUE[loc].test(text), `${loc}.${key} says approve/review`).toBe(true);
      }
    });
  }

  it("the scan itself flags a sentence that promises the assistant acts alone", () => {
    expect(actsWithoutApproval("en", [["x", "The assistant sends the reply to your customer."]])).toHaveLength(1);
    expect(actsWithoutApproval("fr", [["x", "L’assistant envoie la réponse à votre client."]])).toHaveLength(1);
    expect(actsWithoutApproval("ar", [["x", "يقوم المساعد بإرسال الرد إلى عميلك."]])).toHaveLength(1);
    expect(actsWithoutApproval("en", [["x", "The assistant prepares the reply; it is sent only after you approve."]])).toHaveLength(0);
  });
});
