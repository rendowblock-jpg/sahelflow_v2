/**
 * @vitest-environment happy-dom
 */
// F-0027. The founder's inbox showed two stacked amber banners (127 messages
// waiting + 2 recovery issues, about 130 px). They are now ONE compact status
// strip with a Details popover. Real code: the recovery dock, the strip, the
// status hook, the store, the copy. Stand-ins: fetch (status + recovery list),
// the locale hook, fake timers. NOT covered: real layout (happy-dom has none;
// the lead looks in a browser), a real sidecar, a real screen reader.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIngressHealthStore } from "@/hooks/inbox/ingress-health-store";

const harness = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));

import { WhatsAppIngressRecoveryDock } from "../whatsapp-ingress-recovery-dock";

let statusBody: unknown;
let recoveryEvents: unknown[];

function status(over: { pending?: number; oldestSec?: number; stuck?: number; lost?: number } = {}) {
  return {
    status: "connected",
    ingress: {
      spool: {
        pending: over.pending ?? 0,
        oldestPendingSec: over.oldestSec ?? null,
        stuck: over.stuck ?? 0,
      },
      lost: { sinceStart: { spoolFailed: over.lost ?? 0, noPairedAccount: 0, unsupportedChat: 0 } },
    },
  };
}

function deadLetter(id: string) {
  return {
    id,
    status: "dead_letter",
    sourceId: "213791999157@s.whatsapp.net",
    attemptCount: 5,
    lastErrorCode: "http_503",
    providerTimestamp: null,
    createdAt: "2026-11-03T08:00:00.000Z",
    attempts: [],
  };
}

// The Founder's screenshot: 127 waiting, oldest 3209 min, 2 recovery issues.
const FOUNDER = () => {
  statusBody = status({ pending: 127, oldestSec: 3209 * 60 });
  recoveryEvents = [deadLetter("a"), deadLetter("b")];
};

async function settle(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}
async function showAll() {
  await settle(1);
  await settle(1_100);
}

const onReconnect = vi.fn();

function host() {
  return render(
    <div data-testid="host">
      <aside className="list-column" />
      <WhatsAppIngressRecoveryDock embedded canRetry linkConnected onReconnect={onReconnect} />
      <section className="thread-column" />
    </div>,
  );
}

const strip = () => screen.getByTestId("ingress-health-notices");
const detailsButton = () => within(strip()).getByRole("button", { name: /^(Details|Détails|التفاصيل)$/ });
const panel = () => screen.queryByTestId("ingress-strip-details-panel");
const chip = (kind: string) => strip().querySelector(`[data-notice="${kind}"]`) as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers();
  harness.locale = "en";
  onReconnect.mockClear();
  resetIngressHealthStore();
  statusBody = status();
  recoveryEvents = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).startsWith("/api/whatsapp/status") ? statusBody : { events: recoveryEvents },
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("status strip: one element, one line", () => {
  it("is ONE status element, not a stack of banners (127 waiting + 2 recovery issues)", async () => {
    FOUNDER();
    host();
    await showAll();
    const all = screen.getAllByRole("status");
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(strip());
    expect(strip().className).not.toMatch(/space-y/);
    expect(chip("waiting")).not.toBeNull();
    expect(chip("recovery")).not.toBeNull();
    expect(strip().querySelectorAll("[data-notice]")).toHaveLength(2);
  });

  it("is a single line of at most 40 px: height class, no wrapping, chips truncate", async () => {
    FOUNDER();
    host();
    await showAll();
    const classes = strip().className;
    expect(classes).toMatch(/(^|\s)min-h-9(\s|$)/);
    expect(classes).not.toMatch(/(^|\s)(py-[2-9]|min-h-(1\d|[2-9]\d)|h-(1\d|[2-9]\d)|flex-wrap|items-start)(\s|$)/);
    for (const kind of ["waiting", "recovery"]) {
      expect(chip(kind)?.querySelector(".truncate")).not.toBeNull();
    }
  });

  it("says the age as '2 days', never '3209 minutes'", async () => {
    FOUNDER();
    host();
    await showAll();
    const text = chip("waiting")?.textContent ?? "";
    expect(text).toContain("127");
    expect(text).toContain("2 days");
    expect(strip().textContent).not.toContain("3209");
    expect(strip().textContent).not.toMatch(/minutes/);
    expect(chip("recovery")?.textContent).toContain("2");
  });

  it("says the age in fr and ar too, and keeps the strip's direction", async () => {
    FOUNDER();
    harness.locale = "fr";
    const fr = host();
    await showAll();
    expect(chip("waiting")?.textContent).toContain("2 jours");
    expect(strip().getAttribute("dir")).toBe("ltr");
    fr.unmount();
    harness.locale = "ar";
    resetIngressHealthStore();
    host();
    await showAll();
    expect(chip("waiting")?.textContent).toContain("يومين");
    expect(strip().getAttribute("dir")).toBe("rtl");
  });
});

