import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("installed Windows runtime contract", () => {
  it("hard-disables Next telemetry before hashing the packaged standalone tree", () => {
    const build = read("src-tauri/build-frontend.ts");
    const bootstrap = build.indexOf("SahelFlow desktop runtime bootstrap");
    const disableTelemetry = build.indexOf(
      'process.env.NEXT_TELEMETRY_DISABLED ??= "1"',
    );
    const manifest = build.indexOf("writeStandaloneManifest(standaloneDir");

    expect(bootstrap).toBeGreaterThan(-1);
    expect(disableTelemetry).toBeGreaterThan(bootstrap);
    expect(manifest).toBeGreaterThan(disableTelemetry);
  });

  it("retains a specific non-secret readiness failure beside the shop registry", () => {
    const route = read("src/app/api/internal/runtime-ready/route.ts");

    expect(route).toContain('READINESS_DIAGNOSTIC_FILE = "runtime-readiness-diagnostic.json"');
    expect(route).toContain("recordReadinessFailure(payload)");
    expect(route).toContain('code: "RUNTIME_AUTH_DATABASE_INVALID"');
    expect(route).toContain('code: "RUNTIME_AUTH_MISMATCH"');
    expect(route).toContain('code: "RUNTIME_DATABASE_NOT_READY"');
    expect(route).not.toMatch(/diagnostic\s*=\s*\{[^}]*runtimeToken/s);
    expect(route).not.toMatch(/diagnostic\s*=\s*\{[^}]*authSecret/s);
  });

  it("builds and launches the installed executable twice on an ephemeral Windows runner", () => {
    const workflow = read(".github/workflows/windows-installed-e2e.yml");
    const harness = read("scripts/verify-installed-windows-msi.ps1");

    expect(workflow).toContain("bunx tauri build --bundles msi");
    expect(workflow).toContain("verify-installed-windows-msi.ps1");
    expect(harness).toContain('$env:GITHUB_ACTIONS -cne "true"');
    expect(harness).toContain('"C:\\Program Files\\SahelFlow\\sahelflow.exe"');
    expect(harness).toContain("for ($attempt = 1; $attempt -le 2; $attempt++)");
    expect(harness).toContain("Close-SahelFlowNormally");
    expect(harness).toContain("Second launch did not reuse the verified runtime cache");
  });
});
