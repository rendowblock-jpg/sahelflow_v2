/**
 * S03c-09 — the Returns page must not offer a "create return" dialog that can
 * only fail.
 *
 * POST /api/returns refuses every create with 409 GOVERNED_RETURN_REQUIRED (a
 * requested row would not move stock or COD). The old dialog listed legacy
 * delivered orders, collected a reason and an item count, POSTed, and always
 * ended in an error toast. Returns are requested from the order itself (the
 * governed customer-return command on the order page), so the page now sends
 * the seller to the delivered orders instead.
 *
 * Source-level on purpose: it reads the files, so it runs without a browser
 * or a database.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(root, dir))) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const relative = join(dir, entry);
    const stats = statSync(resolve(root, relative));
    if (stats.isDirectory()) out.push(...sourceFiles(relative));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(relative);
    }
  }
  return out;
}

describe("Returns page: no dead-end create dialog (S03c-09)", () => {
  const page = read("src/app/(dashboard)/returns/page.tsx");

  it("does not render the retired create-return dialog", () => {
    expect(page).not.toContain("ReturnFormDialog");
    expect(page).not.toContain("return-form-dialog");
  });

  it("no longer ships the dialog component", () => {
    expect(existsSync(resolve(root, "src/components/returns/return-form-dialog.tsx"))).toBe(
      false,
    );
  });

  it("has no UI code that POSTs to /api/returns (the route refuses every create)", () => {
    const offenders = sourceFiles("src").filter((file) =>
      /fetch\(\s*[`"']\/api\/returns[`"']\s*,\s*\{[\s\S]{0,240}?method:\s*["']POST["']/.test(
        read(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("sends the seller to delivered orders, where the governed return flow lives", () => {
    expect(page).toContain('href="/orders?status=delivered"');
    expect(page).toContain('t("returns.empty.action")');
  });

  it("shows that link to the same people who used to see the create button", () => {
    const gate = page.indexOf("access.create");
    const link = page.indexOf('href="/orders?status=delivered"');
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(link).toBeGreaterThan(gate);
    // The link sits inside the access.create branch of the header actions.
    expect(page.slice(gate, link)).not.toContain("</PageHeader>");
  });

  it("reuses an existing label that is translated in all three locales", () => {
    for (const locale of ["en", "fr", "ar"]) {
      const messages = JSON.parse(read(`src/lib/i18n/locales/${locale}.json`)) as Record<
        string,
        string
      >;
      expect(messages["returns.empty.action"], locale).toBeTruthy();
    }
  });

  it("keeps the API refusal in place: the governed flow stays the only way to request a return", () => {
    const route = read("src/app/api/returns/route.ts");
    expect(route).toContain("GOVERNED_RETURN_REQUIRED");
    expect(route).toContain("409");
  });
});
