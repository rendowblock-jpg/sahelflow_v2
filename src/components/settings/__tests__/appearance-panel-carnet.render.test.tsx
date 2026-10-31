/**
 * @vitest-environment happy-dom
 */
/**
 * Settings > Appearance: the Carnet card is listed first, is what a new or migrated install shows as selected,
 * is named in ar / fr / en, and choosing any card writes the preset AND the look marker (cookie and storage).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/components/theme-provider";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

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
    <ThemeProvider defaultPreset="carnet">
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

describe("appearance panel: the Carnet card", () => {
  it("lists Carnet first, before the four older presets", () => {
    mount();
    expect(options().map((button) => button.dataset.themePresetOption)).toEqual(["carnet", "sahel", "atlas", "oasis", "dune"]);
  });

  it("shows Carnet as the chosen look on a new install", () => {
    mount();
    expect(optionFor("carnet").getAttribute("aria-pressed")).toBe("true");
    expect(optionFor("sahel").getAttribute("aria-pressed")).toBe("false");
  });

  it("moves an old install whose cookie says sahel to Carnet once, and writes the marker with it", () => {
    document.cookie = "sahelflow-theme-preset=sahel; Path=/";
    mount();
    expect(optionFor("carnet").getAttribute("aria-pressed")).toBe("true");
    expect(document.cookie).toContain("sahelflow-look=2");
    expect(document.cookie).toContain("sahelflow-theme-preset=carnet");
    expect(localStorage.getItem("sahelflow-look")).toBe("2");
  });

  it("respects a later choice: picking Sahel writes the preset and the marker, and a remount keeps Sahel", () => {
    mount();
    fireEvent.click(optionFor("sahel"));
    expect(document.cookie).toContain("sahelflow-theme-preset=sahel");
    expect(document.cookie).toContain("sahelflow-look=2");
    expect(localStorage.getItem("sahelflow-theme-preset")).toBe("sahel");
    expect(localStorage.getItem("sahelflow-look")).toBe("2");
    cleanup();
    mount();
    expect(optionFor("sahel").getAttribute("aria-pressed")).toBe("true");
    expect(optionFor("carnet").getAttribute("aria-pressed")).toBe("false");
  });

  it("picking Carnet again writes carnet and the marker", () => {
    document.cookie = "sahelflow-look=2; Path=/";
    document.cookie = "sahelflow-theme-preset=atlas; Path=/";
    mount();
    expect(optionFor("atlas").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(optionFor("carnet"));
    expect(document.cookie).toContain("sahelflow-theme-preset=carnet");
    expect(localStorage.getItem("sahelflow-theme-preset")).toBe("carnet");
    expect(document.documentElement.dataset.themePreset).toBe("carnet");
  });

  it.each([
    ["ar", "الدفتر"],
    ["fr", "Carnet"],
    ["en", "Ledger"],
  ] as const)("names the card in %s and gives it a one-line description", (locale, name) => {
    harness.locale = locale;
    mount();
    const card = optionFor("carnet");
    expect(card.textContent).toContain(name);
    const description = getRuntimeTranslation(locale, "settings.appearance.presetCarnetDescription");
    expect(description).toBeTruthy();
    expect(description).not.toContain("\n");
    expect(card.textContent).toContain(description);
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it("has a swatch preview that is decorative", () => {
    mount();
    expect(optionFor("carnet").querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
