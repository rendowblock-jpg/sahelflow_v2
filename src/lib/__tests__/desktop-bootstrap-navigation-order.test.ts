import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("returns control to WebView2 before issuing the loopback navigation", () => {
    const recovery = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const packagedTitle = recovery.indexOf(
      "window.set_title(BOOTSTRAP_WINDOW_TITLE)?;",
    );
    const visibleStartingDocument = recovery.indexOf(
      "window.show()?;",
      packagedTitle,
    );
    const deferredNavigation = recovery.indexOf(
      "schedule_packaged_navigation(",
      visibleStartingDocument,
    );
    const directNavigation = recovery.indexOf(
      "window.navigate(handoff.bootstrap_url)?;",
    );

    expect(packagedTitle).toBeGreaterThan(-1);
    expect(visibleStartingDocument).toBeGreaterThan(packagedTitle);
    expect(deferredNavigation).toBeGreaterThan(visibleStartingDocument);
    expect(directNavigation).toBe(-1);
    expect(recovery).toContain(
      "const BOOTSTRAP_NAVIGATION_DELAY: Duration = Duration::from_millis(250);",
    );
    expect(recovery).toContain(
      "thread::sleep(BOOTSTRAP_NAVIGATION_DELAY);",
    );
    expect(recovery).toContain("window.navigate(bootstrap_url)");
  });
});
