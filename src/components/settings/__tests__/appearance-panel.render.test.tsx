/**
 * @vitest-environment happy-dom
 */
/**
 * Settings > Appearance: four colour presets, Sahel first and chosen on a new install. A saved preset that no
 * longer exists (the removed cream look) shows Sahel, and choosing a card writes the preset cookie and storage.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";

import { AppearancePanel } from "../appearance-panel";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));

vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation: runtime } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => tables[harness.locale]?.[key] ?? runtime(harness.locale, key) ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});
vi.mock("@/hooks/use-ui-density", () => ({ useUiDensity: () => ({ density: "comfortable", setDensity: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/runtime/report-launch-appearance", () => ({ reportLaunchAppearance: vi.fn() }));

function clearCookies() {
  for (const entry of document.cookie.split(";")) {
    const name = entry.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

function mount() {
  return render(
    <ThemeProvider defaultPreset="sahel">
      <AppearancePanel />
    </ThemeProvider>,
  );
}

const options = () => [...document.querySelectorAll<HTMLButtonElement>("[data-theme-preset-option]")];
const optionFor = (preset: string) => {
  const found = options().find((button) => button.dataset.themePresetOption === preset);
  if (!found) throw new Error(`no ${preset} card`);
  return found;
};

beforeEach(() => {
  harness.locale = "en";
  clearCookies();
  localStorage.clear();
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  }
});
afterEach(() => cleanup());

describe("appearance panel: the colour presets", () => {
  it("lists the four presets, Sahel first", () => {
    mount();
    expect(options().map((button) => button.dataset.themePresetOption)).toEqual(["sahel", "atlas", "oasis", "dune"]);
  });

  it("shows Sahel as the chosen preset on a new install", () => {
    mount();
    expect(optionFor("sahel").getAttribute("aria-pressed")).toBe("true");
    expect(optionFor("dune").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows Sahel, and writes it, when the saved preset is the removed cream look", () => {
    document.cookie = "sahelflow-theme-preset=carnet; Path=/";
    localStorage.setItem("sahelflow-theme-preset", "carnet");
    mount();
    expect(optionFor("sahel").getAttribute("aria-pressed")).toBe("true");
    expect(document.cookie).toContain("sahelflow-theme-preset=sahel");
    expect(document.documentElement.dataset.themePreset).toBe("sahel");
  });

  it("keeps a real saved preset and does not write a migration marker", () => {
    document.cookie = "sahelflow-theme-preset=atlas; Path=/";
    mount();
    expect(optionFor("atlas").getAttribute("aria-pressed")).toBe("true");
    expect(document.cookie).not.toContain("sahelflow-look");
    expect(localStorage.getItem("sahelflow-look")).toBeNull();
  });

  it("picking a card writes the preset to the cookie and to storage, and a remount keeps it", () => {
    mount();
    fireEvent.click(optionFor("oasis"));
    expect(document.cookie).toContain("sahelflow-theme-preset=oasis");
    expect(localStorage.getItem("sahelflow-theme-preset")).toBe("oasis");
    expect(document.documentElement.dataset.themePreset).toBe("oasis");
    cleanup();
    mount();
    expect(optionFor("oasis").getAttribute("aria-pressed")).toBe("true");
  });

  it("gives every card a decorative swatch preview", () => {
    mount();
    for (const button of options()) expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