describe("status strip: Details is a popover that does not push the layout", () => {
  it("is closed by default and the trigger says so", async () => {
    FOUNDER();
    host();
    await showAll();
    expect(panel()).toBeNull();
    expect(detailsButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens outside the strip's flow: strip and siblings keep their classes, nothing is added to the row", async () => {
    FOUNDER();
    host();
    await showAll();
    const hostEl = screen.getByTestId("host");
    const before = Array.from(hostEl.children).map((el) => el.className);
    fireEvent.click(detailsButton());
    await settle(1);
    expect(panel()).not.toBeNull();
    expect(detailsButton().getAttribute("aria-expanded")).toBe("true");
    expect(Array.from(hostEl.children).map((el) => el.className)).toEqual(before);
    expect(hostEl.children).toHaveLength(before.length);
    expect(strip().contains(panel())).toBe(false);
    expect(hostEl.contains(panel())).toBe(false);
    expect(panel()?.closest("[data-radix-popper-content-wrapper]")).not.toBeNull();
  });

  it("closes with Esc and gives the focus back to the Details button", async () => {
    FOUNDER();
    host();
    await showAll();
    fireEvent.click(detailsButton());
    await settle(1);
    expect(panel()).not.toBeNull();
    fireEvent.keyDown(panel() as HTMLElement, { key: "Escape" });
    await settle(1);
    expect(panel()).toBeNull();
    expect(detailsButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(detailsButton());
  });

  it("holds the full sentences, the honest hint and the Review recovery action", async () => {
    FOUNDER();
    host();
    await showAll();
    fireEvent.click(detailsButton());
    await settle(1);
    const text = panel()?.textContent ?? "";
    expect(text).toContain("127 messages are waiting to be received");
    expect(text).toContain("The oldest has waited 2 days.");
    expect(text).toContain("They are not in the inbox yet.");
    expect(text).toContain("2 inbound recovery issues");
    expect(within(panel() as HTMLElement).getByRole("button", { name: "Review recovery" })).toBeTruthy();
    expect(text).not.toMatch(/deliver|livr[ée]|تم التسليم|سُلّمت/i);
  });

  it("Review recovery closes the popover and opens the recovery sheet", async () => {
    FOUNDER();
    host();
    await showAll();
    fireEvent.click(detailsButton());
    await settle(1);
    fireEvent.click(within(panel() as HTMLElement).getByRole("button", { name: "Review recovery" }));
    await settle(1);
    expect(panel()).toBeNull();
    const sheet = screen.getByRole("dialog");
    expect(sheet.textContent).toContain("Inbound recovery");
  });

  it("Reconnect of a stalled link lives in Details and is pressed by the seller only", async () => {
    statusBody = status({ pending: 3, oldestSec: 900, stuck: 2 });
    host();
    await showAll();
    expect(chip("stalled")?.textContent).toContain("Messages may not be arriving");
    expect(onReconnect).not.toHaveBeenCalled();
    fireEvent.click(detailsButton());
    await settle(1);
    fireEvent.click(within(panel() as HTMLElement).getByRole("button", { name: "Reconnect" }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});

describe("status strip: the red 'lost' condition", () => {
  it("is red, visible without opening Details, compact, and still needs the explicit OK", async () => {
    statusBody = status({ lost: 3, pending: 127, oldestSec: 3209 * 60 });
    host();
    await showAll();
    const lost = chip("lost");
    expect(lost).not.toBeNull();
    expect(lost?.getAttribute("data-severity")).toBe("red");
    expect(panel()).toBeNull();
    expect(lost?.textContent).toContain("3 messages could not be received");
    expect(strip().getAttribute("data-severity")).toBe("red");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(strip().className).toMatch(/(^|\s)min-h-9(\s|$)/);
    // First in the row, so a narrow screen cuts the amber chips before the red one.
    expect(strip().querySelector("[data-notice]")).toBe(lost);
    fireEvent.click(within(lost as HTMLElement).getByRole("button", { name: "OK" }));
    expect(chip("lost")).toBeNull();
    expect(chip("waiting")).not.toBeNull();
  });
});

describe("status strip: failed recovery check joins the strip", () => {
  it("shows one more chip, not a third banner, and Check again sits in Details", async () => {
    statusBody = status();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("/api/whatsapp/status")
          ? { ok: true, status: 200, json: async () => statusBody }
          : { ok: false, status: 500, json: async () => ({}) },
      ),
    );
    host();
    await settle(1);
    await settle(15_000);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByTestId("recovery-check-failed")).toBeTruthy();
    expect(strip().contains(screen.getByTestId("recovery-check-failed"))).toBe(true);
    fireEvent.click(detailsButton());
    await settle(1);
    expect(within(panel() as HTMLElement).getByRole("button", { name: "Check again" })).toBeTruthy();
  });
});
