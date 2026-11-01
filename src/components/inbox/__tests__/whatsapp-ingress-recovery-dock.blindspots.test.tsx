/**
 * @vitest-environment happy-dom
 */
// The recovery dock must not look "all clear" when it could not look. Real
// code: the dock, its notices, the status hook, the copy files. Stand-ins:
// fetch (status + inbound), the locale hook, fake timers. NOT covered: a real
// database, a real sidecar, a browser.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let locale: "ar" | "fr" | "en" = "en";
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ locale }) }));

import { WhatsAppIngressRecoveryDock } from "../whatsapp-ingress-recovery-dock";

type InboundAnswer = "ok" | "http500" | "http403" | "throws";
let inbound: InboundAnswer = "ok";
let inboundUrls: string[] = [];
let statusBody: unknown = { status: "connected" };

const TITLE = {
  en: "Messages needing attention cannot be checked right now",
  fr: "Impossible de vérifier les messages à traiter pour le moment",
  ar: "تعذّر التحقق من الرسائل التي تحتاج إلى مراجعة الآن",
} as const;

async function settle(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}

beforeEach(() => {
  vi.useFakeTimers();
  locale = "en";
  inbound = "ok";
  inboundUrls = [];
  statusBody = { status: "connected" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/whatsapp/status")) {
        return { ok: true, status: 200, json: async () => statusBody };
      }
      inboundUrls.push(String(url));
      if (inbound === "throws") throw new TypeError("network down");
      if (inbound === "http500") return { ok: false, status: 500, json: async () => ({}) };
      if (inbound === "http403") return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recovery dock: blind spots", () => {
  it("asks for the problem states only, not the newest events of any state", async () => {
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    const first = inboundUrls[0];
    expect(first).toBeDefined();
    const params = new URL(first ?? "", "http://localhost").searchParams;
    expect(params.get("status")).toBe("retrying,quarantined,dead_letter");
  });

  for (const lang of ["en", "fr", "ar"] as const) {
    it(`a check that fails twice in a row says so in ${lang}`, async () => {
      locale = lang;
      inbound = "http500";
      render(<WhatsAppIngressRecoveryDock />);
      await settle(1);
      expect(screen.queryByTestId("recovery-check-failed")).toBeNull();
      await settle(15_000);
      const notice = screen.getByTestId("recovery-check-failed");
      expect(notice.textContent).toContain(TITLE[lang]);
      expect(notice.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
    });
  }

  it("a network error counts as a failed check too", async () => {
    inbound = "throws";
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    await settle(15_000);
    expect(screen.getByTestId("recovery-check-failed")).toBeTruthy();
  });

  it("one failed check followed by a good one shows nothing", async () => {
    inbound = "http500";
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    inbound = "ok";
    await settle(15_000);
    await settle(15_000);
    expect(screen.queryByTestId("recovery-check-failed")).toBeNull();
  });

  it("the line goes away by itself when the check works again", async () => {
    inbound = "http500";
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    await settle(15_000);
    expect(screen.getByTestId("recovery-check-failed")).toBeTruthy();
    inbound = "ok";
    await settle(15_000);
    expect(screen.queryByTestId("recovery-check-failed")).toBeNull();
  });

  it("the button checks again at once", async () => {
    inbound = "http500";
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    await settle(15_000);
    const before = inboundUrls.length;
    inbound = "ok";
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await settle(1);
    expect(inboundUrls.length).toBe(before + 1);
    expect(screen.queryByTestId("recovery-check-failed")).toBeNull();
  });

  it("not being allowed to list events is not a failure and shows no line", async () => {
    inbound = "http403";
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    await settle(30_000);
    expect(screen.queryByTestId("recovery-check-failed")).toBeNull();
  });

  it("not being allowed to list events still shows the reception notices", async () => {
    inbound = "http403";
    statusBody = {
      status: "connected",
      ingress: { lost: { sinceStart: { spoolFailed: 3, noPairedAccount: 0 } } },
    };
    render(<WhatsAppIngressRecoveryDock />);
    await settle(1);
    await settle(1_100);
    expect(screen.getByTestId("ingress-health-notices").textContent).toContain(
      "3 messages could not be received",
    );
  });
});
