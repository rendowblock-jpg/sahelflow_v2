import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(
    /\r\n?/g,
    "\n",
  );
}

describe("installed Windows descendant identity capture", () => {
  it("rejects stale numeric parent PIDs using monotonic creation time", () => {
    const harness = readRepositoryFile(
      "scripts/verify-installed-windows-msi.ps1",
    );
    const ancestry = harness.slice(
      harness.indexOf("function Get-DescendantProcessIdentities"),
      harness.indexOf("function Read-JsonFile"),
    );

    expect(ancestry).toContain("$rootProcess");
    expect(ancestry).toContain("createdAtUtcTicks");
    expect(ancestry).toContain(
      "$childCreatedAtUtcTicks -lt [int64]$parent.createdAtUtcTicks",
    );
    expect(ancestry).toContain("continue");
    expect(ancestry).toContain("identityKey = $identityKey");
    expect(ancestry).toContain("createdAtUtcTicks = $childCreatedAtUtcTicks");

    const stalePidGuard = ancestry.indexOf(
      "$childCreatedAtUtcTicks -lt [int64]$parent.createdAtUtcTicks",
    );
    const descendantAppend = ancestry.indexOf("$descendants +=", stalePidGuard);
    expect(stalePidGuard).toBeGreaterThan(-1);
    expect(descendantAppend).toBeGreaterThan(stalePidGuard);
  });
});
