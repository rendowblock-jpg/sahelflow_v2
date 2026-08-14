import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  formatDZD,
  formatRelative,
  intlLocale,
} from "@/lib/utils";

const root = process.cwd();
const localeSensitiveUiFormatters = new Set([
  "formatDZD",
  "formatDZDBare",
  "formatDZDShort",
  "formatDate",
  "formatDateTime",
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

  it("requires explicit locale adoption on every seller-facing formatter call", () => {
    const offenders = missingLocaleFormatterArguments();
    expect(
      offenders,
      `Missing explicit locale arguments:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
