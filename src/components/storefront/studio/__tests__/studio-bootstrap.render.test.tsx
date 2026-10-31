/**
 * @vitest-environment happy-dom
 */
/** New-store wizard: errors are linked to the field, the first bad field gets focus, a failed create stays on screen. */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorefrontStudioBootstrap } from "@/components/storefront/studio/storefront-studio-bootstrap";
import { render } from "@/test-utils/render";

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));
vi.mock("@/components/storefront/studio/studio-canvas", () => ({
  StudioCanvas: () => <div data-testid="studio-canvas" />,
}));

const products = [{ id: "p1", name: "قميص قطني", price: 2500, sku: null, stock: 3, images: null }];
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  toastMock.error.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const primary = () => document.querySelector<HTMLButtonElement>("[data-wizard-primary]") as HTMLButtonElement;

describe("new-store wizard validation", () => {
  it("an empty name: one alert, the name field is invalid, linked to it, and focused", async () => {
    render(<StorefrontStudioBootstrap products={products} />);
    fireEvent.click(primary());
    const alert = await screen.findByRole("alert");
    expect(alert.id).toBe("wizard-step-error");
    expect(alert.textContent).toContain("storefront.builder.error.nameRequired");
    const name = screen.getByLabelText("storefront.builder.shopName");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toContain("wizard-step-error");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it("a too-short address: the slug field is the invalid one and gets focus", async () => {
    render(<StorefrontStudioBootstrap products={products} />);
    fireEvent.change(screen.getByLabelText("storefront.builder.shopName"), { target: { value: "Boutique Sahel" } });
    const slug = document.getElementById("wizard-slug") as HTMLInputElement;
    fireEvent.change(slug, { target: { value: "a" } });
    fireEvent.click(primary());
    expect((await screen.findByRole("alert")).textContent).toContain("storefront.builder.error.slugRequired");
    expect(slug.getAttribute("aria-invalid")).toBe("true");
    expect(slug.getAttribute("aria-describedby")).toContain("wizard-step-error");
    expect(screen.getByLabelText("storefront.builder.shopName").getAttribute("aria-invalid")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(slug));
  });
});

describe("new-store wizard create failure", () => {
  it("keeps the form, shows the reason in a persistent alert and not only a toast", async () => {
    render(<StorefrontStudioBootstrap products={products} />);
    fireEvent.change(screen.getByLabelText("storefront.builder.shopName"), { target: { value: "Boutique Sahel" } });
    for (let guard = 0; guard < 8 && !primary().textContent?.includes("storefront.wizard.create"); guard += 1) {
      fireEvent.click(primary());
      if (screen.queryByRole("alert")?.textContent?.includes("productRequired")) {
        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
      }
    }
    expect(primary().textContent).toContain("storefront.wizard.create");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ error: "Rate limit exceeded" }) });
    fireEvent.click(primary());
    const alert = await screen.findByTestId("wizard-submit-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("storefront.studioStates.create.failed");
    // A mapped server message shows as its translated reason (never developer text).
    expect(alert.textContent).toContain("error.rateLimited");
    expect(alert.textContent).not.toContain("Rate limit exceeded");
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(primary().textContent).toContain("storefront.wizard.create");
  });
});
