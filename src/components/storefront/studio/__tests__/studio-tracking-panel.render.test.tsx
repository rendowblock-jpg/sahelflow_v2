/**
 * @vitest-environment happy-dom
 */
/** The Studio's Tracking panel (Meta and TikTok pixel ids) in en, fr and ar. Markup and calls only: no picture was looked at. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";
import { TrackingPanel } from "../studio-tracking-panel";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
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

afterEach(() => cleanup());

const META_OK = "123456789012345";
const TIKTOK_OK = "C4ABCDEF1234567890";
const word = (key: string) => getRuntimeTranslation(state.locale, key) ?? `MISSING ${key}`;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const field = (key: string) => screen.getByLabelText(new RegExp("^" + escapeRe(word(key)))) as HTMLInputElement;
const meta = () => field("storefront.tracking.meta.label");
const tiktok = () => field("storefront.tracking.tiktok.label");
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });

function draftWith(tracking?: { metaPixelId?: string; tiktokPixelId?: string }): StorefrontStudioDraft {
  const theme = createDefaultStorefrontTheme("noir") as unknown as Record<string, unknown>;
  if (tracking) theme.tracking = tracking;
  return { name: "Boutique Sahel", theme } as unknown as StorefrontStudioDraft;
}
function show(draft = draftWith()) {
  const commit = vi.fn();
  render(<TrackingPanel draft={draft} commit={commit} />);
  return { commit, draft };
}
const committedTheme = (commit: ReturnType<typeof vi.fn>) => (commit.mock.calls.at(-1)?.[0] as StorefrontStudioDraft).theme as unknown as Record<string, unknown>;

describe.each(["en", "fr", "ar"] as const)("Tracking panel (%s)", (locale) => {
  beforeEach(() => {
    state.locale = locale;
  });

  it("renders both fields with a title and helper text, and no raw translation key", () => {
    show();
    expect(screen.getByText(word("storefront.tracking.title"))).toBeTruthy();
    expect(meta().tagName).toBe("INPUT");
    expect(tiktok().tagName).toBe("INPUT");
    expect(screen.getByText(word("storefront.tracking.meta.hint"))).toBeTruthy();
    expect(screen.getByText(word("storefront.tracking.tiktok.hint"))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/storefront\.[a-zA-Z]+\.|MISSING/);
    expect(screen.queryByText(word("storefront.tracking.error.meta"))).toBeNull();
  });

  it("shows the ids already in the draft", () => {
    show(draftWith({ metaPixelId: META_OK, tiktokPixelId: TIKTOK_OK }));
    expect(meta().value).toBe(META_OK);
    expect(tiktok().value).toBe(TIKTOK_OK);
  });

  it("a valid Meta id is written to theme.tracking and nothing else changes", () => {
    const { commit, draft } = show();
    type(meta(), META_OK);
    expect(commit).toHaveBeenCalledTimes(1);
    const next = commit.mock.calls[0]?.[0] as StorefrontStudioDraft;
    expect((next.theme as unknown as Record<string, unknown>).tracking).toEqual({ metaPixelId: META_OK });
    expect({ ...next.theme, tracking: undefined }).toEqual({ ...draft.theme, tracking: undefined });
    expect(next.name).toBe(draft.name);
    expect(screen.queryByText(word("storefront.tracking.error.meta"))).toBeNull();
  });

  it("a valid TikTok id keeps the Meta id that is already there", () => {
    const { commit } = show(draftWith({ metaPixelId: META_OK }));
    type(tiktok(), TIKTOK_OK);
    expect(committedTheme(commit).tracking).toEqual({ metaPixelId: META_OK, tiktokPixelId: TIKTOK_OK });
  });

  it.each(["12 3456 7890", "123456789", '1234567890"', "1234567890<", "<script>alert(1)</script>", "abcdefghij1"])(
    "an invalid Meta id (%s) shows the error and is NOT written",
    (bad) => {
      const { commit } = show();
      type(meta(), bad);
      expect(screen.getByText(word("storefront.tracking.error.meta"))).toBeTruthy();
      expect(meta().getAttribute("aria-invalid")).toBe("true");
      expect(commit).not.toHaveBeenCalled();
    },
  );

  it.each(["abc def", "abcdefghij1234", "ABCDEFGHIJ'--", "ABCDEFGHIJ\"", "<script>alert(1)</script>", "SHORT1"])(
    "an invalid TikTok id (%s) shows the error and is NOT written",
    (bad) => {
      const { commit } = show();
      type(tiktok(), bad);
      expect(screen.getByText(word("storefront.tracking.error.tiktok"))).toBeTruthy();
      expect(tiktok().getAttribute("aria-invalid")).toBe("true");
      expect(commit).not.toHaveBeenCalled();
    },
  );

  it("fixing an invalid value clears the error and writes the valid one", () => {
    const { commit } = show();
    type(meta(), "12 34");
    type(meta(), META_OK);
    expect(screen.queryByText(word("storefront.tracking.error.meta"))).toBeNull();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(committedTheme(commit).tracking).toEqual({ metaPixelId: META_OK });
  });

  it("clearing one field removes only that key", () => {
    const { commit } = show(draftWith({ metaPixelId: META_OK, tiktokPixelId: TIKTOK_OK }));
    type(meta(), "");
    expect(committedTheme(commit).tracking).toEqual({ tiktokPixelId: TIKTOK_OK });
  });

  it("clearing the last field removes the tracking key entirely (unset stores stay byte-identical)", () => {
    const { commit, draft } = show(draftWith({ metaPixelId: META_OK }));
    type(meta(), "");
    const theme = committedTheme(commit);
    expect("tracking" in theme).toBe(false);
    const { tracking: _gone, ...before } = draft.theme as unknown as Record<string, unknown>;
    expect(theme).toEqual(before);
  });

  it("an empty field on an unset store is not an error", () => {
    const { commit } = show();
    type(meta(), "");
    expect(screen.queryByText(word("storefront.tracking.error.meta"))).toBeNull();
    if (commit.mock.calls.length) expect("tracking" in committedTheme(commit)).toBe(false);
  });
});
