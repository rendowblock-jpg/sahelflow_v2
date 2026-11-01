/**
 * @vitest-environment happy-dom
 */
/** The app-wide "reconnecting" note: shown for a silent runtime, different for no network, gone when it recovers. */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";
import { RuntimeHealthBanner } from "@/components/runtime/runtime-health-banner";

let locale: "ar" | "fr" | "en" = "en";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const table = (locale === "ar" ? ar : locale === "fr" ? fr : en) as Record<string, string>;
      return table[key] ?? getRuntimeTranslation(locale, key) ?? key;
    },
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
  }),
}));

let runtimeUp = true;
let browserOnline = true;
const fetchMock = vi.fn((): Promise<Response> => {
  if (!runtimeUp) return Promise.reject(new TypeError("Failed to fetch"));
  return Promise.resolve(new Response("{}", { status: 200 }));
});

beforeEach(() => {
  vi.useFakeTimers();
  runtimeUp = true;
  browserOnline = true;
  locale = "en";
  refresh.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => browserOnline });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("RuntimeHealthBanner", () => {
  it("renders nothing while the runtime answers", async () => {
    render(<RuntimeHealthBanner />);
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
  });

  it("a silent runtime shows the reconnecting note with a working Retry, then clears and reloads the page", async () => {
    render(<RuntimeHealthBanner />);
    runtimeUp = false;
    await advance(22_000);
    const banner = screen.getByTestId("runtime-health-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("data-runtime-health")).toBe("reconnecting");
    expect(banner.textContent).toContain("Reconnecting to the app's service on this device");

    runtimeUp = true;
    const recovered = vi.fn();
    window.addEventListener(DESKTOP_RUNTIME_RECOVERED_EVENT, recovered);
    fireEvent.click(screen.getByTestId("runtime-health-retry"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-banner")).not.toBeNull(); // one answer is not steady yet
    fireEvent.click(screen.getByTestId("runtime-health-retry"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    window.removeEventListener(DESKTOP_RUNTIME_RECOVERED_EVENT, recovered);
  });

  it("no network plus a silent runtime says so in different words", async () => {
    browserOnline = false;
    runtimeUp = false;
    render(<RuntimeHealthBanner />);
    await advance(22_000);
    const banner = screen.getByTestId("runtime-health-banner");
    expect(banner.getAttribute("data-runtime-health")).toBe("offline");
    expect(banner.textContent).toContain("No network on this device");
    expect(banner.textContent).not.toContain("Reconnecting");
  });

  it("no network but a reachable runtime shows nothing", async () => {
    browserOnline = false;
    render(<RuntimeHealthBanner />);
    await advance(60_000);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
  });

  it.each([
    ["ar", /[\u0600-\u06FF]/],
    ["fr", /Reconnexion/],
  ] as const)("speaks %s", async (code, pattern) => {
    locale = code;
    runtimeUp = false;
    render(<RuntimeHealthBanner />);
    await advance(22_000);
    expect(screen.getByTestId("runtime-health-banner").textContent).toMatch(pattern);
    expect(screen.getByTestId("runtime-health-banner").textContent).not.toContain("runtimeHealth.");
  });
});
