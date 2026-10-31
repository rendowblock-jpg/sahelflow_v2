/**
 * @vitest-environment happy-dom
 */
/**
 * The Studio on a 360 px phone: the rail is a bottom bar, panels and the
 * inspector are bottom sheets, the canvas clips sideways overflow, the save
 * status keeps its words, Escape closes the top sheet. jsdom has no layout, so
 * these tests pin the structure and the classes the layout relies on.
 */
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { topSheetToClose } from "@/components/storefront/studio/studio-feedback";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/sf1/studio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}|${JSON.stringify(params)}` : key,
    locale: "en",
    dir: "ltr",
  }),
}));
vi.mock("@/components/storefront/studio/studio-canvas", () => ({
  StudioCanvas: () => <div data-testid="studio-canvas" />,
}));

afterEach(() => cleanup());

function viewport(phone: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: phone && query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

const config: StorefrontStudioConfig = {
  id: "sf1",
  slug: "my-shop",
  name: "متجر الصحراء",
  description: null,
  theme: createDefaultStorefrontTheme("atlas"),
  productIds: [],
  contact: null,
  isActive: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  draftUpdatedAt: null,
  liveUpdatedAt: new Date("2026-10-01T00:00:00Z"),
};

const mount = () => render(<StorefrontStudio config={config} products={[]} />);
const rail = (root: ParentNode, id: string) =>
  root.querySelector<HTMLButtonElement>(`[data-studio-rail-item="${id}"]`);

describe("topSheetToClose", () => {
  it.each([
    ["inspector first", { inspectorOpen: true, panelOpen: true, isPhone: true }, "inspector"],
    ["the panel on a phone", { inspectorOpen: false, panelOpen: true, isPhone: true }, "panel"],
    ["a desktop panel is not a sheet", { inspectorOpen: false, panelOpen: true, isPhone: false }, null],
    ["nothing open", { inspectorOpen: false, panelOpen: false, isPhone: true }, null],
  ] as const)("%s", (_name, input, expected) => {
    expect(topSheetToClose(input)).toBe(expected);
  });
});

describe("Studio on a phone", () => {
  it("starts with the canvas first: the panel sheet is closed", () => {
    viewport(true);
    const { container } = mount();
    expect(container.querySelector("[data-studio-panel]")).toBeNull();
    expect(rail(container, "sections")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the panel open on a wide screen", () => {
    viewport(false);
    const { container } = mount();
    expect(container.querySelector("[data-studio-panel='sections']")).not.toBeNull();
  });

  it("makes the rail a bottom bar of 44 px targets", () => {
    viewport(true);
    const { container } = mount();
    const nav = container.querySelector("[data-studio-rail]");
    expect(nav?.className).toContain("max-md:flex-row");
    expect(nav?.className).toContain("max-md:w-full");
    expect(rail(container, "theme")?.className).toContain("max-md:min-h-11");
    expect(container.querySelector("[data-studio-body]")?.className).toContain("max-md:flex-col");
  });

  it("opens a panel as a sheet above the rail", () => {
    viewport(true);
    const { container } = mount();
    fireEvent.click(rail(container, "theme") as HTMLElement);
    const sheet = container.querySelector("[data-studio-panel='theme']");
    expect(sheet).not.toBeNull();
    expect(sheet?.className).toContain("max-md:absolute");
    expect(sheet?.className).toContain("max-md:bottom-full");
    expect(sheet?.className).toContain("max-md:w-full");
  });

  it("the first tap on the default panel's rail button opens its sheet", () => {
    viewport(true);
    const { container } = mount();
    fireEvent.click(rail(container, "sections") as HTMLElement);
    expect(container.querySelector("[data-studio-panel='sections']")).not.toBeNull();
    expect(rail(container, "sections")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("Escape closes the open sheet", () => {
    viewport(true);
    const { container } = mount();
    fireEvent.click(rail(container, "theme") as HTMLElement);
    expect(rail(container, "theme")?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("[data-studio-panel]")).toBeNull();
  });

  it("shows the inspector as a bottom sheet and never sideways over the canvas", () => {
    viewport(true);
    const { container } = mount();
    const inspector = container.querySelector("[data-studio-inspector]");
    expect(inspector?.className).toContain("max-md:inset-x-0");
    expect(inspector?.className).toContain("max-md:bottom-0");
    expect(inspector?.className).toContain("max-md:w-full");
  });

  it("clips sideways overflow on the canvas pane", () => {
    viewport(true);
    const { container } = mount();
    const pane = container.querySelector("[data-studio-preview]");
    expect(pane?.className).toContain("min-w-0");
    expect(pane?.className).toContain("overflow-x-hidden");
  });

  it("keeps the save status in words on a phone", () => {
    viewport(true);
    const { container } = mount();
    const status = container.querySelector("[data-studio-save-status]");
    expect(status?.textContent).toContain("storefront.studio.saved");
    expect(status?.querySelector(".sr-only, .max-sm\\:sr-only")).toBeNull();
  });
});
