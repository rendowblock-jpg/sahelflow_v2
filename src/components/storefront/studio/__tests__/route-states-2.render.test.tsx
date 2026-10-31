/**
 * @vitest-environment happy-dom
 */
/** Route-level states of the new-store and store pages, and the mini preview's loading / failure. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NewError from "@/app/(dashboard)/storefronts/new/error";
import NewLoading from "@/app/(dashboard)/storefronts/new/loading";
import IdError from "@/app/(dashboard)/storefronts/[id]/error";
import IdLoading from "@/app/(dashboard)/storefronts/[id]/loading";
import { StorefrontMiniPreview } from "@/components/storefront/storefront-mini-preview";
import { render } from "@/test-utils/render";

const renderer = vi.hoisted(() => ({ throws: false }));
vi.mock("@/components/storefront/storefront-renderer", () => ({
  StorefrontRenderer: () => {
    if (renderer.throws) throw new Error("renderer exploded");
    return <div data-testid="renderer-ok" />;
  },
}));
vi.mock("@/lib/storefront/studio-draft", () => ({ createStorefrontStudioDraft: () => ({}) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }) }));

afterEach(() => {
  cleanup();
  renderer.throws = false;
  vi.unstubAllGlobals();
});

describe("route loading", () => {
  it("new store: a busy skeleton shaped like the form (steps, three fields, button)", () => {
    const { container } = render(<NewLoading />);
    expect(screen.getByTestId("wizard-loading").getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("[data-skeleton-field]")).toHaveLength(3);
    expect(container.querySelector("[data-skeleton-steps]")).not.toBeNull();
  });
  it("store page: the same editor-shaped skeleton as the Studio", () => {
    const { container } = render(<IdLoading />);
    expect(screen.getByTestId("studio-loading")).toBeTruthy();
    expect(container.querySelector("[data-skeleton-canvas]")).not.toBeNull();
  });
});

describe.each([["new", NewError], ["[id]", IdError]] as const)("route error (%s)", (_name, ErrorPage) => {
  it("Retry works and a real link leads back to the stores list; the error text is not shown", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("TypeError: x is undefined at storefront.ts:88")} reset={reset} />);
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "storefront.studioStates.route.back" }).getAttribute("href")).toBe("/storefronts");
    expect(document.body.textContent).not.toContain("storefront.ts:88");
  });
});

describe("mini preview", () => {
  /** autoWidth: the observer reports that width as soon as it is asked to observe. */
  function stubObserver(autoWidth?: number) {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe() {
        if (autoWidth !== undefined) {
          this.cb([{ contentRect: { width: autoWidth } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
      }
      disconnect() {}
    });
  }

  it("shows a skeleton until the card is measured", () => {
    stubObserver();
    render(<StorefrontMiniPreview config={{} as never} products={[]} />);
    expect(screen.getByTestId("mini-preview-loading")).toBeTruthy();
    expect(screen.queryByTestId("renderer-ok")).toBeNull();
  });
});
