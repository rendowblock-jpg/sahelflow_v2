/**
 * @vitest-environment happy-dom
 */
/**
 * The Studio's template gallery and page-type control for the five styles - BEHAVIOUR in a real DOM.
 *
 * What a seller must be able to rely on: the gallery offers every template once; the page-type control (landing page / store) appears
 * for the five styles and for nothing else; changing it changes only `mode`; moving between templates keeps or drops `mode` as the
 * data model says (a style starts as a landing page, two styles keep the seller's choice, an older template has none).
 */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTranslations } from "@/lib/i18n";
import {
  isStorefrontStyleId,
  STOREFRONT_STYLE_IDS,
  STOREFRONT_TEMPLATE_IDS,
  type StorefrontPageMode,
  type StorefrontTemplateId,
  type StorefrontTheme,
} from "@/lib/storefront/presentation-types";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

import { ThemePanel } from "../studio-design-panels";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

afterEach(() => cleanup());

function draftOf(template: StorefrontTemplateId, mode?: StorefrontPageMode) {
  const theme = createDefaultStorefrontTheme(template);
  if (mode) theme.mode = mode;
  return { name: "Shop", slug: "shop-test", description: "", theme, selectedProductIds: ["product_12345678"], isActive: true };
}

function mount(template: StorefrontTemplateId, mode?: StorefrontPageMode) {
  const draft = draftOf(template, mode);
  const commit = vi.fn();
  const view = render(<ThemePanel draft={draft} commit={commit} />);
  const committedTheme = (): StorefrontTheme => {
    const call = commit.mock.calls.at(-1);
    if (!call) throw new Error("nothing was committed");
    return (call[0] as { theme: StorefrontTheme }).theme;
  };
  return { draft, commit, view, committedTheme };
}

const card = (id: string) => {
  const found = document.querySelector<HTMLElement>(`[data-storefront-template-card="${id}"]`);
  if (!found) throw new Error(`no gallery card for ${id}`);
  return found;
};
const modeControl = () => document.querySelector<HTMLElement>("[data-storefront-mode]");

describe("the template gallery", () => {
  it("offers every template exactly once", () => {
    mount("atlas");
    const ids = [...document.querySelectorAll<HTMLElement>("[data-storefront-template-card]")].map((node) => node.dataset.storefrontTemplateCard);
    expect([...ids].sort()).toEqual([...STOREFRONT_TEMPLATE_IDS].sort());
  });

  it.each(STOREFRONT_STYLE_IDS)("%s: its card carries its own name and its own role line", (id) => {
    mount("atlas");
    expect(card(id).textContent).toContain(`storefront.studio.template.${id}`);
    expect(card(id).textContent).toContain(`storefront.studio.template.${id}Role`);
  });

  it("marks only the chosen template as pressed", () => {
    mount("pulse");
    const pressed = [...document.querySelectorAll<HTMLElement>("[data-storefront-template-card]")].filter((node) => node.getAttribute("aria-pressed") === "true");
    expect(pressed.map((node) => node.dataset.storefrontTemplateCard)).toEqual(["pulse"]);
  });
});

describe("the page-type control (landing page / store)", () => {
  it.each(STOREFRONT_TEMPLATE_IDS)("%s: shown only for the five styles", (id) => {
    mount(id);
    expect(modeControl() !== null).toBe(isStorefrontStyleId(id));
  });

  it("a style opens as a landing page; choosing Store commits mode=store and changes nothing else", () => {
    const { draft, committedTheme } = mount("noir", "landing");
    expect(screen.getByRole("radio", { name: "storefront.studio.mode.landing" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "storefront.studio.mode.store" })).toHaveAttribute("aria-checked", "false");
    expect(modeControl()?.textContent).toContain("storefront.studio.mode.landingHint");
    fireEvent.click(screen.getByRole("radio", { name: "storefront.studio.mode.store" }));
    const next = committedTheme();
    expect(next.mode).toBe("store");
    expect({ ...next, mode: "landing" }).toEqual(draft.theme);
  });

  it("a style saved without a mode reads as a landing page", () => {
    mount("bloom");
    expect(screen.getByRole("radio", { name: "storefront.studio.mode.landing" })).toHaveAttribute("aria-checked", "true");
  });

  it("a store shows the store hint, and Landing page switches back", () => {
    const { committedTheme } = mount("lumen", "store");
    expect(modeControl()?.textContent).toContain("storefront.studio.mode.storeHint");
    expect(modeControl()?.textContent).not.toContain("storefront.studio.mode.landingHint");
    fireEvent.click(screen.getByRole("radio", { name: "storefront.studio.mode.landing" }));
    expect(committedTheme().mode).toBe("landing");
  });
});

describe("the preview note (the Studio canvas draws a simplified layout)", () => {
  const NOTE = "storefront.studio.mode.previewNote";

  it.each(STOREFRONT_TEMPLATE_IDS)("%s: the note is shown for the five styles and for no other template", (id) => {
    mount(id);
    const shown = (document.body.textContent ?? "").includes(NOTE);
    expect(shown).toBe(isStorefrontStyleId(id));
    if (isStorefrontStyleId(id)) expect(modeControl()?.textContent).toContain(NOTE);
  });

  it("the note stays when the seller switches between landing page and store", () => {
    mount("pulse", "store");
    expect(modeControl()?.textContent).toContain(NOTE);
    fireEvent.click(screen.getByRole("radio", { name: "storefront.studio.mode.landing" }));
    expect(modeControl()?.textContent).toContain(NOTE);
  });
});

describe("moving between templates in the gallery", () => {
  it("from an older template to a style: the style starts as a landing page", () => {
    const { committedTheme } = mount("sahara");
    fireEvent.click(card("noir"));
    const next = committedTheme();
    expect(next.template).toBe("noir");
    expect(next.mode).toBe("landing");
  });

  it("from one style to another: the seller's choice (store) is kept", () => {
    const { committedTheme } = mount("lumen", "store");
    fireEvent.click(card("pulse"));
    const next = committedTheme();
    expect(next.template).toBe("pulse");
    expect(next.mode).toBe("store");
  });

  it("from a style to an older template: the mode is dropped, not carried along", () => {
    const { committedTheme } = mount("noir", "store");
    fireEvent.click(card("souk"));
    const next = committedTheme();
    expect(next.template).toBe("souk");
    expect("mode" in next).toBe(false);
  });
});

describe("the words", () => {
  const KEYS = [
    ...STOREFRONT_STYLE_IDS.flatMap((id) => [`storefront.studio.template.${id}`, `storefront.studio.template.${id}Role`]),
    "storefront.studio.mode.title",
    "storefront.studio.mode.landing",
    "storefront.studio.mode.landingHint",
    "storefront.studio.mode.store",
    "storefront.studio.mode.storeHint",
    "storefront.studio.mode.previewNote",
  ];

  it.each(["ar", "fr", "en"] as const)("%s: every new key has text", (locale) => {
    const dictionary = getTranslations(locale);
    for (const key of KEYS) expect(dictionary[key], `${locale} ${key}`).toBeTruthy();
  });

  it.each(["ar", "fr"] as const)("%s: role lines and page-type words are translated, not copied from English", (locale) => {
    const english = getTranslations("en");
    const dictionary = getTranslations(locale);
    for (const key of KEYS.filter((entry) => !/template\.(noir|lumen|atelier|pulse|bloom)$/.test(entry))) {
      expect(dictionary[key], `${locale} ${key}`).not.toBe(english[key]);
    }
  });
});
