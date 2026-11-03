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
import { RUNTIME_HEALTH_RUNTIME } from "@/lib/i18n/runtime-health-runtime";

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
    expect(banner.textContent).toContain("Reconnecting to the app service");

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

/**
 * F-0022: the notice can be closed (button or Esc), a small icon stays while the
 * problem lasts, and neither covers the sidebar, the topbar or the composer.
 */
describe("RuntimeHealthBanner dismissal", () => {
  const classesOf = (element: HTMLElement) => (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

  async function shownNotice() {
    render(<RuntimeHealthBanner />);
    runtimeUp = false;
    await advance(22_000);
    return screen.getByTestId("runtime-health-banner");
  }

  it.each([
    ["en", "Close"],
    ["fr", "Fermer"],
    ["ar", "إغلاق"],
  ] as const)("has a visible, labelled close control (%s)", async (code, label) => {
    locale = code;
    await shownNotice();
    const close = screen.getByTestId("runtime-health-dismiss");
    expect(close.tagName).toBe("BUTTON");
    expect(close.getAttribute("type")).toBe("button");
    expect(close.getAttribute("aria-label")).toBe(label);
    expect(close.querySelector("svg")).not.toBeNull();
  });

  it("closing hides the notice, leaves a small labelled icon, and failed probes of the same episode do not bring the notice back", async () => {
    await shownNotice();
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();

    const indicator = screen.getByTestId("runtime-health-indicator");
    expect(indicator.tagName).toBe("BUTTON");
    expect(indicator.getAttribute("aria-label")).toContain("Reconnecting to the app service");
    expect((indicator.textContent ?? "").trim()).toBe(""); // icon only
    const size = classesOf(indicator).find((token) => /^size-\d+(\.\d+)?$/.test(token));
    expect(size, "the icon needs an explicit size token").toBeDefined();
    expect(Number(size?.slice(5)) * 4).toBeLessThanOrEqual(32);

    await advance(60_000);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.queryByTestId("runtime-health-indicator")).not.toBeNull();
  });

  it("Esc inside the notice closes it and keeps the keyboard on the icon", async () => {
    await shownNotice();
    const retry = screen.getByTestId("runtime-health-retry");
    retry.focus();
    fireEvent.keyDown(retry, { key: "Escape" });
    await advance(0);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("runtime-health-indicator"));
  });

  it("activating the icon opens the notice again", async () => {
    await shownNotice();
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(0);
    fireEvent.click(screen.getByTestId("runtime-health-indicator"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
    expect(screen.getByTestId("runtime-health-banner").getAttribute("data-runtime-health")).toBe("reconnecting");
  });

  it("a worse state brings the notice back", async () => {
    await shownNotice();
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(0);
    browserOnline = false;
    await advance(12_000);
    expect(screen.getByTestId("runtime-health-banner").getAttribute("data-runtime-health")).toBe("offline");
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
  });

  it("after a full recovery the icon is gone, and a new outage shows the notice again", async () => {
    await shownNotice();
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(0);
    runtimeUp = true;
    await advance(10_000);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    runtimeUp = false;
    await advance(22_000);
    expect(screen.queryByTestId("runtime-health-banner")).not.toBeNull();
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
  });

  it("is placed with logical properties, at the top under the topbar (never the bottom edge, never the sidebar side)", async () => {
    const notice = await shownNotice();
    const noticeClasses = classesOf(notice);
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(0);
    const indicatorClasses = classesOf(screen.getByTestId("runtime-health-indicator"));

    for (const classes of [noticeClasses, indicatorClasses]) {
      expect(classes).toContain("fixed");
      expect(classes.filter((token) => /^-?(left|right)-/.test(token) || /^(sm:|md:|lg:)(-?)(left|right)-/.test(token))).toEqual([]);
      expect(classes.filter((token) => /(^|:)(ml|mr|pl|pr)-/.test(token))).toEqual([]);
      // Bottom edge: the Inbox composer (send button) lives there at every width.
      expect(classes.filter((token) => /(^|:)(bottom|inset-b|inset-y)-/.test(token))).toEqual([]);
      // Sidebar sits at the START edge in both directions: anchor to the END edge.
      expect(classes.filter((token) => /(^|:)start-/.test(token))).toEqual([]);
      expect(classes.some((token) => /(^|:)end-\d/.test(token))).toBe(true);
      // Under the topbar (h-14 below lg, h-12 from lg).
      expect(classes).toContain("top-14");
    }
  });
});

describe("runtime health copy", () => {
  const locales = ["ar", "fr", "en"] as const;
  const words = (text: string) => text.split(/[\s'’]+/).filter(Boolean);

  it("has the same keys in ar, fr and en", () => {
    const keys = (code: (typeof locales)[number]) => Object.keys(RUNTIME_HEALTH_RUNTIME[code]).sort();
    expect(keys("fr")).toEqual(keys("en"));
    expect(keys("ar")).toEqual(keys("en"));
    expect(keys("en")).toEqual(expect.arrayContaining(["runtimeHealth.close", "runtimeHealth.reopen"]));
  });

  it.each(locales)("keeps titles to 5 words and bodies to one short sentence (%s)", (code) => {
    const table = RUNTIME_HEALTH_RUNTIME[code];
    for (const kind of ["reconnecting", "offline"] as const) {
      const title = table[`runtimeHealth.${kind}.title`] ?? "";
      const body = table[`runtimeHealth.${kind}.body`] ?? "";
      expect(words(title).length, `${code} ${kind} title: ${title}`).toBeGreaterThan(0);
      expect(words(title).length, `${code} ${kind} title: ${title}`).toBeLessThanOrEqual(5);
      expect(body.split(/[.!?؟]\s+\S/).length, `${code} ${kind} body is one sentence: ${body}`).toBe(1);
      expect(words(body).length, `${code} ${kind} body: ${body}`).toBeLessThanOrEqual(14);
    }
  });
});
