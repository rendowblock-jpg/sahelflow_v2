/**
 * @vitest-environment happy-dom
 */
/** The four management cards: loading, empty, error, populated and saving, with destructive confirms. */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StorefrontGatesManager } from "@/components/storefront/storefront-gates-manager";
import { StorefrontLandingPagesManager } from "@/components/storefront/storefront-landing-pages-manager";
import { StorefrontOffersManager, type OfferRow } from "@/components/storefront/storefront-offers-manager";
import { StorefrontReviewsModeration } from "@/components/storefront/storefront-reviews-moderation";
import { render } from "@/test-utils/render";

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", () => ({ toast: toastMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "fr",
    dir: "ltr",
  }),
}));

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const calls = (method: string) => fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

const storefronts = [{ slug: "boutique-sahel", name: "Boutique Sahel" }];
const products = [{ id: "p1", name: "Savon d'Alep" }, { id: "p2", name: "Huile d'argan" }];
const gatesConfig = {
  storefrontSlug: "boutique-sahel", otpEnabled: false, otpLanguage: "ar", turnstileEnabled: true,
  turnstileSiteKey: "0x4AAAAAAA", hasDzverifyApiKey: false, hasTurnstileSecretKey: true,
};
const offer: OfferRow = {
  id: "o1", storefrontSlug: "boutique-sahel", triggerProductName: "Savon d'Alep", triggerVariantId: null,
  triggerQuantity: 3, rewardType: "free_shipping", rewardProductName: null, rewardQuantity: null, isActive: true,
};
const review = {
  id: "r1", status: "pending", authorName: "Amina B.", rating: 4, body: "Livraison rapide à Oran",
  productName: "Savon d'Alep", orderNumber: "SF-1042", storefrontSlug: "boutique-sahel", submittedAt: "2026-10-28T09:00:00.000Z",
};
const page = {
  id: "lp1", storefrontSlug: "boutique-sahel", productId: "p1", productName: "Savon d'Alep", slug: "savon",
  name: "Offre Ramadan", status: "draft", imageGap: 0, imageCount: 4, views: 120, publishedAt: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"), stats: { views: 120, orders: 6, revenue: 15000, conversionRate: 0.05 },
};

