import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// S09b-12: the skip link existed only in the dashboard shell, so a keyboard or
// screen-reader user on login, setup and join had to tab through the language
// switcher and brand before reaching the form. It reuses the dashboard's
// translated string; no new key is added.

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function keys(locale: string): Record<string, string> {
  return JSON.parse(source(`src/lib/i18n/locales/${locale}.json`)) as Record<string, string>;
}

describe("entry pages skip link", () => {
  const shell = source("src/components/system/entry-shell.tsx");

  it("is the first focusable thing in the entry shell and reuses the existing string", () => {
    const link = shell.indexOf('href="#entry-content"');
    expect(link).toBeGreaterThan(0);
    expect(shell.indexOf('t("common.skipToContent")')).toBeGreaterThan(link);
    expect(link).toBeLessThan(shell.indexOf("{beforeContent}"));
    expect(link).toBeLessThan(shell.indexOf("<EntryLanguageSwitch label"));
    expect(shell).toContain("sr-only focus:not-sr-only");
  });

  it("points at a real, programmatically focusable target in the task column", () => {
    expect(shell).toContain('id="entry-content"');
    expect(shell).toContain("tabIndex={-1}");
    expect(shell.indexOf('id="entry-content"')).toBeGreaterThan(shell.indexOf("<header"));
    expect(shell.indexOf('id="entry-content"')).toBeLessThan(shell.indexOf("<h1 className"));
  });

  it("reaches login, setup and join, which all render through EntryShell", () => {
    for (const page of ["login", "setup", "join"]) {
      expect(source(`src/app/${page}/page.tsx`)).toContain("<EntryShell");
    }
  });

  it("needs no new copy: the string exists, non-empty, in ar, fr and en", () => {
    for (const locale of ["ar", "fr", "en"]) {
      const value = keys(locale)["common.skipToContent"];
      expect(typeof value).toBe("string");
      expect((value ?? "").trim().length).toBeGreaterThan(0);
    }
    const sizes = ["ar", "fr", "en"].map((locale) => Object.keys(keys(locale)).length);
    expect(new Set(sizes).size).toBe(1);
  });

  it("keeps the dashboard skip link", () => {
    expect(source("src/components/layout/dashboard-layout.tsx")).toContain(
      't("common.skipToContent")',
    );
  });
});
