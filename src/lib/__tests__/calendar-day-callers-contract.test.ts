import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Three screens turn a timestamp into the words "yesterday" / "avant-hier" /
 * "2 days ago". Each of them once divided hours by 24 itself, which called a
 * message from two calendar days ago "yesterday" (31 hours is one block of 24
 * hours, but two midnights). They now share one counter of calendar days, and
 * this test keeps a fourth copy of the old arithmetic from coming back.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("screens that say 'yesterday' count calendar days", () => {
  it("the inbox list and the thread header use the shared age formatter", () => {
    for (const path of [
      "src/components/inbox/inbox-v3-queue.tsx",
      "src/components/inbox/inbox-thread-header.tsx",
    ]) {
      const source = read(path);
      expect(source, path).toContain("formatInboxAge");
      expect(source, path).not.toMatch(/hours\s*\/\s*24/);
    }
  });

  it("the storefront card counts calendar days", () => {
    const source = read("src/components/storefront/storefront-card.tsx");
    expect(source).toContain("calendarDayDiff");
    expect(source).not.toMatch(/hours\s*\/\s*24/);
  });

  it("the shared formatter counts calendar days for 'yesterday'", () => {
    const source = read("src/lib/inbox-age.ts");
    expect(source).toContain("calendarDayDiff");
    expect(source).not.toMatch(/hours\s*\/\s*24/);
  });
});
