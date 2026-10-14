/**
 * Escape in the settings search clears a non-empty query and must not reach
 * Radix Dialog, which listens for Escape on document capture. An empty query
 * is left alone so the dialog can close.
 *
 * There is no component harness that mounts the settings window, so this pins
 * the capture-phase source and the consume decision the listener calls.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  bindSettingsSearchEscape,
  consumeSettingsSearchEscape,
} from "@/components/settings/settings-search-escape";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function searchField(workspaceSource: string): string {
  const marker = 'data-settings-search="true"';
  const at = workspaceSource.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const tagStart = workspaceSource.lastIndexOf("<input", at);
  return workspaceSource.slice(tagStart, at);
}

describe("settings search escape", () => {
  it("listens on capture and stops propagation while the query is set", () => {
    const workspace = read("src/components/settings/settings-workspace.tsx");
    const helper = read("src/components/settings/settings-search-escape.ts");
    const field = searchField(workspace);

    expect(field).toContain("onKeyDownCapture");
    expect(field).toContain("consumeSettingsSearchEscape(event, query,");
    expect(workspace).toContain("bindSettingsSearchEscape(field,");
    expect(helper).toContain(
      'window.addEventListener("keydown", onSearchEscape, { capture: true })',
    );
    expect(helper).toMatch(
      /if \(event\.key !== "Escape" \|\| !query\) return false;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/,
    );
    expect(helper).toContain("if (event.target !== field) return;");
    expect(helper).toContain("consumeSettingsSearchEscape(event, field.value, clear)");
  });

  it("consumes Escape only while the query is non-empty", () => {
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    const clear = vi.fn();
    const event = { key: "Escape", preventDefault, stopPropagation };

    expect(consumeSettingsSearchEscape(event, "shop", clear)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();

    stopPropagation.mockClear();
    preventDefault.mockClear();
    clear.mockClear();

    expect(consumeSettingsSearchEscape(event, "", clear)).toBe(false);
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("stops Escape on window capture before a later document listener", () => {
    const listeners: Array<(event: KeyboardEvent) => void> = [];
    vi.stubGlobal("window", {
      addEventListener(
        _type: string,
        listener: (event: KeyboardEvent) => void,
        options?: { capture?: boolean },
      ) {
        expect(options).toEqual({ capture: true });
        listeners.push(listener);
      },
      removeEventListener(_type: string, listener: (event: KeyboardEvent) => void) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    });

    const field = { value: "shop" } as HTMLInputElement;
    const clear = vi.fn(() => {
      field.value = "";
    });
    const unbind = bindSettingsSearchEscape(field, clear);

    const dispatch = (value: string) => {
      field.value = value;
      let reachedDocument = false;
      const event = {
        key: "Escape",
        target: field,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      for (const listener of listeners) {
        listener(event as unknown as KeyboardEvent);
        if (event.stopPropagation.mock.calls.length > 0) return { reachedDocument, event };
      }
      reachedDocument = true;
      return { reachedDocument, event };
    };

    const typed = dispatch("shop");
    expect(clear).toHaveBeenCalledOnce();
    expect(typed.event.preventDefault).toHaveBeenCalledOnce();
    expect(typed.event.stopPropagation).toHaveBeenCalledOnce();
    expect(typed.reachedDocument).toBe(false);

    const empty = dispatch("");
    expect(clear).toHaveBeenCalledOnce();
    expect(empty.event.stopPropagation).not.toHaveBeenCalled();
    expect(empty.reachedDocument).toBe(true);

    unbind();
    expect(listeners).toHaveLength(0);
  });
});
