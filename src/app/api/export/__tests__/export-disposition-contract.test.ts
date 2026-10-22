import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { attachmentContentDisposition } from "@/lib/import/export-disposition";

// Every export route names its download in the page language and puts that name in a Content-Disposition header. The Arabic
// names are not plain ASCII, and a header value the platform refuses makes the route answer a generic 500 after the rows
// were counted and audited (issue #565). The behaviour of one route is tested in deliveries-route.test.ts; the other five
// need a database, auth and a writer each, so this file checks them where they are the same: it reads each route's SOURCE
// (a source-text test, on purpose), requires that its two headers go through attachmentContentDisposition and that each one
// sits in the branch of its own file type, takes the REAL Arabic, French and English words out of it, and runs those words
// through the helper and the real Headers of this Node. It does NOT run the routes: it cannot see a route that computes the
// name in some other way. Not tested here: the rest of each route.
// The French word is required to be plain lower-case ASCII on purpose: a seller on French must get the same file name as
// before the fix. A French word with an accent would be handled by the helper but would change that name, so it should fail
// here and be decided on purpose.
const exportDirectory = fileURLToPath(new URL("..", import.meta.url));
const ROUTES = readdirSync(exportDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(exportDirectory, entry.name, "route.ts")))
  .map((entry) => entry.name)
  .sort();
// Line endings are normalised so a checkout with CRLF does not fail a layout test.
const ROUTE_TABLE = ROUTES.map((name): [string, string] => [
  name,
  readFileSync(join(exportDirectory, name, "route.ts"), "utf8").replace(/\r\n/g, "\n"),
]);

// const filePrefix = locale === "ar" ? "<arabic>" : locale === "fr" ? "<french>" : "<english>";  (any line breaks)
const PREFIX = /const filePrefix\s*=\s*locale === "ar"\s*\?\s*"([^"]+)"\s*:\s*locale === "fr"\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/;

function platformAccepts(value: string): boolean {
  try {
    new Response("x", { headers: { "Content-Disposition": value } });
    return true;
  } catch {
    return false;
  }
}

function callFor(name: string, extension: string): RegExp {
  return new RegExp(
    `"Content-Disposition": attachmentContentDisposition\\(\\s*\`\\$\\{filePrefix\\}-\\$\\{fileSuffix\\}\\.${extension}\`,\\s*\`${name}-\\$\\{fileSuffix\\}\\.${extension}\`,?\\s*\\)`,
  );
}

describe("the export routes name their downloads safely", () => {
  it("finds the six export routes (a seventh is then covered by the tests below, a missing one is a broken search)", () => {
    for (const name of ["customers", "deliveries", "expenses", "orders", "products", "returns"]) expect(ROUTES, name).toContain(name);
  });

  describe.each(ROUTE_TABLE)("export/%s", (name, source) => {
    it("builds both of its Content-Disposition headers with attachmentContentDisposition, never from a raw template", () => {
      expect(source.match(/"Content-Disposition"/g)).toHaveLength(2);
      expect(source.match(/"Content-Disposition": attachmentContentDisposition\(/g)).toHaveLength(2);
      expect(source).not.toMatch(/attachment; filename=/);
      expect(source).toContain('import { attachmentContentDisposition } from "@/lib/import/export-disposition";');
    });

    // The route answers the spreadsheet first and the CSV second, each with its own Content-Type. Splitting at the
    // Content-Type keys gives [before, the spreadsheet answer, the CSV answer], so a header in the wrong branch is seen.
    it("puts the xlsx header in the spreadsheet answer and the csv header in the CSV answer, each with the route's English fallback", () => {
      const parts = source.split('"Content-Type":');
      expect(parts, "the route should have exactly two Content-Type keys").toHaveLength(3);
      const [, xlsxAnswer = "", csvAnswer = ""] = parts;
      expect(xlsxAnswer).toContain("spreadsheetml.sheet");
      expect(xlsxAnswer).toMatch(callFor(name, "xlsx"));
      expect(xlsxAnswer).not.toContain(".csv");
      expect(csvAnswer).toContain("text/csv");
      expect(csvAnswer).toMatch(callFor(name, "csv"));
      expect(csvAnswer).not.toContain(".xlsx");
    });

    it("has an Arabic, a French and an English word, and the English word is the name of the route", () => {
      const match = PREFIX.exec(source);
      expect(match, "the filePrefix declaration").not.toBeNull();
      const [, arabic, french, english] = match as unknown as [string, string, string, string];
      expect(english).toBe(name);
      expect(french).toMatch(/^[a-z]+$/);
      expect(arabic).toMatch(/[\u0600-\u06FF]/);
    });

    it("builds, for the real words of this route, a header the platform accepts for Arabic and the unchanged plain header for French and English", () => {
      const [, arabic, french, english] = PREFIX.exec(source) as unknown as [string, string, string, string];
      for (const extension of ["csv", "xlsx"]) {
        const date = "2026-10-22";
        const ar = attachmentContentDisposition(`${arabic}-${date}.${extension}`, `${name}-${date}.${extension}`);
        expect(platformAccepts(ar), `${arabic} as ${extension}`).toBe(true);
        expect(ar).toBe(`attachment; filename="${name}-${date}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${arabic}-${date}.${extension}`)}`);
        for (const word of [french, english]) {
          const plain = attachmentContentDisposition(`${word}-${date}.${extension}`, `${name}-${date}.${extension}`);
          expect(plain).toBe(`attachment; filename="${word}-${date}.${extension}"`);
        }
      }
    });
  });
});
