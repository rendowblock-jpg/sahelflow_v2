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
    const css = read("src/components/brand/algeria-live-map.module.css");

    expect(shell).toContain("AlgeriaLiveRail");
    expect(shell).toContain('t("entry.liveMap.caption")');
    expect(shell).toContain('className="sr-only"');
    expect(shell).toContain('data-sf-entry-rail="live-map"');
    // The rail follows the active theme and colour preset instead of forcing
    // a fixed night canvas.
    expect(shell).toContain("bg-surface-1");
    expect(shell).toContain("var(--primary)");
    expect(shell).not.toContain("bg-[#04070d]");
    expect(shell).not.toContain("IconTile");
    expect(shell).not.toContain("AlgeriaLivePhone");
    expect(rail).toContain('data-algeria-live="rail"');
    expect(rail).toContain("AlgeriaLiveMap");
    expect(rail).not.toContain("aspectRatio");
    // One frame loop drives every flight (it replaced per-parcel SMIL
    // animateMotion, whose timers drifted out of sync with the drawn arcs).
    expect(map).toContain("requestAnimationFrame");
    expect(map).toContain("cancelAnimationFrame");
    expect(map).not.toContain("animateMotion");
    expect(map).toContain("useReducedMotion");
    expect(map).toContain("ALGERIA_LIVE_ROUTES");
    expect(map).toContain("MAX_IN_FLIGHT");
    // Every flight colour is a theme token, so presets recolour the map.
    expect(css).toContain("var(--primary)");
    expect(css).toContain("var(--success)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("keeps login, setup and join on EntryShell so the PIN rail is shared", () => {
    expect(read("src/app/login/page.tsx")).toContain("<EntryShell");
    expect(read("src/app/setup/page.tsx")).toContain("<EntryShell");
    expect(read("src/app/join/page.tsx")).toContain("<EntryShell");
  });
});
