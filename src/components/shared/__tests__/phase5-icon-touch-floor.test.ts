import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 icon-button touch floor", () => {
  it("keeps the ordinary icon variant on the independent coarse-pointer floor", () => {
    const button = read("src/components/ui/button.tsx");
    const toggle = read("src/components/theme-toggle.tsx");

    expect(button).toContain(
      "sf-button-size-icon size-[var(--control-height)] min-h-(--sf-touch-target) min-w-(--sf-touch-target)",
    );
    expect(toggle).toContain('size="icon"');
    expect(toggle).toContain('className="h-8 w-8"');
  });
});
