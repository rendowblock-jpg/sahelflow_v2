/**
 * @vitest-environment happy-dom
 */
/**
 * The Studio's legal publish gate, rendered (ar RTL, fr, en; the real catalog words). An active store with no legal, or legal the
 * seller has not read, does not leave the Studio: no request at all, the Legal panel opens, the sentence says why. A read block
 * goes out with the save and the release; a paused store does not need it. Markup only: no picture was looked at.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import { markLegalReviewed } from "@/lib/storefront/studio-legal";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/sf1/studio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: lookup } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        let text = lookup(state.locale, key) ?? key;
        for (const [name, value] of Object.entries(params ?? {})) text = text.split(`{${name}}`).join(String(value));
        return text;
      },
      locale: state.locale,
      dir: state.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("@/components/storefront/studio/studio-canvas", () => ({ StudioCanvas: () => <div data-testid="studio-canvas" /> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
}

const READ = markLegalReviewed({ sellerName: "Amine Boutique", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" });
const UNREAD = { ...READ, extraTerms: "Changed after reading." };

function configWith(options: { isActive: boolean; legal?: unknown }): StorefrontStudioConfig {
  const theme = createDefaultStorefrontTheme("atlas");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  const withLegal = options.legal === undefined ? theme : { ...theme, builder: { ...theme.builder, legal: options.legal } };
  return {
    id: "sf1", slug: "my-shop", name: "متجر الصحراء", description: null, theme: withLegal as never, productIds: ["prod-1"], contact: null,
    isActive: options.isActive,
    createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z"),
    draftUpdatedAt: new Date("2026-10-02T00:00:00Z"), liveUpdatedAt: new Date("2026-10-01T00:00:00Z"),
  };
}

type Call = { method: string; body: Record<string, unknown> };
function stubFetch() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const body = method === "PATCH"
      ? { config: { draftUpdatedAt: "2026-10-31T01:00:00.000Z" } }
      : { config: { draftUpdatedAt: "2026-10-31T01:00:00.000Z" }, hostedRelease: { status: "published", releaseId: "release_1" } };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  }));
  return calls;
}

/** Mount a PAUSED draft and switch it on: that is a store about to go live, with a change to save first. */
function mountGoingLive(config: StorefrontStudioConfig) {
  wideViewport();
  const view = render(<StorefrontStudio config={config} products={[]} />);
  const button = view.container.querySelector<HTMLButtonElement>("[data-studio-publish]") as HTMLButtonElement;
  fireEvent.click(view.container.querySelector<HTMLElement>('[role="switch"]') as HTMLElement);
  return { ...view, button };
}
const word = (key: string) => getRuntimeTranslation(state.locale, key) ?? `MISSING ${key}`;
const legalPanelOpen = (container: HTMLElement) =>
  container.querySelector('[data-studio-rail-item="legal"]')?.getAttribute("aria-pressed") === "true" && container.querySelector("[data-legal-read-state]") !== null;
const statusTexts = () => screen.getAllByRole("status").map((node) => node.textContent);

describe.each(["ar", "fr", "en"] as const)("Studio publish gate in %s", (locale) => {
  const use = () => { state.locale = locale; };

  it("active store with no legal: no request at all, the Legal panel opens, the 'missing' sentence", async () => {
    use();
    const calls = stubFetch();
    const { button, container } = mountGoingLive(configWith({ isActive: false }));
    await act(async () => { fireEvent.click(button); });
    expect(calls).toHaveLength(0);
    expect(legalPanelOpen(container)).toBe(true);
    expect(statusTexts()).toContain(word("storefront.legalPanel.blocked.missing"));
  });

  it("active store with legal the seller has not read: no request, panel open, the 'unreviewed' sentence", async () => {
    use();
    const calls = stubFetch();
    const { button, container } = mountGoingLive(configWith({ isActive: false, legal: UNREAD }));
    await act(async () => { fireEvent.click(button); });
    expect(calls).toHaveLength(0);
    expect(legalPanelOpen(container)).toBe(true);
    expect(statusTexts()).toContain(word("storefront.legalPanel.blocked.unreviewed"));
  });

  it("legal the seller has read (it arrives in the config's theme.builder.legal): the save carries it and the release goes ahead", async () => {
    use();
    const calls = stubFetch();
    const { button, container } = mountGoingLive(configWith({ isActive: false, legal: READ }));
    fireEvent.click(button);
    await waitFor(() => expect(calls.map((call) => call.method)).toEqual(["PATCH", "POST"]));
    expect(legalPanelOpen(container)).toBe(false);
    const theme = calls[0]?.body.theme as { builder: { legal?: unknown } };
    expect(theme.builder.legal).toEqual(READ);
    expect(calls[0]?.body.isActive).toBe(true);
  });

  it("a PAUSED store publishes without legal", async () => {
    use();
    const calls = stubFetch();
    wideViewport();
    const { container } = render(<StorefrontStudio config={configWith({ isActive: false })} products={[]} />);
    const button = container.querySelector<HTMLButtonElement>("[data-studio-publish]") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(calls.map((call) => call.method)).toEqual(["POST"]));
    expect(legalPanelOpen(container)).toBe(false);
  });
});
