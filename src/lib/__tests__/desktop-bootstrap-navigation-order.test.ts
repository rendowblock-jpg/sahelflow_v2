import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("proves an executable renderer before issuing the loopback navigation", () => {
    const recovery = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const packagedTitle = recovery.indexOf(
      "window.set_title(BOOTSTRAP_WINDOW_TITLE)?;",
    );
    const primeNavigation = recovery.indexOf(
      "window.navigate(renderer_prime_url)?;",
      packagedTitle,
    );
    const visibleStartingDocument = recovery.indexOf(
      "window.show()?;",
      primeNavigation,
    );
    const deferredNavigation = recovery.indexOf(
      "schedule_packaged_navigation(",
      visibleStartingDocument,
    );
    const rendererProbe = recovery.indexOf("fn renderer_is_ready(");
    const callbackProof = recovery.indexOf(
      ".eval_with_callback(",
      rendererProbe,
    );
    const navigationWorker = recovery.indexOf(
      "fn schedule_packaged_navigation(",
      callbackProof,
    );
    const acceptedProof = recovery.indexOf(
      "if renderer_is_ready(&window)",
      navigationWorker,
    );
    const bootstrapNavigation = recovery.indexOf(
      "window.navigate(bootstrap_url)",
      acceptedProof,
    );
    const directNavigation = recovery.indexOf(
      "window.navigate(handoff.bootstrap_url)?;",
    );

    expect(packagedTitle).toBeGreaterThan(-1);
    expect(primeNavigation).toBeGreaterThan(packagedTitle);
    expect(visibleStartingDocument).toBeGreaterThan(primeNavigation);
    expect(deferredNavigation).toBeGreaterThan(visibleStartingDocument);
    expect(rendererProbe).toBeGreaterThan(deferredNavigation);
    expect(callbackProof).toBeGreaterThan(rendererProbe);
    expect(navigationWorker).toBeGreaterThan(callbackProof);
    expect(acceptedProof).toBeGreaterThan(navigationWorker);
    expect(bootstrapNavigation).toBeGreaterThan(acceptedProof);
    expect(directNavigation).toBe(-1);
    expect(recovery).toContain(
      'RENDERER_PRIME_MARKER: &str = "sahelflow-renderer-prime-v1"',
    );
    expect(recovery).toContain(
      "const RENDERER_PRIME_TIMEOUT: Duration = Duration::from_secs(15);",
    );
    expect(recovery).toContain('"SF-RUNTIME-UI-RENDERER-BLOCKED"');
    expect(recovery).not.toContain("BOOTSTRAP_NAVIGATION_DELAY");
  });
});
