/**
 * @vitest-environment happy-dom
 */
/** Studio start-up: a loading skeleton shaped like the editor, and a failure with Retry and a way back. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLoading } from "@/components/storefront/studio/studio-loading";
import { StudioRouteError } from "@/components/storefront/studio/studio-route-error";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

afterEach(() => cleanup());

describe("StudioLoading", () => {
  it("is a busy status shaped like the editor: top bar, rail, panel and canvas", () => {
    const { container } = render(<StudioLoading />);
    const loading = screen.getByTestId("studio-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    for (const part of ["topbar", "rail", "panel", "canvas"]) {
      expect(container.querySelector(`[data-skeleton-${part}]`), part).not.toBeNull();
    }
  });
});

describe("StudioRouteError", () => {
  it("offers Retry and a way back to the stores list", () => {
    const reset = vi.fn();
    render(<StudioRouteError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "storefront.studioStates.route.back" }).getAttribute("href")).toBe(
      "/storefronts",
    );
  });
});