async function openDialog(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("alertdialog");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  toastMock.error.mockReset();
  toastMock.success.mockReset();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("gates manager", () => {
  it("loading: a skeleton that is a busy status, then the form", async () => {
    const gate = deferred();
    fetchMock.mockReturnValueOnce(gate.promise);
    render(<StorefrontGatesManager storefronts={storefronts} canManage />);
    expect(screen.getByTestId("gates-loading").getAttribute("aria-busy")).toBe("true");
    gate.resolve(reply({ config: gatesConfig }));
    expect(await screen.findByRole("button", { name: "storefronts.gates.save" })).toBeTruthy();
  });

  it("error: a calm sentence and Retry that loads again; no raw text", async () => {
    fetchMock.mockResolvedValueOnce(reply({ error: "SQLITE_BUSY: database is locked" }, 500));
    render(<StorefrontGatesManager storefronts={storefronts} canManage />);
    const error = await screen.findByTestId("manager-load-error");
    expect(error.textContent).toContain("storefront.studioStates.manager.loadFailedTitle");
    expect(error.textContent).not.toContain("SQLITE");
    fetchMock.mockResolvedValueOnce(reply({ config: gatesConfig }));
    fireEvent.click(screen.getByTestId("state-retry"));
    expect(await screen.findByRole("button", { name: "storefronts.gates.save" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("empty: no store yet -> one action, a real link to create one", () => {
    render(<StorefrontGatesManager storefronts={[]} canManage />);
    expect(screen.getByTestId("manager-empty").textContent).toContain("manager.noStoreTitle");
    expect(screen.getByRole("link", { name: "storefront.studioStates.manager.noStoreAction" }).getAttribute("href")).toBe("/storefronts/new");
  });

  it("switching a gate off asks first, names what is lost and focuses Cancel; nothing is sent before Confirm", async () => {
    fetchMock.mockResolvedValueOnce(reply({ config: gatesConfig }));
    const { container } = render(<StorefrontGatesManager storefronts={storefronts} canManage />);
    await screen.findByRole("button", { name: "storefronts.gates.save" });
    fireEvent.click(container.querySelector("#gates-turnstile") as HTMLElement);
    fireEvent.submit(container.querySelector("form") as HTMLElement);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("manager.gatesLoss.turnstile");
    const cancel = within(dialog).getByRole("button", { name: "common.cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(calls("PUT")).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(reply({ config: { ...gatesConfig, turnstileEnabled: false } }));
    fireEvent.click(within(dialog).getByRole("button", { name: "storefront.studioStates.manager.gatesConfirmAction" }));
    await waitFor(() => expect(calls("PUT")).toHaveLength(1));
  });

  it("saving: the button is disabled, the words say Saving, a second submit sends nothing; then Saved", async () => {
    fetchMock.mockResolvedValueOnce(reply({ config: gatesConfig }));
    const { container } = render(<StorefrontGatesManager storefronts={storefronts} canManage />);
    const save = await screen.findByRole("button", { name: "storefronts.gates.save" });
    const gate = deferred();
    fetchMock.mockReturnValueOnce(gate.promise);
    const form = container.querySelector("form") as HTMLElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("manager-save-line").textContent).toBe("storefront.studioStates.manager.saving");
    expect(calls("PUT")).toHaveLength(1);
    gate.resolve(reply({ config: gatesConfig }));
    await waitFor(() => expect(screen.getByTestId("manager-save-line").textContent).toBe("storefront.studioStates.manager.saved"));
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("failed: an alert beside the button with a calm reason, never the raw server text, no error toast", async () => {
    fetchMock.mockResolvedValueOnce(reply({ config: gatesConfig }));
    const { container } = render(<StorefrontGatesManager storefronts={storefronts} canManage />);
    await screen.findByRole("button", { name: "storefronts.gates.save" });
    fetchMock.mockResolvedValueOnce(reply({ error: "PrismaClientKnownRequestError P2002 at line 4" }, 500));
    fireEvent.submit(container.querySelector("form") as HTMLElement);
    const line = await waitFor(() => {
      const el = screen.getByTestId("manager-save-line");
      expect(el.getAttribute("role")).toBe("alert");
      return el;
    });
    expect(line.textContent).toContain("storefront.studioStates.save.notSaved");
    expect(line.textContent).not.toContain("Prisma");
    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

describe("offers manager", () => {
  it("empty (no offers yet): a designed sentence; no store: the create-a-store action", () => {
    render(<StorefrontOffersManager offers={[]} storefronts={storefronts} products={products} canManage />);
    expect(screen.getByTestId("manager-empty").textContent).toContain("manager.offersEmptyTitle");
    cleanup();
    render(<StorefrontOffersManager offers={[]} storefronts={[]} products={products} canManage />);
    expect(screen.getByRole("link", { name: "storefront.studioStates.manager.noStoreAction" })).toBeTruthy();
  });

  it("delete names the offer, focuses Cancel, and removes only after Confirm", async () => {
    render(<StorefrontOffersManager offers={[offer]} storefronts={storefronts} products={products} canManage />);
    const dialog = await openDialog("storefronts.offers.delete");
    expect(dialog.textContent).toContain('manager.offerDeleteBody|{"name":"Savon d\'Alep","quantity":3}');
    const cancel = within(dialog).getByRole("button", { name: "common.cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(calls("DELETE")).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(reply({ ok: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: "storefront.studioStates.manager.offerDeleteConfirm" }));
    await waitFor(() => expect(calls("DELETE")).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("manager-save-line").textContent).toBe("storefront.studioStates.manager.removed"));
  });

  it("a failed delete says Not removed with a calm reason", async () => {
    render(<StorefrontOffersManager offers={[offer]} storefronts={storefronts} products={products} canManage />);
    const dialog = await openDialog("storefronts.offers.delete");
    fetchMock.mockResolvedValueOnce(reply({ error: "ECONNRESET at 10.0.0.4" }, 500));
    fireEvent.click(within(dialog).getByRole("button", { name: "storefront.studioStates.manager.offerDeleteConfirm" }));
    const line = await waitFor(() => {
      const el = screen.getByTestId("manager-save-line");
      expect(el.getAttribute("role")).toBe("alert");
      return el;
    });
    expect(line.textContent).toContain("manager.notRemoved");
    expect(line.textContent).not.toContain("ECONNRESET");
  });
});

describe("reviews moderation", () => {
  it("empty: a designed sentence instead of nothing", () => {
    render(<StorefrontReviewsModeration reviews={[]} canModerate />);
    expect(screen.getByTestId("manager-empty").textContent).toContain("manager.reviewsEmptyTitle");
  });

  it("approve is one request even on a double tap; reject asks first and names the author and product", async () => {
    render(<StorefrontReviewsModeration reviews={[review]} canModerate />);
    const gate = deferred();
    fetchMock.mockReturnValueOnce(gate.promise);
    const approve = screen.getByRole("button", { name: /storefronts\.reviews\.approve/ });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(calls("POST")).toHaveLength(1);
    gate.resolve(reply({ ok: true }));
    await waitFor(() => expect(screen.getByTestId("manager-save-line").textContent).toBe("storefront.studioStates.manager.done"));

    const dialog = await openDialog("storefronts.reviews.reject");
    expect(dialog.textContent).toContain('"author":"Amina B."');
    expect(dialog.textContent).toContain('"product":"Savon d\'Alep"');
    expect(calls("POST")).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "common.cancel" })));
  });
});

describe("landing pages manager", () => {
  it("empty: designed sentence; delete names the page and its image count, confirm sends one DELETE", async () => {
    render(<StorefrontLandingPagesManager pages={[]} storefronts={storefronts} products={products} canManage />);
    expect(screen.getByTestId("manager-empty").textContent).toContain("manager.landingEmptyTitle");
    cleanup();
    render(<StorefrontLandingPagesManager pages={[page]} storefronts={storefronts} products={products} canManage />);
    const dialog = await openDialog("storefronts.landing.delete");
    expect(dialog.textContent).toContain('"name":"Offre Ramadan","count":4');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "common.cancel" })));
    expect(calls("DELETE")).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(reply({ ok: true }));
    fireEvent.click(within(dialog).getByRole("button", { name: "storefront.studioStates.manager.landingDeleteConfirm" }));
    await waitFor(() => expect(calls("DELETE")).toHaveLength(1));
  });
});
