import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("entry rail live Algeria map", () => {
  it("replaces the PIN-rail copy with a standalone Algeria live map filling the column", () => {
    const shell = read("src/components/system/entry-shell.tsx");
    const rail = read("src/components/brand/algeria-live-rail.tsx");
    const map = read("src/components/brand/algeria-live-map.tsx");

    expect(shell).toContain("AlgeriaLiveRail");
    expect(shell).toContain('t("entry.liveMap.caption")');
    expect(shell).toContain('className="sr-only"');
    expect(shell).toContain('data-sf-entry-rail="live-map"');
    expect(shell).toContain("bg-[#04070d]");
    expect(shell).not.toContain("IconTile");
    expect(shell).not.toContain("AlgeriaLivePhone");
    expect(rail).toContain('data-algeria-live="rail"');
    expect(rail).toContain("AlgeriaLiveMap");
    expect(rail).not.toContain("aspectRatio");
    expect(map).toContain("animateMotion");
    expect(map).toContain("useReducedMotion");
    expect(map).toContain("ALGERIA_LIVE_ROUTES");
  });

  it("keeps login, setup and join on EntryShell so the PIN rail is shared", () => {
    expect(read("src/app/login/page.tsx")).toContain("<EntryShell");
    expect(read("src/app/setup/page.tsx")).toContain("<EntryShell");
    expect(read("src/app/join/page.tsx")).toContain("<EntryShell");
  });
});
