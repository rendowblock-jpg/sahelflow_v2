import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  formatCompactNumber,
  formatDateTime,
  formatDZD,
  formatOperationalAge,
  formatRelative,
  formatTimeOfDay,
  intlLocale,
  isolateLtr,
} from "@/lib/utils";

const root = process.cwd();
const localeSensitiveUiFormatters = new Set([
  "formatCompactNumber",
  "formatDZD",
  "formatDZDBare",
  "formatDZDShort",
  "formatDate",
  "formatDateTime",
  "formatOperationalAge",
  "formatRelative",
]);

function uiSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...uiSourceFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function importedLocaleSensitiveFormatters(sourceFile: ts.SourceFile): Set<string> {
  const imported = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@/lib/utils"
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (localeSensitiveUiFormatters.has(importedName)) {
        imported.add(element.name.text);
      }
    }
  }
  return imported;
}

function missingLocaleFormatterArguments(): string[] {
  const offenders: string[] = [];
  for (const path of [
    ...uiSourceFiles(resolve(root, "src/app")),
    ...uiSourceFiles(resolve(root, "src/components")),
  ]) {
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const importedFormatters = importedLocaleSensitiveFormatters(sourceFile);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        importedFormatters.has(node.expression.text) &&
        node.arguments.length < 2
      ) {
        const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        offenders.push(
          `${relative(root, path).replaceAll("\\", "/")}:${location.line + 1} ${node.expression.text}`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return offenders.sort();
}

/**
 * Every BCP-47 tag literal that is not the canonical map itself.
 *
 * The AST check above only sees calls to formatters imported from
 * `@/lib/utils`. Raw `Intl.DateTimeFormat(...)` / `toLocaleString(...)` calls
 * were invisible to it, and that is exactly the hole a whole cluster of
 * divergence grew in: five private copies of the locale map (two of them
 * resolving French to `fr-FR`, one shadowing the real `intlLocale` name while
 * resolving English to `en-US`), seven surfaces passing a bare `"en"` straight
 * to `Intl`, three hardcoded `en-US` sites, one `toLocaleDateString()` with no
 * locale at all, and several `` `${locale}-DZ` `` tags that produced `en-DZ`.
 * Each rendered a different clock or date order than the rest of the app.
 *
 * `intlLocale` in `src/lib/utils.ts` is the ONE authority. Anything that needs
 * a tag asks it.
 */
const LOCALE_TAG_LITERAL = /["'`](?:ar|fr|en)-(?:DZ|FR|GB|US|CA)["'`]/;

/**
 * Deliberate, reviewed exemptions. Each is a machine-facing or
 * non-display use, not a seller-facing rendering decision.
 */
const LOCALE_TAG_EXEMPT = new Map<string, string>([
  [
    "src/app/api/reports/daily/route.ts",
    "en-CA is the ISO-8601 YYYY-MM-DD trick for building an Algiers day key, not a displayed date.",
  ],
  [
    "src/lib/reports/daily-report.ts",
    "en-CA is the ISO-8601 YYYY-MM-DD trick for building an Algiers day key, not a displayed date.",
  ],
  [
    "src/lib/ai/chat/shop-context.ts",
    "en-GB weekday feeds a model prompt; it is machine-facing, never rendered to the seller.",
  ],
  [
    "src/lib/orders/canonical-commerce-order.ts",
    "toLocaleLowerCase('fr-DZ') is casing for matching, not display.",
  ],
  [
    "src/lib/orders/canonical-file-import.ts",
    "toLocaleLowerCase('fr-DZ') is casing for matching, not display.",
  ],
  [
    "src/lib/orders/canonical-named-items.ts",
    "toLocaleLowerCase('fr-DZ') is casing for matching, not display.",
  ],
]);

function localeTagLiteralOffenders(): string[] {
  const offenders: string[] = [];
  const roots = [
    resolve(root, "src/app"),
    resolve(root, "src/components"),
    resolve(root, "src/hooks"),
    resolve(root, "src/lib"),
  ];
  for (const path of roots.flatMap(uiSourceFiles)) {
    const rel = relative(root, path).replaceAll("\\", "/");
    if (rel === "src/lib/utils.ts") continue; // the authority itself
    if (LOCALE_TAG_EXEMPT.has(rel)) continue;
    const source = readFileSync(path, "utf8");
    source.split("\n").forEach((line, index) => {
      if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
      if (LOCALE_TAG_LITERAL.test(line)) offenders.push(`${rel}:${index + 1}`);
    });
  }
  return offenders.sort();
}

/** `toLocale*` with no locale argument falls back to the HOST machine's locale. */
function hostLocaleFallbackOffenders(): string[] {
  const offenders: string[] = [];
  const roots = [
    resolve(root, "src/app"),
    resolve(root, "src/components"),
    resolve(root, "src/hooks"),
    resolve(root, "src/lib"),
  ];
  for (const path of roots.flatMap(uiSourceFiles)) {
    const rel = relative(root, path).replaceAll("\\", "/");
    const source = readFileSync(path, "utf8");
    source.split("\n").forEach((line, index) => {
      if (/\.toLocale(?:Date|Time)?String\(\s*\)/.test(line)) {
        offenders.push(`${rel}:${index + 1}`);
      }
    });
  }
  return offenders.sort();
}

describe("seller-facing locale formatting", () => {
  it("uses the Algeria-aware locale map consistently", () => {
    expect(intlLocale("ar")).toBe("ar-DZ");
    expect(intlLocale("fr")).toBe("fr-DZ");
    expect(intlLocale("en")).toBe("en-GB");
  });

  it("uses the platform's Algerian Arabic number conventions with the local DZD suffix", () => {
    const expectedNumber = new Intl.NumberFormat("ar-DZ", {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(1_893_500);

    expect(formatDZD(1_893_500, "ar")).toBe(`${expectedNumber} دج`);
  });

  it("keeps Arabic compact chart units and signed values inside an explicit LTR technical isolate", () => {
    const compact = formatCompactNumber(187_600, "ar");
    const negative = formatCompactNumber(-50_000, "ar");

    expect(compact).toContain("ألف");
    expect(negative).toContain("ألف");
    expect(isolateLtr(compact)).toBe(`\u2066${compact}\u2069`);
    expect(isolateLtr(negative)).toBe(`\u2066${negative}\u2069`);
  });

  it("delegates relative-time grammar to Intl instead of concatenating translated fragments", () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const thirtyMinutesAgo = new Date("2026-08-14T11:30:00.000Z");

    for (const [locale, localeTag] of [
      ["ar", "ar-DZ"],
      ["fr", "fr-DZ"],
      ["en", "en-GB"],
    ] as const) {
      const expected = new Intl.RelativeTimeFormat(localeTag, {
        numeric: "auto",
        style: "long",
      }).format(-30, "minute");
      expect(formatRelative(thirtyMinutesAgo, locale, now)).toBe(expected);
    }
  });

  it("promotes long operational ages instead of accumulating raw hours", () => {
    expect(formatOperationalAge(47, "en")).toBe("47 mins");
    expect(formatOperationalAge(135, "en")).toBe("2 hrs 15 mins");
    expect(formatOperationalAge(3_180, "en")).toBe("2 days 5 hrs");
    expect(formatOperationalAge(80_947, "en")).toBe("8 wks");

    const arabicLongAge = formatOperationalAge(80_947, "ar");
    expect(arabicLongAge).toContain("أسابيع");
    expect(arabicLongAge).not.toMatch(/\d+h|\d+m/);
  });

  it("requires explicit locale adoption on every seller-facing formatter call", () => {
    const offenders = missingLocaleFormatterArguments();
    expect(
      offenders,
      `Missing explicit locale arguments:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
  it("keeps ONE locale-tag authority — no private copies of the map", () => {
    const offenders = localeTagLiteralOffenders();
    expect(
      offenders,
      "Raw BCP-47 tags outside src/lib/utils.ts. Call `intlLocale(locale)` " +
        "instead, or add a reviewed entry to LOCALE_TAG_EXEMPT explaining why " +
        `the use is machine-facing:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("never falls back to the host machine's locale", () => {
    const offenders = hostLocaleFallbackOffenders();
    expect(
      offenders,
      "`toLocale*String()` with no argument renders in the HOST locale, not " +
        `the seller's. Pass \`intlLocale(locale)\`:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("renders every seller-facing clock on Algeria's 24-hour convention", () => {
    // CLDR disagrees with itself across our map: ar-DZ and fr-DZ carry a
    // 12-hour pattern, en-GB a 24-hour one. DZ_CLOCK pins all three.
    for (const locale of ["ar", "fr", "en"] as const) {
      const rendered = formatDateTime("2026-03-09T14:05:00.000Z", locale);
      expect(rendered, `${locale} formatDateTime`).toContain("14:05");
      expect(rendered).not.toMatch(/AM|PM|ص|م\b/);
      expect(formatTimeOfDay("2026-03-09T14:05:00.000Z", locale)).toBe("14:05");
    }
  });
});
