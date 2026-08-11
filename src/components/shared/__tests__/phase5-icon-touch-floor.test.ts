import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 5 touch and UI persistence resilience", () => {
  it("keeps compact and icon buttons on the independent coarse-pointer floor in both dimensions", () => {
    const button = read("src/components/ui/button.tsx");
    const toggle = read("src/components/theme-toggle.tsx");

    expect(button).toContain(
      "sf-button-size-xs h-7 min-h-(--sf-touch-target) min-w-(--sf-touch-target)",
    );
    expect(button).toContain(
      "sf-button-size-sm h-9 min-h-(--sf-touch-target) min-w-(--sf-touch-target)",
    );
    expect(button).toContain(
      "sf-button-size-icon size-[var(--control-height)] min-h-(--sf-touch-target) min-w-(--sf-touch-target)",
    );
    expect(toggle).toContain('size="icon"');
    expect(toggle).not.toContain('className="h-8 w-8"');
  });

  it("keeps locale commits live when persisted UI storage is unwritable", () => {
    const store = read("src/stores/ui-store.ts");
    const localeCommitStart = store.indexOf("setLocale: (locale) => {");
    const localeCommitEnd = store.indexOf("toggleSidebar:", localeCommitStart);
    const localeCommit = store.slice(localeCommitStart, localeCommitEnd);

    expect(store).toContain("const bestEffortUiStorage: StateStorage = {");
    expect(store).toContain("storage: createJSONStorage(() => bestEffortUiStorage)");
    expect(store.match(/catch \{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(localeCommit).toContain("applyDocumentLocale(locale)");
    expect(localeCommit).not.toContain("setLocaleCookie(locale)");
  });
});
