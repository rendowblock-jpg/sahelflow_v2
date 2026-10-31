/**
 * @vitest-environment happy-dom
 */
/**
 * The whole Studio, one click on Publish: a dirty draft is saved first and then
 * released, the button reads "Publishing", the status line beside it is polite
 * on success and an alert on failure, and a failed save blocks the release and
 * keeps the draft. Also: the "takes effect when you publish" hint beside the
 * active/paused switch. fetch is a fixture; nothing leaves the test.
 */
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wideViewport() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
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

const base: StorefrontStudioConfig = {
  id: "sf1",
  slug: "my-shop",
  name: "متجر الصحراء",
  description: null,
  theme: createDefaultStorefrontTheme("atlas"),
  // The draft schema needs at least one selected product, or a save is refused before any request.
  productIds: ["prod-1"],
  contact: null,
  isActive: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  draftUpdatedAt: null,
  liveUpdatedAt: new Date("2026-10-01T00:00:00Z"),
};
// Paused on purpose: an active store with no delivery price is stopped before any request.
const withDraft: StorefrontStudioConfig = { ...base, isActive: false, draftUpdatedAt: new Date("2026-10-02T00:00:00Z") };

type Reply = { status: number; body: unknown };
type Call = { method: string; body: Record<string, unknown> };
type Handler = () => Promise<Reply>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A fetch fixture: records every request and answers each method with its handler. */
function stubFetch(handlers: Partial<Record<"PATCH" | "POST", Handler>>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      const handler = method === "PATCH" ? handlers.PATCH : method === "POST" ? handlers.POST : undefined;
      if (!handler) return new Promise(() => undefined);
      return handler().then((reply) => ({
        ok: reply.status >= 200 && reply.status < 300,
        status: reply.status,
        json: () => Promise.resolve(reply.body),
      }));
    }),
  );
  return calls;
}

const SAVED = { config: { draftUpdatedAt: "2026-10-31T01:00:00.000Z" } };
const methods = (calls: Call[]) => calls.map((call) => call.method);

function mount(config: StorefrontStudioConfig) {
  wideViewport();
  const view = render(<StorefrontStudio config={config} products={[]} />);
  const button = view.container.querySelector<HTMLButtonElement>("[data-studio-publish]") as HTMLButtonElement;
  const line = () => screen.getByTestId("publish-status-line");
  const toggle = () => screen.getByRole("switch", { name: "storefront.studio.visibleToBuyers" });
  const saveStatus = () => view.container.querySelector("[data-studio-save-status]")?.textContent ?? "";
  return { ...view, button, line, toggle, saveStatus };
}

describe("Publish on a dirty draft: one click", () => {
  it("saves first, then releases that saved version; Publishing on the button; polite status on success", async () => {
    const patch = deferred<Reply>();
    const post = deferred<Reply>();
    const calls = stubFetch({ PATCH: () => patch.promise, POST: () => post.promise });
    const { button, line, toggle } = mount(base);

    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button);

    await waitFor(() => expect(methods(calls)).toEqual(["PATCH"]));
    expect(button.textContent).toContain("storefront.studioStates.publish.publishing");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(line().textContent).toBe("storefront.studioStates.publish.savingFirst");
    expect(line().getAttribute("role")).toBe("status");
    expect(calls[0]?.body.isActive).toBe(false);

    await act(async () => {
      patch.resolve({ status: 200, body: SAVED });
    });
    await waitFor(() => expect(methods(calls)).toEqual(["PATCH", "POST"]));
    expect(calls[1]?.body.expectedDraftUpdatedAt).toBe("2026-10-31T01:00:00.000Z");
    expect(line().textContent).toBe("storefront.studioStates.publish.publishing");
    expect(button.disabled).toBe(true);

    await act(async () => {
      post.resolve({ status: 200, body: { hostedRelease: { status: "published", releaseId: "abcdef123456" } } });
    });
    await waitFor(() =>
      expect(line().textContent).toBe('storefront.studioStates.publish.published|{"version":"abcdef12"}'),
    );
    expect(line().getAttribute("role")).toBe("status");
    expect(line().getAttribute("aria-live")).toBe("polite");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.textContent).toContain("storefront.studio.publish");
    expect(button.textContent).not.toContain("storefront.studioStates.publish.publishing");
  });

  it("a failed save blocks the release, tells why in an alert and keeps the draft", async () => {
    const calls = stubFetch({ PATCH: () => Promise.resolve({ status: 500, body: { error: "internal_error" } }) });
    const { button, line, toggle, saveStatus } = mount(base);

    fireEvent.click(toggle());
    fireEvent.click(button);

    await waitFor(() => expect(line().getAttribute("role")).toBe("alert"));
    expect(line().textContent).toContain("storefront.studioStates.publish.blockedBySave");
    expect(line().getAttribute("aria-live")).toBeNull();
    expect(methods(calls)).toEqual(["PATCH"]);
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(saveStatus()).toContain("storefront.studioStates.save.notSaved");
    expect(button.disabled).toBe(false);
  });

  it("a refused release is an alert that says the draft is kept; the draft shows as saved", async () => {
    const calls = stubFetch({
      PATCH: () => Promise.resolve({ status: 200, body: SAVED }),
      POST: () => Promise.resolve({ status: 500, body: { error: "internal_error" } }),
    });
    const { button, line, toggle, saveStatus } = mount(base);

    fireEvent.click(toggle());
    fireEvent.click(button);

    await waitFor(() => expect(line().getAttribute("role")).toBe("alert"));
    expect(methods(calls)).toEqual(["PATCH", "POST"]);
    expect(line().textContent).toContain("storefront.studioStates.publish.failed|");
    expect(saveStatus()).toContain("storefront.studio.saved");
    expect(saveStatus()).not.toContain("notSaved");
  });
});

