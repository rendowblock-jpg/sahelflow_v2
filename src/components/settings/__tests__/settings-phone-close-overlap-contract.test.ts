import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Settings window on a phone (sweep1 class overlap-controls, '/settings [modal]' phone: the
 * "Search settings" input overlapped the dialog Close button by 288 px2).
 * The Close button is absolutely placed at top-4/end-4 and is one control high; the title row that
 * sits above the search must be at least that high, so the search always starts below Close.
 * Layout is class-driven, so the rule is pinned on the source.
 */
const source = readFileSync(path.resolve(__dirname, "../settings-workspace.tsx"), "utf8");
const dialog = readFileSync(path.resolve(__dirname, "../../ui/dialog.tsx"), "utf8");

describe("settings window title row clears the Close button", () => {
  it("the dialog Close button is still a control-height box pinned to the top/end corner", () => {
    expect(dialog).toMatch(/absolute top-4 end-4[^"]*min-h-\(--control-height\)/);
  });

  it("the modal title row is at least one control high and keeps its end free for Close", () => {
    const titleBlock = source.match(/\{inModal \? \(\s*<p\s+className=\{cn\(([\s\S]*?)\)\}\s*>\s*\{copy\("settingsTitle"\)\}/);
    expect(titleBlock, "title paragraph of the modal not found").not.toBeNull();
    const classes = titleBlock![1];
    expect(classes).toContain("min-h-(--control-height)");
    expect(classes).toContain("items-center");
    expect(classes).toMatch(/pe-1[0-9]/);
  });
});
