/**
 * @vitest-environment happy-dom
 */
// F-0027 round 2 / F-0024. The Details popover of the status strip says WHY
// messages wait (one plain sentence for the failure code of the oldest stuck
// message, raw code in small text under it) and offers "Copy details" (plain
// text for support, no message content). Real code: the recovery dock, the
// strip, the hook, the copy files, the clipboard helper. Stand-ins: fetch
// (status + recovery list), navigator.clipboard / execCommand, the locale hook,
// fake timers. NOT covered: a real sidecar, a real WebView2 clipboard, a browser.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIngressHealthStore } from "@/hooks/inbox/ingress-health-store";
import { failureReasonText } from "@/lib/inbox/ingress-failure-reason";

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

function status(over: {
  pending?: number;
  oldestSec?: number;
  stuck?: number;
  lost?: number;
  code?: unknown;
}) {
  return {
    status: "connected",
    ingress: {
      spool: {
        pending: over.pending ?? 0,
        oldestPendingSec: over.oldestSec ?? null,
        stuck: over.stuck ?? 0,
        lastFailureCode: over.code === undefined ? null : over.code,
      },
      lost: { sinceStart: { spoolFailed: over.lost ?? 0, noPairedAccount: 0, unsupportedChat: 0 } },
    },
  };
}

const waiting = (code: unknown) => status({ pending: 127, oldestSec: 3209 * 60, code });

async function settle(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}
async function showAll() {
  await settle(1);
  await settle(1_100);
}

const DETAILS = { en: "Details", fr: "Détails", ar: "التفاصيل" } as const;
const WHY = { en: "Why", fr: "Pourquoi", ar: "السبب" } as const;
const COPY = { en: "Copy details", fr: "Copier les détails", ar: "نسخ التفاصيل" } as const;
const COPIED = { en: "Copied", fr: "Copié", ar: "تم النسخ" } as const;
const COULD_NOT = { en: "Could not copy", fr: "Copie impossible", ar: "تعذّر النسخ" } as const;

function host() {
  return render(<WhatsAppIngressRecoveryDock embedded canRetry linkConnected onReconnect={vi.fn()} />);
}
const strip = () => screen.getByTestId("ingress-health-notices");
async function openDetails() {
  fireEvent.click(within(strip()).getByRole("button", { name: DETAILS[harness.locale] }));
  await settle(1);
  return screen.getByTestId("ingress-strip-details-panel");
}
const detailOf = (panel: HTMLElement, kind: string) =>
  panel.querySelector(`[data-detail="${kind}"]`) as HTMLElement | null;

let writeText: ReturnType<typeof vi.fn>;
const clipboardOriginal = Object.getOwnPropertyDescriptor(navigator, "clipboard");
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.locale = "en";
  resetIngressHealthStore();
  statusBody = waiting("APP_INGRESS_TIMEOUT");
  // The recovery list names a contact: it must never reach the copied text.
  recoveryEvents = [
    {
      id: "a",
      status: "dead_letter",
      sourceId: "213791999157@s.whatsapp.net",
      attemptCount: 5,
      lastErrorCode: "http_503",
      providerTimestamp: null,
      createdAt: "2026-11-03T08:00:00.000Z",
      attempts: [],
    },
  ];
  writeText = vi.fn(async () => undefined);
  setClipboard({ writeText });
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
  if (clipboardOriginal) Object.defineProperty(navigator, "clipboard", clipboardOriginal);
  else Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
});

