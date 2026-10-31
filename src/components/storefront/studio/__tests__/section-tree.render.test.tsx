/**
 * @vitest-environment happy-dom
 */
/** The section list is a real tree: roles, one tab stop, arrow keys. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SectionTree } from "@/components/storefront/studio/section-tree";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

afterEach(() => cleanup());

const sections = createDefaultStorefrontTheme("atlas").builder.composition.sections;

function mount(selected: string | null) {
  const handlers = {
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onReorder: vi.fn(),
    onToggle: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
  };
  const view = render(<SectionTree sections={sections} selected={selected} {...handlers} />);
  const buttons = Array.from(view.container.querySelectorAll<HTMLElement>("[data-section-select]"));
  return { ...view, handlers, buttons };
}

describe("SectionTree as a tree", () => {
  it("exposes a named tree with one treeitem per section and the selected one marked", () => {
    const second = sections[1]?.id ?? null;
    mount(second);
    const tree = screen.getByRole("tree");
    expect(tree.getAttribute("aria-label")).toBe("storefront.studio.sectionsLabel");
    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(sections.length);
    expect(items[1]?.getAttribute("aria-selected")).toBe("true");
    expect(items[0]?.getAttribute("aria-selected")).toBe("false");
  });

  it("has a single tab stop: the selected row (or the first when none)", () => {
    const second = sections[1]?.id ?? null;
    const withSelection = mount(second);
    expect(withSelection.buttons.filter((b) => b.tabIndex === 0)).toEqual([withSelection.buttons[1]]);
    cleanup();
    const noSelection = mount(null);
    expect(noSelection.buttons.filter((b) => b.tabIndex === 0)).toEqual([noSelection.buttons[0]]);
  });

  it("moves focus with ArrowDown, ArrowUp, End and Home", () => {
    const { buttons } = mount(sections[0]?.id ?? null);
    const last = buttons[buttons.length - 1];
    buttons[0]?.focus();
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("keeps Alt+Arrow for reordering: it moves the section, not the focus", () => {
    const { buttons, handlers } = mount(sections[1]?.id ?? null);
    buttons[1]?.focus();
    fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowDown", altKey: true });
    expect(handlers.onMove).toHaveBeenCalledWith(sections[1]?.id, 1);
    expect(document.activeElement).toBe(buttons[1]);
  });
});
