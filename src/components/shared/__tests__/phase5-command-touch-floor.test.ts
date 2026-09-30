import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 command touch floor", () => {
  it("keeps the command entry and portaled results on the coarse-pointer authority", () => {
    const command = read("src/components/ui/command.tsx");
    // The top-bar trigger became the in-place search field itself.
    const palette = read("src/components/command-palette.tsx");

    expect(command).toContain(
      "relative flex min-h-(--sf-touch-target) cursor-default items-center",
    );
    expect(palette).toContain("flex h-8 min-h-(--sf-touch-target) items-center");
    expect(palette).toContain("relative mx-auto min-w-0 max-w-xl flex-1");
  });
});
