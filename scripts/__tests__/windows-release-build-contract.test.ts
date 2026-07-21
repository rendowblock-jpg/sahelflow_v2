import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("Windows signed release build contract", () => {
  it("uses the canonical Webpack build with a disposable build-only ShopContext", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const frontendBuild = read("src-tauri/build-frontend.ts");

    expect(packageJson.scripts?.build).toContain("next build --webpack");
    expect(packageJson.scripts?.build).not.toContain("--turbopack");
    expect(frontendBuild).toContain('execSync("bun run build"');
    expect(frontendBuild).toContain("prepareDesktopBuildContext()");
    expect(frontendBuild).toContain("...buildContext.env");
    expect(frontendBuild).toMatch(/finally\s*{\s*buildContext\.cleanup\(\);\s*}/);
    expect(frontendBuild).not.toContain(
      "node_modules/next/dist/bin/next build\"",
    );
  });

  it("uses only updater inputs supported by tauri-action v0.6.2", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain("tauri-apps/tauri-action@v0.6.2");
    expect(workflow).toMatch(/^\s*includeUpdaterJson:\s*true\s*$/m);
    expect(workflow).toMatch(/^\s*updaterJsonPreferNsis:\s*false\s*$/m);
    expect(workflow).not.toMatch(/^\s*uploadUpdaterJson:/m);
    expect(workflow).not.toMatch(/^\s*uploadUpdaterSignatures:/m);
    expect(workflow).toContain("*.msi.sig");
    expect(workflow).toContain("latest.json");
  });
});
