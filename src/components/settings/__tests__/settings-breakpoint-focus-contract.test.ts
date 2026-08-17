import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  resolve(process.cwd(), "src/components/settings/settings-workspace.tsx"),
  "utf8",
);

describe("Settings breakpoint focus handoff contract", () => {
  it("commits every breakpoint-owned focus handoff in layout without a deferred frame race", () => {
    expect(workspace).toContain("useLayoutEffect");
    expect(workspace).toContain("breakpointFocusSourceRef");
    expect(workspace).toContain("focusHandoffRevision");
    expect(workspace).toContain("setFocusHandoffRevision");
    expect(workspace).toContain('focusIntentRef.current = "detail"');
    expect(workspace).toContain('focusIntentRef.current = "directory"');
    expect(workspace).not.toContain("requestAnimationFrame");
  });
});
