import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("identity authority Windows durability contract", () => {
  it("keeps the exclusive temp-file handle write-capable through fsync", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/identity/control-authority.ts"),
      "utf8",
    );
    const start = source.indexOf("function atomicWrite(");
    const end = source.indexOf("async function delay(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const atomicWrite = source.slice(start, end);
    expect(atomicWrite).toContain(
      'fileDescriptor = openSync(temporary, "wx", 0o600);',
    );
    expect(atomicWrite).toMatch(/writeFileSync\(\s*fileDescriptor,/);
    expect(atomicWrite).toContain("fsyncSync(fileDescriptor);");
    expect(atomicWrite).not.toContain('openSync(temporary, "r")');
  });
});
