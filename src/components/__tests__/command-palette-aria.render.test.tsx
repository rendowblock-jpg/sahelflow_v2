/**
 * @vitest-environment happy-dom
 */
/**
 * The in-place search field (cmdk combobox) must never point at an element
 * that is not in the page. cmdk's input always sets `aria-controls` to its
 * list id and `aria-expanded="true"`, but the list only mounts while the
 * palette is open, so a closed palette left a dangling id (axe
 * `aria-valid-attr-value`, critical, on every desktop screen).
 */
import { render } from "@/test-utils/render";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../command-palette";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));

const ID_ATTRIBUTES = [
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-activedescendant",
  "aria-owns",
] as const;

/** Every id an ARIA attribute inside `root` names that is absent from the document. */
function danglingIds(root: HTMLElement): string[] {
  const missing: string[] = [];
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of ID_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      for (const id of value.split(/\s+/)) {
        if (!document.getElementById(id)) {
          missing.push(`${attribute}="${id}" on <${element.tagName.toLowerCase()}>`);
        }
      }
    }
  }
  return missing;
}

function renderPalette(open: boolean) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  return render(<CommandPalette open={open} onOpenChange={() => undefined} />);
}

describe("CommandPalette ARIA references", () => {
  it("closed: the search field names no element that is missing from the page", () => {
    const { container } = renderPalette(false);
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    expect(input).not.toBeNull();
    expect(danglingIds(container)).toEqual([]);
    expect(input?.getAttribute("aria-expanded")).toBe("false");
    expect(input?.hasAttribute("aria-controls")).toBe(false);
  });

  it("open: the field controls the results list that is on the page", () => {
    const { container } = renderPalette(true);
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    expect(danglingIds(container)).toEqual([]);
    expect(input?.getAttribute("aria-expanded")).toBe("true");
    const listId = input?.getAttribute("aria-controls") ?? "";
    expect(document.getElementById(listId)?.getAttribute("role")).toBe("listbox");
  });

  it("closing again takes the reference away, reopening restores it", () => {
    const { container, rerender } = renderPalette(true);
    const input = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    const listId = input?.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    rerender(<CommandPalette open={false} onOpenChange={() => undefined} />);
    expect(danglingIds(container)).toEqual([]);
    expect(input?.hasAttribute("aria-controls")).toBe(false);
    rerender(<CommandPalette open onOpenChange={() => undefined} />);
    expect(input?.getAttribute("aria-controls")).toBe(listId);
    expect(danglingIds(container)).toEqual([]);
  });
});
