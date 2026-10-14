/**
 * Avatar → Profile must open the intercepted Settings window over the page
 * the seller is already on. `/profile` is a direct-load alias that renders
 * Settings on a fresh dashboard.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function profileLink(topbar: string): string {
  const labelAt = topbar.indexOf('{t("topbar.profile")}');
  expect(labelAt).toBeGreaterThan(-1);
  const linkAt = topbar.lastIndexOf("<Link", labelAt);
  const linkEnd = topbar.indexOf(">", linkAt);
  return topbar.slice(linkAt, linkEnd);
}

describe("account menu profile route", () => {
  it("targets the intercepted settings route, not /profile", () => {
    const topbar = read("src/components/layout/topbar.tsx");
    const link = profileLink(topbar);

    expect(link).toContain('href="/settings?group=profile"');
    expect(link).not.toContain('href="/profile"');
    expect(topbar).not.toContain('href="/profile"');
    expect(
      existsSync(
        resolve(root, "src/app/(dashboard)/@modal/(.)settings/page.tsx"),
      ),
    ).toBe(true);
  });
});
