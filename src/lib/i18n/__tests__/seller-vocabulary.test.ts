import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sellers read this copy. Engineering vocabulary from the order, money and
 * provider kernels ("governed", "canonical authority", "durable outbox",
 * "sidecar") is meaningless to them, so it must never appear in a sentence
 * the interface renders. Identifiers and code comments are not copy and are
 * not scanned: only quoted strings that contain a space.
 */
const root = process.cwd();
const BANNED_EN = /\b(governed|canonical|authority|authorities|durable|durably|sidecar|outbox|endpoint|entitlement|atomically|committed)\b/i;
const BANNED_FR = /(gouvern[ée]|canonique|autorité|durable|outbox|endpoint|atomiquement|droit signé)/i;
const BANNED_AR = /(محكوم|الموثوقة|سلطة|ذرية|الاستحقاق)/;

const COPY_SOURCES = [
  ...readdirSync(resolve(root, "src/lib/i18n"))
    .filter((name) => name.endsWith(".ts") && name !== "translate-server-error.ts")
    .map((name) => `src/lib/i18n/${name}`),
  "src/components/orders/canonical-cod-actions.tsx",
  "src/components/orders/canonical-customer-return-ui.ts",
  "src/components/orders/canonical-order-recovery-actions.tsx",
  "src/components/orders/canonical-courier-actions.tsx",
  "src/components/orders/reason-code-field.tsx",
  "src/components/settings/backup-restore-copy.ts",
  "src/components/settings/team-access-authority-panel.tsx",
];

function sentences(source: string): string[] {
  const out: string[] = [];
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import")) continue;
    for (const match of line.matchAll(/"((?:[^"\\]|\\.){6,})"/g)) {
      const text = match[1] ?? "";
      if (text.includes(" ")) out.push(text);
    }
  }
  return out;
}

function offenders(texts: string[]): string[] {
  return texts.filter((text) => BANNED_EN.test(text) || BANNED_FR.test(text) || BANNED_AR.test(text));
}

describe("seller-facing vocabulary", () => {
  it("keeps engineering terms out of every locale catalog", () => {
    for (const locale of ["en", "fr", "ar"]) {
      const catalog = JSON.parse(
        readFileSync(resolve(root, `src/lib/i18n/locales/${locale}.json`), "utf8"),
      ) as Record<string, string>;
      expect(offenders(Object.values(catalog)), locale).toEqual([]);
    }
  });

  it("keeps engineering terms out of inline copy modules", () => {
    for (const path of COPY_SOURCES) {
      const found = offenders(sentences(readFileSync(resolve(root, path), "utf8")));
      expect(found, path).toEqual([]);
    }
  });
});
