import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativeUrl: string): string {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

describe("dev reset schema authority", () => {
  it("rebuilds the sandbox from numbered migrations instead of db push", () => {
    const script = read("../dev-reset.ts");

    expect(script).toMatch(
      /\[\s*"x",\s*"prisma",\s*"migrate",\s*"reset",\s*"--force",\s*"--skip-seed",\s*"--skip-generate",\s*\]/s,
    );
    expect(script).not.toMatch(
      /\[\s*"x",\s*"prisma",\s*"db",\s*"push"/s,
    );
  });

  it("keeps canonical SQLite checks in the migration authority", () => {
    const migration = read(
      "../../prisma/migrations/20260728030000_session2_business_truth_contracts/migration.sql",
    );

    expect(migration).toContain(
      "CHECK (\"status\" IN ('processing', 'committed'))",
    );
    expect(migration).toContain('CHECK ("expectedVersion" >= 0)');
    expect(migration).toContain('CHECK ("attemptCount" >= 0)');
    expect(migration).toContain('CHECK ("quantity" > 0)');
    expect(migration).toContain('CHECK ("amount" <> 0)');
    expect(migration).toContain('CHECK ("currency" = \'DZD\')');
  });
});
