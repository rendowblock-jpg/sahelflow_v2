/**
 * @vitest-environment happy-dom
 */
/**
 * The app-wide "reconnecting" status (F-0022, second design). It is a small amber
 * control that lives IN the top bar, in flow, so it can never cover page content.
 * It never opens by itself; a click opens a popover with the sentence, Retry and
 * Close. It stays for as long as the problem lasts and goes when the runtime
 * holds steady. The monitor hook is called once, by the provider.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import { RUNTIME_HEALTH_RUNTIME } from "@/lib/i18n/runtime-health-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { DESKTOP_RUNTIME_RECOVERED_EVENT } from "@/lib/runtime/desktop-recovery";
import { RuntimeHealthIndicator } from "@/components/runtime/runtime-health-indicator";
import { RuntimeHealthProvider } from "@/components/runtime/runtime-health-provider";

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
const classesOf = (element: Element) => (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

function mount() {
  return render(
    <RuntimeHealthProvider>
      <header>
        <RuntimeHealthIndicator />
      </header>
    </RuntimeHealthProvider>,
  );
}

/** A silent runtime for long enough that the control appears. */
async function outage() {
  mount();
  runtimeUp = false;
  await advance(22_000);
  return screen.getByTestId("runtime-health-indicator");
}

async function openNote() {
  const control = await outage();
  fireEvent.click(control);
  await advance(0);
  return { control, note: screen.getByTestId("runtime-health-banner") };
}

