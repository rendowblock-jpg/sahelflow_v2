/**
 * @vitest-environment happy-dom
 */
/** The honest photo states in the Studio list: text and icon, ar RTL included. */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  announcePhotoProgress,
  loadPhotoStatus,
  PhotoStateChip,
  photoFailureText,
  photoPublishNote,
  resetPhotoAnnouncements,
  resetPhotoStatusStore,
  shouldAnnounce,
  summarizePhotoStates,
} from "@/components/storefront/studio/photo-state-chip";
import { getStorefrontPhotosRuntimeTranslation } from "@/lib/i18n/storefront-photos-runtime";
import { render } from "@/test-utils/render";

const ctx = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("next/navigation", () => ({ useParams: () => ({}) }));
vi.mock("@/hooks/use-i18n", async () => {
  const { getStorefrontPhotosRuntimeTranslation: lookup } = await import("@/lib/i18n/storefront-photos-runtime");
  return {
    useI18n: () => ({
      locale: ctx.locale,
      dir: ctx.locale === "ar" ? "rtl" : "ltr",
      t: (key: string, params?: Record<string, string | number>) =>
        (lookup(ctx.locale, key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? "")),
    }),
  };
});

const SF = "storefront_12345678";
const tx = (key: string, locale: "en" | "fr" | "ar" = "en") => getStorefrontPhotosRuntimeTranslation(locale, key) ?? "";

