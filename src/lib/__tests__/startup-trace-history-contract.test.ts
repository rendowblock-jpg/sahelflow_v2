import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// The previous launch's startup trace is kept in startup-trace.prev.json so a
// slow or failed launch can still be read after the next launch starts. The
// Rust unit tests cover the copy; this pins WHERE it is called.
describe("previous startup trace", () => {
  const desktop = read("src-tauri/src/lib.rs");
  const history = read("src-tauri/src/startup_trace_history.rs");

  it("is a module of its own with no Tauri or Windows dependency", () => {
    expect(desktop).toContain("mod startup_trace_history;");
    const code = history.slice(0, history.indexOf("#[cfg(test)]"));
    expect(code).not.toMatch(/\btauri\b/);
    expect(code).not.toContain("windows_sys");
    expect(code).toContain('"startup-trace.json"');
    expect(code).toContain('"startup-trace.prev.json"');
  });

  it("is called once, after this process owns the app and before the new trace is written", () => {
    const calls = desktop.split("startup_trace_history::keep_previous_trace(").length - 1;
    const authority = desktop.indexOf("let process_authority = process_authority::acquire()?");
    const keep = desktop.indexOf("startup_trace_history::keep_previous_trace(");
    const reset = desktop.indexOf("startup_recovery::reset_startup_trace(");
    const firstStage = desktop.indexOf("startup_recovery::record_startup_stage(");

    expect(calls).toBe(1);
    expect(authority).toBeGreaterThan(-1);
    expect(keep).toBeGreaterThan(authority);
    expect(reset).toBeGreaterThan(keep);
    expect(firstStage).toBeGreaterThan(keep);
    // The trace file is started from scratch in exactly one place.
    expect(desktop.split("startup_recovery::reset_startup_trace(").length - 1).toBe(1);
  });

  it("copies through a temporary file and a rename, and only a bounded regular file", () => {
    expect(history).toContain("fs::symlink_metadata(");
    expect(history).toContain("MAX_TRACE_BYTES");
    expect(history).toContain(".take(MAX_TRACE_BYTES + 1)");
    expect(history).toContain("fs::rename(&temporary");
    expect(history).toContain("let _ = copy_trace(app_data_dir);");
  });
});