describe("RuntimeHealthIndicator", () => {
  it("renders nothing while the runtime answers", async () => {
    mount();
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalled();
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing without a provider (the bar is used in places that do not monitor)", () => {
    render(<RuntimeHealthIndicator />);
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
  });

  it("a silent runtime shows a labelled control and never opens the note by itself", async () => {
    const control = await outage();
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("type")).toBe("button");
    expect(control.getAttribute("data-runtime-health")).toBe("reconnecting");
    expect(control.getAttribute("aria-label")).toBe("Reconnecting to the app service");
    expect(control.textContent).toContain("Reconnecting to the app service");
    expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();

    await advance(60_000); // the problem lasts: the control stays, the note still does not open
    expect(screen.getByTestId("runtime-health-indicator")).toBe(control);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
  });

  it("announces the status once through a polite live region", async () => {
    await outage();
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("Reconnecting to the app service");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(classesOf(live)).toContain("sr-only");
  });

  it("a click opens the note with the sentence, Retry and Close; Retry works, then the control clears and the page reloads", async () => {
    const { note } = await openNote();
    expect(note.getAttribute("data-runtime-health")).toBe("reconnecting");
    expect(note.textContent).toContain("Reconnecting to the app service");
    expect(note.textContent).toContain("Pages may look empty until it is back; we keep trying.");
    expect(screen.getByTestId("runtime-health-dismiss").textContent).toBe("Close");

    runtimeUp = true;
    const recovered = vi.fn();
    window.addEventListener(DESKTOP_RUNTIME_RECOVERED_EVENT, recovered);
    fireEvent.click(screen.getByTestId("runtime-health-retry"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-indicator")).not.toBeNull(); // one answer is not steady yet
    fireEvent.click(screen.getByTestId("runtime-health-retry"));
    await advance(0);
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledTimes(1);
    window.removeEventListener(DESKTOP_RUNTIME_RECOVERED_EVENT, recovered);
  });

  it("Esc closes the note and puts the keyboard back on the control", async () => {
    const { control } = await openNote();
    fireEvent.keyDown(screen.getByTestId("runtime-health-retry"), { key: "Escape" });
    await advance(50);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.getByTestId("runtime-health-indicator")).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  it("the Close button closes the note and keeps the control", async () => {
    const { control } = await openNote();
    fireEvent.click(screen.getByTestId("runtime-health-dismiss"));
    await advance(50);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.getByTestId("runtime-health-indicator")).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  it("moving focus out of the note closes it (a click outside is covered in the top bar test)", async () => {
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    await openNote();
    act(() => elsewhere.focus());
    await advance(50);
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(screen.queryByTestId("runtime-health-indicator")).not.toBeNull();
    elsewhere.remove();
  });

  it("no network plus a silent runtime says so in different words", async () => {
    browserOnline = false;
    const { control, note } = await (async () => {
      mount();
      runtimeUp = false;
      await advance(22_000);
      const trigger = screen.getByTestId("runtime-health-indicator");
      fireEvent.click(trigger);
      await advance(0);
      return { control: trigger, note: screen.getByTestId("runtime-health-banner") };
    })();
    expect(control.getAttribute("data-runtime-health")).toBe("offline");
    expect(control.getAttribute("aria-label")).toBe("No network on this device");
    expect(note.getAttribute("data-runtime-health")).toBe("offline");
    expect(note.textContent).toContain("No network on this device");
    expect(note.textContent).toContain("The app reconnects by itself when the network is back.");
    expect(note.textContent).not.toContain("Reconnecting");
  });

  it("no network but a reachable runtime shows nothing", async () => {
    browserOnline = false;
    mount();
    await advance(60_000);
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
  });

  it("a worse state updates the control in place (reconnecting -> offline)", async () => {
    const control = await outage();
    expect(control.getAttribute("data-runtime-health")).toBe("reconnecting");
    browserOnline = false;
    await advance(12_000);
    const now = screen.getByTestId("runtime-health-indicator");
    expect(now.getAttribute("data-runtime-health")).toBe("offline");
    expect(now.getAttribute("aria-label")).toBe("No network on this device");
  });

  it("after a full recovery the control is gone, and a NEW outage shows it again with the note closed", async () => {
    const { control } = await openNote();
    expect(control).toBeTruthy();
    runtimeUp = true;
    await advance(10_000);
    expect(screen.queryByTestId("runtime-health-indicator")).toBeNull();
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);

    runtimeUp = false;
    await advance(22_000);
    expect(screen.queryByTestId("runtime-health-indicator")).not.toBeNull();
    expect(screen.queryByTestId("runtime-health-banner")).toBeNull(); // the old open state is not remembered
  });

  it.each([
    ["ar", /[\u0600-\u06FF]/, "إغلاق"],
    ["fr", /Reconnexion/, "Fermer"],
  ] as const)("speaks %s, in the control and in the note", async (code, pattern, closeLabel) => {
    locale = code;
    const { control, note } = await openNote();
    expect(control.getAttribute("aria-label")).toMatch(pattern);
    expect(note.textContent).toMatch(pattern);
    expect(screen.getByTestId("runtime-health-dismiss").textContent).toBe(closeLabel);
    expect(document.body.textContent).not.toContain("runtimeHealth.");
  });

  it("is IN FLOW: no fixed, absolute, sticky or physical placement on the control or the note", async () => {
    const { control, note } = await openNote();
    for (const element of [control, note]) {
      const classes = classesOf(element);
      expect(classes.filter((token) => /(^|:)(fixed|absolute|sticky)$/.test(token))).toEqual([]);
      expect(classes.filter((token) => /(^|:)-?(left|right|top|bottom|inset|inset-x|inset-y|start|end)-/.test(token))).toEqual([]);
      expect(classes.filter((token) => /(^|:)(ml|mr|pl|pr)-/.test(token))).toEqual([]);
    }
  });

  it("is a 32 px control, icon only below md and icon plus a short label from md", async () => {
    const control = await outage();
    const classes = classesOf(control);
    expect(classes).toContain("h-8");
    expect(classes).toContain("w-8");
    expect(classes).toContain("md:w-auto");
    expect(classes).not.toContain("hidden");
    const label = [...control.querySelectorAll("span")].find((span) => span.textContent === "Reconnecting to the app service");
    expect(label, "the visible label").toBeDefined();
    const labelClasses = classesOf(label as Element);
    expect(labelClasses).toContain("hidden");
    expect(labelClasses).toContain("md:inline");
    expect(labelClasses).toContain("truncate"); // a long word list can never widen the bar
  });
});

describe("runtime health copy", () => {
  const locales = ["ar", "fr", "en"] as const;
  const words = (text: string) => text.split(/[\s'’]+/).filter(Boolean);

  it("has the same keys in ar, fr and en, with no key left unused", () => {
    const keys = (code: (typeof locales)[number]) => Object.keys(RUNTIME_HEALTH_RUNTIME[code]).sort();
    expect(keys("fr")).toEqual(keys("en"));
    expect(keys("ar")).toEqual(keys("en"));
    expect(keys("en")).toEqual(
      [
        "runtimeHealth.close",
        "runtimeHealth.offline.body",
        "runtimeHealth.offline.title",
        "runtimeHealth.reconnecting.body",
        "runtimeHealth.reconnecting.title",
        "runtimeHealth.retry",
        "runtimeHealth.retrying",
      ].sort(),
    );
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