function answer(products: Record<string, string[]>, progress: { done: number; total: number } | null = null) {
  return {
    products: Object.fromEntries(Object.entries(products).map(([id, states]) => [id, states.map((state, i) => ({ ref: `/uploads/s/${i}.webp`, state }))])),
    progress,
  };
}
function stubFetch(...bodies: Array<ReturnType<typeof answer> | "fail">) {
  const fetchMock = vi.fn(async () => {
    const next = bodies.length > 1 ? bodies.shift() : bodies[0];
    return next === "fail" || next === undefined ? new Response("{}", { status: 500 }) : new Response(JSON.stringify(next));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => { ctx.locale = "en"; });
afterEach(() => { cleanup(); resetPhotoStatusStore(); resetPhotoAnnouncements(); vi.unstubAllGlobals(); });

describe("PhotoStateChip states", () => {
  it.each([
    ["hosted", "storefront.photos.hosted"],
    ["waiting", "storefront.photos.waiting"],
    ["local-only", "storefront.photos.localOnly"],
    ["missing", "storefront.photos.missing"],
  ])("%s shows its words with an icon (never colour alone)", async (state, key) => {
    stubFetch(answer({ p1: [state] }));
    render(<PhotoStateChip productId="p1" hasImage storefrontId={SF} />);
    const chip = await screen.findByTestId("photo-chip");
    expect(chip.getAttribute("data-state")).toBe(state);
    expect(chip.textContent).toBe(tx(key));
    expect(chip.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says the exact words the Founder approved for en", () => {
    expect(tx("storefront.photos.hosted")).toBe("Photo hosted");
    expect(tx("storefront.photos.waiting")).toBe("Photo waiting to upload");
    expect(tx("storefront.photos.localOnly")).toBe("Photo only on this PC (not shown to buyers yet)");
    expect(tx("storefront.photos.waiting")).not.toMatch(/uploaded/i);
    expect(tx("storefront.photos.hosted")).not.toMatch(/\blive\b/i);
  });

  it("renders Arabic inside an RTL tree", async () => {
    ctx.locale = "ar";
    stubFetch(answer({ p1: ["local-only"] }));
    render(<div dir="rtl" data-testid="root"><PhotoStateChip productId="p1" hasImage storefrontId={SF} /></div>);
    const chip = await screen.findByTestId("photo-chip");
    expect(chip.textContent).toBe("الصورة على هذا الحاسوب فقط (لا يراها المشترون بعد)");
    expect(chip.closest("[dir=rtl]")).not.toBeNull();
    expect(chip.querySelector("[dir=auto]")).not.toBeNull();
  });

  it("shows the worst state when a product has several photos, and nothing for a pasted link", async () => {
    stubFetch(answer({ p1: ["hosted", "local-only", "link"], p2: ["link"] }));
    render(<><PhotoStateChip productId="p1" hasImage storefrontId={SF} /><PhotoStateChip productId="p2" hasImage storefrontId={SF} /></>);
    expect((await screen.findByTestId("photo-chip")).getAttribute("data-state")).toBe("local-only");
    await waitFor(() => expect(screen.queryByTestId("photo-chip-loading")).toBeNull());
    expect(screen.getAllByTestId("photo-chip")).toHaveLength(1);
  });

  it("renders nothing and asks nothing for a product without a photo", () => {
    const fetchMock = stubFetch(answer({}));
    const { container } = render(<PhotoStateChip productId="p1" hasImage={false} storefrontId={SF} />);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing when it does not know which store it is in", () => {
    const fetchMock = stubFetch(answer({}));
    const { container } = render(<PhotoStateChip productId="p1" hasImage />);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("loading, error, retry", () => {
  it("shows a skeleton while loading and never a wrong state first", async () => {
    stubFetch(answer({ p1: ["hosted"] }));
    render(<PhotoStateChip productId="p1" hasImage storefrontId={SF} />);
    expect(screen.getByTestId("photo-chip-loading").getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("photo-chip")).toBeNull();
    await screen.findByTestId("photo-chip");
    expect(screen.queryByTestId("photo-chip-loading")).toBeNull();
  });

  it("one fetch serves every row", async () => {
    const fetchMock = stubFetch(answer({ p1: ["hosted"], p2: ["waiting"] }));
    render(<><PhotoStateChip productId="p1" hasImage storefrontId={SF} /><PhotoStateChip productId="p2" hasImage storefrontId={SF} /></>);
    await screen.findAllByTestId("photo-chip");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("says it could not check, offers a 44px Retry, and recovers", async () => {
    const fetchMock = stubFetch("fail", answer({ p1: ["hosted"] }));
    render(<PhotoStateChip productId="p1" hasImage storefrontId={SF} />);
    expect((await screen.findByTestId("photo-chip-error")).textContent).toContain("Could not check photos");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    await screen.findByTestId("photo-chip");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("photo-chip-error")).toBeNull();
  });

  it("keeps the last answer on screen when a refresh fails", async () => {
    stubFetch(answer({ p1: ["hosted"] }), "fail");
    render(<PhotoStateChip productId="p1" hasImage storefrontId={SF} />);
    await screen.findByTestId("photo-chip");
    await loadPhotoStatus(SF, true);
    await screen.findByTestId("photo-chip-error");
    expect(screen.getByTestId("photo-chip").getAttribute("data-state")).toBe("hosted");
  });
});

describe("sending progress", () => {
  it("shows 'Sending photos 3 of 12' on a waiting photo and announces it politely once", async () => {
    stubFetch(answer({ p1: ["waiting"] }, { done: 3, total: 12 }));
    render(<PhotoStateChip productId="p1" hasImage storefrontId={SF} />);
    expect((await screen.findByTestId("photo-chip")).textContent).toBe("Sending photos 3 of 12");
    const region = document.querySelector("[data-photo-announcer]");
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.textContent).toBe("Sending photos 3 of 12");
  });

  it("announces at most once per 2 seconds and never the same words twice", () => {
    expect(shouldAnnounce(null, 0, "a")).toBe(true);
    expect(shouldAnnounce({ at: 0, text: "a" }, 1999, "b")).toBe(false);
    expect(shouldAnnounce({ at: 0, text: "a" }, 2000, "b")).toBe(true);
    expect(shouldAnnounce({ at: 0, text: "a" }, 9000, "a")).toBe(false);
    announcePhotoProgress("one", 0);
    announcePhotoProgress("two", 1000);
    expect(document.querySelector("[data-photo-announcer]")?.textContent).toBe("one");
    announcePhotoProgress("two", 2500);
    expect(document.querySelector("[data-photo-announcer]")?.textContent).toBe("two");
    expect(document.querySelectorAll("[data-photo-announcer]")).toHaveLength(1);
  });
});

describe("pure helpers", () => {
  it("summarizes by the worst state", () => {
    expect(summarizePhotoStates(["hosted", "waiting"])).toBe("waiting");
    expect(summarizePhotoStates(["hosted", "missing", "local-only"])).toBe("missing");
    expect(summarizePhotoStates(["link"])).toBeNull();
    expect(summarizePhotoStates([])).toBeNull();
  });

  it("gives one plain sentence per failure code, with no path, hash or token", () => {
    const t = (key: string) => tx(key);
    for (const code of ["HOSTING_BUSY", "HOSTING_QUOTA", "HOSTING_REFUSED", "PHOTO_TOO_DETAILED", "PHOTO_UNREADABLE", "MEDIA_CONTRACT_CHANGED"]) {
      const text = photoFailureText(code, t);
      expect(text, code).toMatch(/^Your store was not published/);
      expect(text).not.toMatch(/[\\/]|[0-9a-f]{24}|Bearer|uploads|\.webp/i);
    }
    expect(photoFailureText("SOMETHING_ELSE", t)).toBeNull();
    expect(photoFailureText(null, t)).toBeNull();
  });

  it("adds the 'only on this PC' note to the success line only when some photos stayed", () => {
    const t = (key: string, params?: Record<string, string | number>) => `${key}|${params?.count ?? ""}`;
    expect(photoPublishNote({ onlyHere: 0 }, t)).toBeNull();
    expect(photoPublishNote(null, t)).toBeNull();
    expect(photoPublishNote({ onlyHere: 3 }, t)).toBe("storefront.photos.publishedOnlyHere|3");
    expect(photoPublishNote({ onlyHere: 0, missing: 2 }, t)).toBe("storefront.photos.publishedMissing|2");
    expect(photoPublishNote({ onlyHere: 1, missing: 2 }, t)).toBe("storefront.photos.publishedOnlyHere|1 storefront.photos.publishedMissing|2");
    expect(photoPublishNote({ onlyHere: 0, missing: 0 }, t)).toBeNull();
  });

  it("has ar, fr and en for every key with the same placeholders", () => {
    const keys = Object.keys(JSON.parse(JSON.stringify(
      Object.fromEntries(["storefront.photos.hosted", "storefront.photos.waiting", "storefront.photos.localOnly", "storefront.photos.missing", "storefront.photos.checking", "storefront.photos.checkFailed", "storefront.photos.retry", "storefront.photos.sending", "storefront.photos.publishedOnlyHere", "storefront.photos.fail.HOSTING_BUSY", "storefront.photos.fail.HOSTING_QUOTA", "storefront.photos.fail.HOSTING_REFUSED", "storefront.photos.fail.PHOTO_TOO_DETAILED", "storefront.photos.fail.PHOTO_UNREADABLE", "storefront.photos.fail.MEDIA_CONTRACT_CHANGED"].map((k) => [k, 1])),
    )));
    const holes = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    for (const key of keys) {
      const en = tx(key, "en"); const fr = tx(key, "fr"); const ar = tx(key, "ar");
      expect(en && fr && ar, key).toBeTruthy();
      expect(holes(fr), key).toBe(holes(en));
      expect(holes(ar), key).toBe(holes(en));
    }
  });
});