describe("Publish on a draft that is already saved", () => {
  it("sends only the release; no answer at all says the outcome is unknown, never failed or done", async () => {
    const calls = stubFetch({ POST: () => Promise.reject(new TypeError("Failed to fetch")) });
    const { button, line } = mount(withDraft);

    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(line().getAttribute("role")).toBe("alert"));
    expect(methods(calls)).toEqual(["POST"]);
    expect(line().textContent).toBe("storefront.studioStates.publish.failedUnknown");
  });
});

describe("the active/paused switch says when it takes effect online", () => {
  const hint = () => screen.queryByTestId("studio-toggle-hint");

  it("hidden while the switch matches the online store, shown when it differs, hidden again when put back", () => {
    stubFetch({});
    const { toggle } = mount(base);
    expect(hint()).toBeNull();

    fireEvent.click(toggle());
    expect(hint()?.textContent).toBe("storefront.studioStates.toggle.appliesOnPublish");
    expect(toggle().getAttribute("aria-describedby")).toBe(hint()?.id);

    fireEvent.click(toggle());
    expect(hint()).toBeNull();
    expect(toggle().getAttribute("aria-describedby")).toBeNull();
  });

  it("a draft saved earlier hides what is online, so the hint stays until a publish settles it", async () => {
    stubFetch({ POST: () => Promise.resolve({ status: 200, body: { hostedRelease: { status: "paused", releaseId: "r1abcdef" } } }) });
    const { button, line } = mount(withDraft);
    expect(hint()).not.toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(line().textContent).toBe("storefront.inactive"));
    expect(hint()).toBeNull();
  });

  it("goes away once a publish puts the paused state online", async () => {
    stubFetch({
      PATCH: () => Promise.resolve({ status: 200, body: SAVED }),
      POST: () => Promise.resolve({ status: 200, body: { hostedRelease: { status: "paused", releaseId: "r2abcdef" } } }),
    });
    const { button, line, toggle } = mount(base);

    fireEvent.click(toggle());
    expect(hint()).not.toBeNull();
    fireEvent.click(button);

    await waitFor(() => expect(line().textContent).toBe("storefront.inactive"));
    expect(hint()).toBeNull();
  });

  it("stays when the publish fails: the store online did not change", async () => {
    stubFetch({ PATCH: () => Promise.resolve({ status: 500, body: { error: "internal_error" } }) });
    const { button, line, toggle } = mount(base);

    fireEvent.click(toggle());
    fireEvent.click(button);
    await waitFor(() => expect(line().getAttribute("role")).toBe("alert"));
    expect(hint()).not.toBeNull();
  });
});
