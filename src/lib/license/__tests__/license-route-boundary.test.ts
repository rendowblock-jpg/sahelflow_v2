import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src", "app", "api");
const unwrappedControlRoutes = [
  /^auth[\\/]login[\\/]route\.ts$/,
  /^auth[\\/]status[\\/]route\.ts$/,
  /^health[\\/]route\.ts$/,
  /^internal[\\/]runtime-bootstrap[\\/]route\.ts$/,
  /^internal[\\/]runtime-bootstrap[\\/]confirm[\\/]route\.ts$/,
  /^internal[\\/]runtime-(?:ready|shutdown|ui-ready)[\\/]route\.ts$/,
] as const;

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("global production license lockout", () => {
  it("routes every operational API through the fail-closed entitlement boundary", () => {
    const bypasses = routeFiles(apiRoot)
      .map((path) => ({ path, relativePath: relative(apiRoot, path) }))
      .filter(
        ({ relativePath }) =>
          !unwrappedControlRoutes.some((pattern) => pattern.test(relativePath)),
      )
      .filter(({ path }) => !readFileSync(path, "utf8").includes("withErrorHandler"))
      .map(({ relativePath }) => relativePath);

    expect(bypasses).toEqual([]);
  });

  it("keeps the shared API boundary wired to installation license authority", () => {
    const boundary = readFileSync(
      join(process.cwd(), "src", "lib", "api", "with-error-handler.ts"),
      "utf8",
    );
    const licenseAllowlist = boundary.match(
      /const LICENSE_LOCKOUT_ALLOWLIST = \[[\s\S]*?\] as const;/,
    )?.[0];
    expect(boundary).toContain("requireLicenseEntitlement");
    expect(licenseAllowlist).toContain("(?:login|logout|reauthenticate|setup|status)");
    expect(licenseAllowlist).not.toContain("/^\\/api\\/auth(?:\\/|$)/");
    expect(boundary).not.toContain("active_license_status");
  });
});
