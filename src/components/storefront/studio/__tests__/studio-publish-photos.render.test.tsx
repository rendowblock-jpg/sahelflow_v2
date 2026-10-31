/**
 * @vitest-environment happy-dom
 */
/**
 * The publish line beside the Publish button says the truth about photos, in ar (RTL), fr and en with the
 * real catalog text: success with every photo hosted (nothing added), success while photos stay on this PC
 * (hosting off, or only some hosted), a stop on a busy photo service (Retry offered), a stop on a refused photo,
 * and "Published" never shown when the publish call failed. fetch is a fixture; nothing leaves the test.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { photoFailureRetryable, publishStatusView, withPhotoNote } from "@/components/storefront/studio/publish-flow";
import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

type Loc = "ar" | "fr" | "en";
const ctx = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/sf1/studio",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: lookup } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      locale: ctx.locale,
      dir: ctx.locale === "ar" ? "rtl" : "ltr",
      t: (key: string, params?: Record<string, string | number>) =>
        (lookup(ctx.locale, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? "")),
    }),
  };
});
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

const tx = (loc: Loc, key: string, params: Record<string, string | number> = {}) =>
  (getRuntimeTranslation(loc, key) ?? `MISSING:${key}`).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params[name] ?? ""));

// Paused on purpose: an active store with no delivery price is stopped before any request.
const config: StorefrontStudioConfig = {
  id: "sf1",
  slug: "my-shop",
  name: "متجر الصحراء",
  description: null,
  theme: createDefaultStorefrontTheme("atlas"),
  productIds: ["prod-1"],
  contact: null,
  isActive: false,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  draftUpdatedAt: new Date("2026-10-02T00:00:00Z"),
  liveUpdatedAt: new Date("2026-10-01T00:00:00Z"),
};

const RELEASE_ID = "rel_a1b2c3d4e5";
type Photos = { hosted: number; uploaded: number; onlyHere: number; missing: number; serviceOn: boolean | null } | null;
const ok = (photos: Photos) => ({ status: 200, body: { hostedRelease: { status: "published", releaseId: RELEASE_ID, photos } } });
// The server sends the English sentence in `error` and the stable code in `code` (withErrorHandler).
const stopped = (status: number, code: string) => ({ status, body: { error: `English sentence for ${code}`, code } });

function stubPublish(...replies: Array<{ status: number; body: unknown }>) {
  const posts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "POST") return new Promise(() => undefined);
      const reply = replies[Math.min(posts.length, replies.length - 1)] as { status: number; body: unknown };
      posts.push(String(init?.body ?? ""));
      return Promise.resolve({ ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: () => Promise.resolve(reply.body) });
    }),
  );
  return posts;
}

async function publishOnce(loc: Loc) {
  ctx.locale = loc;
  wideViewport();
  const view = render(<StorefrontStudio config={config} products={[]} />);
  const button = view.container.querySelector<HTMLButtonElement>("[data-studio-publish]") as HTMLButtonElement;
  fireEvent.click(button);
  const line = screen.getByTestId("publish-status-line");
  await waitFor(() => expect(line.textContent ?? "").not.toBe(""));
  await waitFor(() => expect(line.textContent).not.toBe(tx(loc, "storefront.studioStates.publish.publishing")));
  return { line, view };
}

const publishedText = (loc: Loc) => tx(loc, "storefront.studioStates.publish.published", { version: RELEASE_ID.slice(0, 8) });
const publishedPrefix = (loc: Loc) => tx(loc, "storefront.studioStates.publish.published").split("(")[0] as string;

describe.each(["ar", "fr", "en"] as const)("publish line and photos (%s)", (loc) => {
  it("success, every photo hosted: the plain published line, no photo note, no Retry", async () => {
    stubPublish(ok({ hosted: 3, uploaded: 1, onlyHere: 0, missing: 0, serviceOn: true }));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.textContent).toBe(publishedText(loc)));
    expect(line.getAttribute("role")).toBe("status");
    expect(screen.queryByTestId("publish-retry")).toBeNull();
  });

  it("success, hosting off: published, then says the photos stay on this PC with the count", async () => {
    stubPublish(ok({ hosted: 0, uploaded: 0, onlyHere: 2, missing: 0, serviceOn: false }));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.textContent).toBe(`${publishedText(loc)} ${tx(loc, "storefront.photos.publishedOnlyHere", { count: 2 })}`));
    expect(line.getAttribute("role")).toBe("status");
  });

  it("success, some photos still only on this PC: counts only those", async () => {
    stubPublish(ok({ hosted: 1, uploaded: 0, onlyHere: 1, missing: 0, serviceOn: true }));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.textContent).toContain(tx(loc, "storefront.photos.publishedOnlyHere", { count: 1 })));
    expect(line.textContent).toContain(publishedText(loc));
  });

  it("HOSTING_BUSY: the reason from the catalog, an alert, and a Retry that publishes again (44 px)", async () => {
    const posts = stubPublish(stopped(503, "HOSTING_BUSY"), ok({ hosted: 1, uploaded: 1, onlyHere: 0, missing: 0, serviceOn: true }));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.textContent).toBe(tx(loc, "storefront.photos.fail.HOSTING_BUSY")));
    expect(line.getAttribute("role")).toBe("alert");
    expect(line.textContent).not.toContain(publishedPrefix(loc));
    expect(line.textContent).not.toContain("English sentence");
    const retry = screen.getByTestId("publish-retry");
    expect(retry.textContent).toBe(tx(loc, "storefront.photos.retry"));
    expect(retry.className).toContain("min-h-11");
    expect(retry.className).toContain("min-w-11");
    fireEvent.click(retry);
    await waitFor(() => expect(posts).toHaveLength(2));
    await waitFor(() => expect(line.textContent).toBe(publishedText(loc)));
    expect(screen.queryByTestId("publish-retry")).toBeNull();
  });

  it("HOSTING_REFUSED: the reason, an alert, no Retry (retrying cannot change the answer)", async () => {
    stubPublish(stopped(422, "HOSTING_REFUSED"));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.textContent).toBe(tx(loc, "storefront.photos.fail.HOSTING_REFUSED")));
    expect(line.getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("publish-retry")).toBeNull();
  });

  it.each([
    [503, "HOSTING_BUSY"], [422, "HOSTING_QUOTA"], [422, "HOSTING_REFUSED"], [422, "PHOTO_TOO_DETAILED"],
    [422, "PHOTO_UNREADABLE"], [422, "MEDIA_CONTRACT_CHANGED"], [500, "SOMETHING_ELSE"],
  ] as const)("a failed publish (%s %s) never shows Published", async (status, code) => {
    stubPublish(stopped(status, code));
    const { line } = await publishOnce(loc);
    await waitFor(() => expect(line.getAttribute("role")).toBe("alert"));
    expect(line.textContent).not.toContain(publishedPrefix(loc));
    expect(line.textContent).not.toContain("English sentence");
  });
});

describe("publish-flow photo helpers", () => {
  it("only HOSTING_BUSY is retryable", () => {
    expect(photoFailureRetryable("HOSTING_BUSY")).toBe(true);
    for (const code of ["HOSTING_QUOTA", "HOSTING_REFUSED", "PHOTO_TOO_DETAILED", "PHOTO_UNREADABLE", "MEDIA_CONTRACT_CHANGED"]) {
      expect(photoFailureRetryable(code)).toBe(false);
    }
  });
  it("withPhotoNote adds the note after the text, or nothing", () => {
    expect(withPhotoNote("Published.", null)).toBe("Published.");
    expect(withPhotoNote("Published.", "2 photos here")).toBe("Published. 2 photos here");
  });
  it("a failed phase carries retry only when asked", () => {
    const t = (key: string) => key;
    expect(publishStatusView({ phase: "failed", text: "x", retry: true }, t)).toEqual({ text: "x", role: "alert", retry: true });
    expect(publishStatusView({ phase: "failed", text: "x" }, t)).toEqual({ text: "x", role: "alert" });
  });
});
