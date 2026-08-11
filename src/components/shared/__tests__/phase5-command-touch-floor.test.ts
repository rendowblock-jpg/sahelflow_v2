import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 command touch floor", () => {
  it("keeps the command entry and portaled results on the coarse-pointer authority", () => {
    const command = read("src/components/ui/command.tsx");
    const topbar = read("src/components/layout/topbar.tsx");

    expect(command).toContain(
      "relative flex min-h-(--sf-touch-target) cursor-default items-center",
    );
    expect(topbar).toContain(
      "h-8 min-h-(--sf-touch-target) min-w-0 max-w-xl",
    );
  });
});