describe("Details: the Why line", () => {
  it("is in Details only: the strip itself stays short and shows no code", async () => {
    host();
    await showAll();
    expect(strip().textContent).not.toContain("APP_INGRESS_TIMEOUT");
    expect(strip().textContent).not.toContain(failureReasonText("en", "APP_INGRESS_TIMEOUT"));
    const panel = await openDetails();
    expect(panel).toBeTruthy();
  });

  it("gives one plain sentence for the code, and the raw code in small text under it", async () => {
    host();
    await showAll();
    const waitingSection = detailOf(await openDetails(), "waiting") as HTMLElement;
    const why = within(waitingSection).getByTestId("ingress-why");
    const raw = within(waitingSection).getByTestId("ingress-why-code");
    expect(why.textContent).toContain("Why");
    expect(why.textContent).toContain(failureReasonText("en", "APP_INGRESS_TIMEOUT"));
    expect(why.textContent).toMatch(/too long/i);
    expect(raw.textContent).toBe("Code: APP_INGRESS_TIMEOUT");
    // Under the sentence, small, and read left to right even in Arabic.
    expect(why.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(raw.className).toMatch(/(^|\s)text-caption(\s|$)/);
    expect(raw.querySelector("bdi")?.getAttribute("dir")).toBe("ltr");
    expect(raw.querySelector("bdi")?.textContent).toBe("APP_INGRESS_TIMEOUT");
    // The raw code is not repeated inside the sentence.
    expect(why.textContent).not.toContain("APP_INGRESS_TIMEOUT");
  });

  it("sits inside the waiting section, next to the age", async () => {
    host();
    await showAll();
    const section = detailOf(await openDetails(), "waiting") as HTMLElement;
    expect(section.textContent).toContain("127 messages are waiting to be received");
    expect(section.textContent).toContain("The oldest has waited 2 days.");
    expect(within(section).getAllByTestId("ingress-why")).toHaveLength(1);
  });

  it("is in the stalled section too, beside the Reconnect button", async () => {
    statusBody = status({ pending: 4, oldestSec: 900, stuck: 2, code: "HTTP_401" });
    host();
    await showAll();
    const section = detailOf(await openDetails(), "stalled") as HTMLElement;
    expect(within(section).getByTestId("ingress-why").textContent).toContain(
      failureReasonText("en", "HTTP_401"),
    );
    expect(within(section).getByTestId("ingress-why-code").textContent).toBe("Code: HTTP_401");
    expect(within(section).getByRole("button", { name: "Reconnect" })).toBeTruthy();
  });

  it("uses the generic sentence and still shows the raw code for a code it does not know", async () => {
    statusBody = waiting("SOMETHING_NEW_FROM_A_LATER_VERSION");
    host();
    await showAll();
    const section = detailOf(await openDetails(), "waiting") as HTMLElement;
    expect(within(section).getByTestId("ingress-why").textContent).toContain(
      failureReasonText("en", "SOMETHING_NEW_FROM_A_LATER_VERSION"),
    );
    expect(within(section).getByTestId("ingress-why-code").textContent).toBe(
      "Code: SOMETHING_NEW_FROM_A_LATER_VERSION",
    );
  });

  it("shows no Why line and no code when the service reports none", async () => {
    statusBody = waiting(null);
    host();
    await showAll();
    const panel = await openDetails();
    expect(within(panel).queryByTestId("ingress-why")).toBeNull();
    expect(within(panel).queryByTestId("ingress-why-code")).toBeNull();
    // The rest of the Details is unchanged.
    expect(panel.textContent).toContain("127 messages are waiting to be received");
  });

  it("never shows a code that is not a short token (it could carry content or a number)", async () => {
    statusBody = waiting("+213 791 99 91 57 called");
    host();
    await showAll();
    const panel = await openDetails();
    expect(within(panel).queryByTestId("ingress-why")).toBeNull();
    expect(panel.textContent).not.toContain("213");
  });

  for (const lang of ["fr", "ar"] as const) {
    it(`speaks ${lang}: label, sentence, direction`, async () => {
      harness.locale = lang;
      host();
      await showAll();
      const panel = await openDetails();
      const why = within(detailOf(panel, "waiting") as HTMLElement).getByTestId("ingress-why");
      expect(why.textContent).toContain(WHY[lang]);
      expect(why.textContent).toContain(failureReasonText(lang, "APP_INGRESS_TIMEOUT"));
      expect(panel.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
      expect(panel.textContent).not.toMatch(/deliver|livr[ée]|تم التسليم|سُلّمت/i);
    });
  }
});

describe("Details: Copy details", () => {
  it("copies plain text with count, age text, code and the recovery count; nothing else", async () => {
    host();
    await showAll();
    const panel = await openDetails();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: COPY.en }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = String(writeText.mock.calls[0]?.[0]);
    expect(copied.split("\n")).toEqual([
      "SahelFlow: message reception",
      "Messages waiting: 127",
      "Oldest has waited: 2 days",
      "Reason code: APP_INGRESS_TIMEOUT",
      "Recovery issues: 1",
    ]);
    // The recovery list names a contact; none of it is copied.
    expect(copied).not.toMatch(/213791999157|@s\.whatsapp\.net|http_503/);
  });

  it("says Copied where the seller can see it, keeps Details open, then goes quiet", async () => {
    host();
    await showAll();
    const panel = await openDetails();
    expect(within(panel).queryByText(COPIED.en)).toBeNull();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: COPY.en }));
      await vi.advanceTimersByTimeAsync(1);
    });
    const feedback = within(panel).getByText(COPIED.en);
    expect(feedback.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByTestId("ingress-strip-details-panel")).not.toBeNull();
    await settle(2_500);
    expect(within(panel).queryByText(COPIED.en)).toBeNull();
  });

  it("falls back to a hidden textarea when navigator.clipboard is not there", async () => {
    setClipboard(undefined);
    let copied = "";
    const exec = vi.fn(() => {
      copied = (document.querySelector("textarea") as HTMLTextAreaElement).value;
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    host();
    await showAll();
    const panel = await openDetails();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: COPY.en }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(copied).toContain("Messages waiting: 127");
    expect(within(panel).getByText(COPIED.en)).toBeTruthy();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("says so, truthfully, when nothing could be copied", async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
    host();
    await showAll();
    const panel = await openDetails();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: COPY.en }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(within(panel).queryByText(COPIED.en)).toBeNull();
    expect(within(panel).getByText(COULD_NOT.en)).toBeTruthy();
  });

  for (const lang of ["fr", "ar"] as const) {
    it(`speaks ${lang}: button, feedback and the copied text`, async () => {
      harness.locale = lang;
      host();
      await showAll();
      const panel = await openDetails();
      await act(async () => {
        fireEvent.click(within(panel).getByRole("button", { name: COPY[lang] }));
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(within(panel).getByText(COPIED[lang])).toBeTruthy();
      const copied = String(writeText.mock.calls[0]?.[0]);
      expect(copied).toContain("APP_INGRESS_TIMEOUT");
      expect(copied).toContain("127");
      expect(copied).not.toContain("Messages waiting");
      // A failure is told in the same language.
      setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
      Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
      await settle(2_500);
      await act(async () => {
        fireEvent.click(within(panel).getByRole("button", { name: COPY[lang] }));
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(within(panel).getByText(COULD_NOT[lang])).toBeTruthy();
    });
  }

  it("is there when only the red 'lost' chip is showing", async () => {
    statusBody = status({ lost: 3 });
    recoveryEvents = [];
    host();
    await showAll();
    const panel = await openDetails();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: COPY.en }));
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(String(writeText.mock.calls[0]?.[0]).split("\n")).toEqual([
      "SahelFlow: message reception",
      "Messages that could not be received: 3",
    ]);
  });
});
