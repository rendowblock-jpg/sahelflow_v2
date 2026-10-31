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

/**
 * Found by the keyboard-mode accessibility run (open search list, every page): cmdk draws each group as
 * role="presentation", and a presentational element that carries a global ARIA attribute (here aria-description)
 * loses that role, so the listbox then has a child that is not an option or a group (axe aria-required-children,
 * critical). The hint must therefore reach screen readers through the group's heading, not through an attribute
 * on the presentational wrapper.
 */
describe("CommandPalette results list ARIA structure", () => {
  it("open: no presentational element inside the list carries an ARIA attribute", () => {
    const { container } = renderPalette(true);
    const list = container.querySelector<HTMLElement>('[role="listbox"]');
    if (!list) throw new Error("the open palette has no results list");
    const offenders: string[] = [];
    for (const element of list.querySelectorAll('[role="presentation"], [role="none"]')) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.startsWith("aria-")) offenders.push(`${attribute.name} on <${element.tagName.toLowerCase()}>`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("open: the quick-access hint is still read, as part of the group's label", () => {
    const { container } = renderPalette(true);
    const group = Array.from(container.querySelectorAll<HTMLElement>('[role="group"][aria-labelledby]')).find((element) =>
      (document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent ?? "").includes(
        "Jump straight to a workspace",
      ),
    );
    if (!group) throw new Error("no labelled group holds the quick-access hint");
    const label = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent ?? "").toContain("Quick access");
  });
});

/**
 * The cue that the search field has focus lives on its bordered frame (the input itself has no outline). It used to be
 * a 40% border and a 10% ring, about 2.4:1 against the page; the house Input draws a full-strength border and a 50% ring,
 * and the search field now does the same.
 */
describe("CommandPalette focus frame", () => {
  const frameOf = (container: HTMLElement): HTMLElement => {
    const frame = container.querySelector<HTMLElement>('[data-search-field="true"]');
    if (!frame) throw new Error("the search field has no frame");
    return frame;
  };

  it("open: the frame uses the same border and ring as every other field", () => {
    const { container } = renderPalette(true);
    const classes = frameOf(container).className.split(/\s+/);
    expect(classes).toContain("border-ring");
    expect(classes).toContain("ring-ring/50");
    expect(classes).not.toContain("ring-primary/10");
    expect(classes).not.toContain("border-primary/40");
  });

  it("closed: the frame keeps its quiet resting look", () => {
    const { container } = renderPalette(false);
    const classes = frameOf(container).className.split(/\s+/);
    expect(classes).not.toContain("border-ring");
    expect(classes).not.toContain("ring-ring/50");
  });
});
