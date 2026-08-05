import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd());

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("privacy erase authority", () => {
  it("routes filterless governed deletes through the privileged raw transaction", () => {
    const lifecycle = source("src/lib/privacy/lifecycle.ts");
    const boundary = source(
      "src/lib/maintenance/privacy-erase-transaction.ts",
    );

    expect(lifecycle).toContain(
      "withPrivacyEraseTransaction(async (tx) =>",
    );
    expect(lifecycle).not.toContain("db.$transaction(async (tx) =>");
    expect(boundary).toContain("dbRaw.$transaction(");
  });
});
