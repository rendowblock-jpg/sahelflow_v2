import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatCompactNumber,
  formatDZD,
  formatDZDBare,
  numberFormatter,
} from "@/lib/utils";

const root = process.cwd();
// The space French puts between thousands (fr-DZ, narrow no-break space). Arabic uses the same one.
const SP = "\u202f";

describe("thousands grouping in the seller app", () => {
  it.each([
    ["ar", 12_500, `12${SP}500 دج`],
    ["fr", 12_500, `12${SP}500 DA`],
    ["en", 12_500, "12,500 DA"],
    ["ar", 1_234_567, `1${SP}234${SP}567 دج`],
    ["fr", 1_234_567, `1${SP}234${SP}567 DA`],
    ["en", 1_234_567, "1,234,567 DA"],
  ] as const)("formatDZD(%s, %d)", (locale, amount, expected) => {
    expect(formatDZD(amount, locale)).toBe(expected);
  });

  it.each([
    ["ar", 12_500, `12${SP}500`],
    ["fr", 12_500, `12${SP}500`],
    ["en", 12_500, "12,500"],
    ["ar", 1_234_567, `1${SP}234${SP}567`],
    ["fr", 1_234_567, `1${SP}234${SP}567`],
    ["en", 1_234_567, "1,234,567"],
  ] as const)("formatDZDBare(%s, %d)", (locale, amount, expected) => {
    expect(formatDZDBare(amount, locale)).toBe(expected);
  });

  it("gives Arabic and French the same text for the same amount, in Western digits", () => {
    expect(formatDZDBare(1_234_567, "ar")).toBe(formatDZDBare(1_234_567, "fr"));
    expect(formatDZDBare(1_234_567, "ar")).toMatch(/^[0-9\u202f]+$/);
  });

  it("changes only the group separator: decimals, percent and compact units stay Arabic", () => {
    expect(numberFormatter("ar-DZ", { maximumFractionDigits: 1 }).format(1234.5)).toBe(`1${SP}234,5`);
    expect(numberFormatter("ar-DZ", { style: "percent" }).format(0.125)).toBe(
      new Intl.NumberFormat("ar-DZ", { style: "percent" }).format(0.125),
    );
    expect(formatCompactNumber(187_600, "ar")).toBe(
      new Intl.NumberFormat("ar-DZ", {
        notation: "compact",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(187_600),
    );
    expect(numberFormatter("en-GB").format(1_234_567)).toBe("1,234,567");
    expect(numberFormatter("fr-DZ").format(1_234_567)).toBe(`1${SP}234${SP}567`);
  });

  it("reports the group part of an Arabic number as that space (formatToParts agrees with format)", () => {
    const parts = numberFormatter("ar-DZ").formatToParts(12_500);
    expect(parts.find((part) => part.type === "group")?.value).toBe(SP);
    expect(parts.map((part) => part.value).join("")).toBe(numberFormatter("ar-DZ").format(12_500));
  });

  it("keeps every seller-facing number on the shared formatter", () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__") continue;
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
          const rel = relative(root, path).replace(/\\/g, "/");
          if (rel === "src/lib/utils.ts") continue;
          if (/new Intl\.NumberFormat\(/.test(readFileSync(path, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(resolve(root, "src"));
    expect(offenders.sort()).toEqual([]);

    for (const [file, call] of [
      ["src/components/ai/ai-message-bubble.tsx", "totalTokens.toLocaleString"],
      ["src/lib/notifications/legacy-operational-feed.ts", "totalPrice.toLocaleString"],
    ] as const) {
      expect(readFileSync(resolve(root, file), "utf8")).not.toContain(call);
    }
  });
});
