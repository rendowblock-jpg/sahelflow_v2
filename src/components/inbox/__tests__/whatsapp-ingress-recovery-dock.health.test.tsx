/**
 * @vitest-environment happy-dom
 */
// S05a-03 / S05a-10. The recovery dock shows what the sidecar could not hand
// over, in ar (RTL), fr and en, and never says "delivered". F-0027: the notices
// are now chips of ONE status strip; the full sentence and its hint are in the
// Details popover (same words as before). Real code: the dock, the strip, the
// hook, the copy file. Stand-ins: fetch (status +
// inbound), the locale hook, fake timers. NOT covered: a real sidecar, a browser.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let locale: "ar" | "fr" | "en" = "en";
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ locale }) }));

import { WhatsAppIngressRecoveryDock } from "../whatsapp-ingress-recovery-dock";

let statusBody: unknown;
let statusCalls = 0;

function ingress(over: { lost?: object; spool?: object } = {}) {
  return {
    status: "connected",
    ingress: {
      spool: { pending: 0, oldestPendingSec: null, stuck: 0, ...over.spool },
      lost: { sinceStart: { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0, ...over.lost } },
    },
  };
}

async function settle(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}

// React renders the new status when act() ends, so the one-second settle timer
// starts after the first settle: the answer arrives, then the second runs out.
async function settleAndShow() {
  await settle(1);
  await settle(1_100);
}

beforeEach(() => {
  vi.useFakeTimers();
  locale = "en";
  statusCalls = 0;
  statusBody = ingress();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/whatsapp/status")) {
        statusCalls += 1;
        return { ok: true, status: 200, json: async () => statusBody };
      }
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DETAILS = { en: "Details", fr: "Détails", ar: "التفاصيل" } as const;

// `chip` = what the strip itself shows; en/fr/ar = the full sentence, now in Details.
const CASES = [
  {
    state: "lost",
    body: () => ingress({ lost: { spoolFailed: 2, noPairedAccount: 1 } }),
    chip: {
      en: "3 messages could not be received",
      fr: "3 messages n’ont pas pu être reçus",
      ar: "رسائل تعذّر استلامها: 3",
    },
    en: "3 messages could not be received",
    fr: "3 messages n’ont pas pu être reçus",
    ar: "رسائل تعذّر استلامها: 3",
  },
  {
    state: "waiting",
    body: () => ingress({ spool: { pending: 2, oldestPendingSec: 660 } }),
    chip: {
      en: "2 messages waiting",
      fr: "2 messages en attente",
      ar: "رسائل تنتظر الاستلام: 2",
    },
    en: "2 messages are waiting to be received",
    fr: "2 messages attendent d’être reçus",
    ar: "رسائل تنتظر الاستلام: 2",
  },
  {
    state: "unsupported",
    body: () => ingress({ lost: { unsupportedChat: 4 } }),
    chip: {
      en: "4 group messages skipped",
      fr: "4 messages de groupe ignorés",
      ar: "رسائل مجموعات تم تخطيها: 4",
    },
    en: "4 messages from groups or broadcast lists were skipped",
    fr: "4 messages de groupes ou de listes de diffusion ont été ignorés",
    ar: "رسائل من مجموعات أو قوائم بث تم تخطيها: 4",
  },
] as const;

describe("recovery dock: reception notices", () => {
  for (const item of CASES) {
    for (const lang of ["en", "fr", "ar"] as const) {
      it(`${item.state} in ${lang}${lang === "ar" ? " (RTL)" : ""}`, async () => {
        locale = lang;
        statusBody = item.body();
        render(<WhatsAppIngressRecoveryDock />);
        await settleAndShow();
        const region = screen.getByTestId("ingress-health-notices");
        expect(region.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
        expect(region.querySelector(`[data-notice="${item.state}"]`)).not.toBeNull();
        expect(region.textContent).toContain(item.chip[lang]);
        // The full sentence is in Details, which starts closed.
        expect(screen.queryByTestId("ingress-strip-details-panel")).toBeNull();
        fireEvent.click(within(region).getByRole("button", { name: DETAILS[lang] }));
        await settle(1);
        const panel = screen.getByTestId("ingress-strip-details-panel");
        expect(panel.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
        expect(panel.textContent).toContain(item[lang]);
        expect(`${region.textContent}${panel.textContent}`).not.toMatch(/deliver|livr[ée]|تم التسليم|سُلّمت/i);
      });
    }
  }

  it("waiting names the age of the oldest message", async () => {
    statusBody = ingress({ spool: { pending: 2, oldestPendingSec: 660 } });
    render(<WhatsAppIngressRecoveryDock />);
    await settleAndShow();
    expect(screen.getByTestId("ingress-health-notices").textContent).toContain("11 min");
  });

  it("one lost message uses the singular", async () => {
    statusBody = ingress({ lost: { spoolFailed: 1 } });
    render(<WhatsAppIngressRecoveryDock />);
    await settleAndShow();
    expect(screen.getByTestId("ingress-health-notices").textContent).toContain(
      "1 message could not be received",
    );
  });

  it("unreachable shows after the helper was seen and then stops answering, in all three languages", async () => {
    for (const [lang, text] of [
      ["en", "Reception cannot be checked right now"],
      ["fr", "Impossible de vérifier la réception pour le moment"],
      ["ar", "تعذّر التحقق من الاستلام الآن"],
    ] as const) {
      locale = lang;
      statusBody = ingress();
      const view = render(<WhatsAppIngressRecoveryDock />);
      await settleAndShow();
      expect(screen.queryByTestId("ingress-health-notices")).toBeNull();
      statusBody = { status: "disconnected", sidecarReachable: false };
      await settle(15_000);
      await settle(1_100);
      expect(screen.getByTestId("ingress-health-notices").textContent).toContain(text);
      view.unmount();
    }
  });

  it("a helper that was never reachable (new seller) shows no notice", async () => {
    statusBody = { status: "disconnected", sidecarReachable: false };
    render(<WhatsAppIngressRecoveryDock />);
    await settle(20_000);
    expect(screen.queryByTestId("ingress-health-notices")).toBeNull();
  });

  it("shows nothing for zeros, or for a sidecar that sends no ingress block", async () => {
    render(<WhatsAppIngressRecoveryDock />);
    await settleAndShow();
    expect(screen.queryByTestId("ingress-health-notices")).toBeNull();
    statusBody = { status: "connected" };
    await settle(16_000);
    expect(screen.queryByTestId("ingress-health-notices")).toBeNull();
  });

  it("does not show a notice before it has stood for one second", async () => {
    statusBody = ingress({ lost: { spoolFailed: 1 } });
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1); // the status answer has arrived
    await settle(900);
    expect(screen.queryByTestId("ingress-health-notices")).toBeNull();
    await settle(200);
    expect(screen.queryByTestId("ingress-health-notices")).not.toBeNull();
  });

  it("asks for the status every 15 s while visible and not at all while hidden", async () => {
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    expect(statusCalls).toBe(1);
    await settle(15_000);
    expect(statusCalls).toBe(2);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await settle(60_000);
    expect(statusCalls).toBe(2);
  });
});
