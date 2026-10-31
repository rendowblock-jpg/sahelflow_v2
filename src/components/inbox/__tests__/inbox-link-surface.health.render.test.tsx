/**
 * @vitest-environment happy-dom
 */
// w211 / S05a-07, S05a-10. A link that says "connected" but is silent: the grey
// note on the chip (Q4), the amber "stalled" notice with a Reconnect button the
// seller presses (Q5), the red "could not be saved" notice that stays until OK
// (Q1), and the dock reading failed spool files. Real code: InboxLinkSurface,
// the dock, the notices, the hook, the store, the copy. Stand-ins: fetch, the
// locale hook, the pairing dialog, fake timers. NOT covered: a real sidecar.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InboxLinkSurface } from "@/components/inbox/inbox-link-surface";
import { WhatsAppIngressRecoveryDock } from "@/components/inbox/whatsapp-ingress-recovery-dock";
import { resetIngressHealthStore } from "@/hooks/inbox/ingress-health-store";

const harness = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("@/components/inbox/whatsapp-pairing-dialog", () => ({
  WhatsAppPairingDialog: () => <button type="button">pair-stub</button>,
}));

const H = 3_600_000;
let statusBody: unknown;

function body(over: {
  spool?: Record<string, unknown>;
  lost?: Record<string, unknown>;
  lastCustomerAgoMs?: number | null;
} = {}) {
  const ago = over.lastCustomerAgoMs;
  return {
    status: "connected",
    ingress: {
      v: 1,
      spool: {
        pending: 0, oldestPendingSec: null, retrying: 0, stuck: 0,
        heldByApp: 0, quarantined: 0, unreadable: 0, lastFailureCode: null, ...over.spool,
      },
      lost: { sinceStart: { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0, ...over.lost } },
      inbound: {
        lastSpooledAt: ago === null || ago === undefined ? null : new Date(Date.now() - ago).toISOString(),
        lastCommittedAt: null,
      },
    },
  };
}

function makeWorkspace(status: string | null, wsOpen: boolean) {
  const reconnect = vi.fn();
  const workspace = {
    locale: harness.locale,
    t: (key: string) => key,
    copy: (key: string) => key,
    transport: { reachable: true, status, user: null, wsOpen },
    dataDegraded: false,
    reconnect,
    refreshChats: vi.fn(),
    refreshQr: vi.fn(),
    canManageWhatsApp: true,
  } as never;
  return { workspace, reconnect };
}

async function settle(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}
// The answer arrives, then the one-second settle of the notices runs out.
async function showAll() {
  await settle(1);
  await settle(1_100);
}
async function nextPoll() {
  await settle(15_000);
  await settle(1_100);
}

const note = () => document.querySelector("[data-inbox-link-silent-note]");
const region = () => screen.queryByTestId("ingress-health-notices");
const noticeOf = (kind: string) => region()?.querySelector(`[data-notice="${kind}"]`) ?? null;

function surface(status: string | null, wsOpen: boolean) {
  const { workspace, reconnect } = makeWorkspace(status, wsOpen);
  const ui = <InboxLinkSurface workspace={workspace} canViewIngress canRetryIngress={false} />;
  return { ui, reconnect };
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.locale = "en";
  resetIngressHealthStore();
  statusBody = body();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).startsWith("/api/whatsapp/status") ? statusBody : { events: [] }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("grey note on the connection chip (Q4)", () => {
  it("shows at 7 h when connected, and it is only a note: no notice, nothing amber", async () => {
    statusBody = body({ lastCustomerAgoMs: 7 * H });
    render(surface("connected", true).ui);
    await showAll();
    expect(note()?.textContent).toBe("Last customer message: 7 h ago");
    expect(region()).toBeNull();
  });
  it("does not show at 5 h", async () => {
    statusBody = body({ lastCustomerAgoMs: 5 * H });
    render(surface("connected", true).ui);
    await showAll();
    expect(note()).toBeNull();
  });
  it("does not show when the link is disconnected, even after 7 h", async () => {
    statusBody = body({ lastCustomerAgoMs: 7 * H });
    render(surface("disconnected", false).ui);
    await showAll();
    expect(note()).toBeNull();
  });
  it("does not show when the answer has no block (older sidecar)", async () => {
    statusBody = { status: "connected" };
    render(surface("connected", true).ui);
    await showAll();
    expect(note()).toBeNull();
  });
  it("says days from 48 h on", async () => {
    statusBody = body({ lastCustomerAgoMs: 72 * H });
    render(surface("connected", true).ui);
    await showAll();
    expect(note()?.textContent).toBe("Last customer message: 3 d ago");
  });
  it("speaks fr and ar", async () => {
    statusBody = body({ lastCustomerAgoMs: 7 * H });
    harness.locale = "fr";
    const fr = render(surface("connected", true).ui);
    await showAll();
    expect(note()?.textContent).toBe("Dernier message client : il y a 7 h");
    fr.unmount();
    harness.locale = "ar";
    render(surface("connected", true).ui);
    await showAll();
    expect(note()?.textContent).toBe("آخر رسالة من زبون: قبل 7 ساعات");
  });
});

describe("amber stalled notice with a Reconnect the seller presses (Q5)", () => {
  const stalled = () => body({ spool: { pending: 2, stuck: 1, oldestPendingSec: 30 } });

  it("renders without reconnecting; one press = one reconnect", async () => {
    statusBody = stalled();
    const { ui, reconnect } = surface("connected", true);
    render(ui);
    await showAll();
    await nextPoll();
    expect(noticeOf("stalled")).not.toBeNull();
    expect(noticeOf("stalled")?.textContent).toContain("Messages may not be arriving");
    expect(reconnect).not.toHaveBeenCalled();
    const button = within(noticeOf("stalled") as HTMLElement).getByRole("button", { name: "Reconnect" });
    fireEvent.click(button);
    expect(reconnect).toHaveBeenCalledTimes(1);
    fireEvent.click(button);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });
  it("is not shown while the link is down (the disconnected notice speaks)", async () => {
    statusBody = stalled();
    render(surface("disconnected", false).ui);
    await showAll();
    expect(noticeOf("stalled")).toBeNull();
  });
  it("speaks fr and ar", async () => {
    statusBody = stalled();
    for (const [lang, title, button] of [
      ["fr", "Les messages n’arrivent peut-être pas", "Reconnecter"],
      ["ar", "قد لا تصل الرسائل", "إعادة الاتصال"],
    ] as const) {
      harness.locale = lang;
      const view = render(surface("connected", true).ui);
      await showAll();
      expect(noticeOf("stalled")?.textContent).toContain(title);
      expect(within(noticeOf("stalled") as HTMLElement).getByRole("button", { name: button })).toBeTruthy();
      view.unmount();
    }
  });
});

describe("red notice: messages the app could not save (Q1)", () => {
  it("is red, survives re-render and later polls, goes on OK, and returns when the count grows", async () => {
    statusBody = body({ lost: { spoolFailed: 2 } });
    const { ui } = surface("connected", true);
    const view = render(ui);
    await showAll();
    expect(noticeOf("lost")?.getAttribute("data-severity")).toBe("red");
    view.rerender(ui);
    await nextPoll();
    expect(noticeOf("lost")).not.toBeNull();
    fireEvent.click(within(noticeOf("lost") as HTMLElement).getByRole("button", { name: "OK" }));
    expect(noticeOf("lost")).toBeNull();
    await nextPoll();
    expect(noticeOf("lost")).toBeNull();
    statusBody = body({ lost: { spoolFailed: 3 } });
    await nextPoll();
    expect(noticeOf("lost")).not.toBeNull();
  });
  it("an acknowledged notice stays gone when the inbox is left and opened again", async () => {
    statusBody = body({ lost: { spoolFailed: 2 } });
    const first = render(surface("connected", true).ui);
    await showAll();
    fireEvent.click(within(noticeOf("lost") as HTMLElement).getByRole("button", { name: "OK" }));
    first.unmount();
    render(surface("connected", true).ui);
    await showAll();
    expect(noticeOf("lost")).toBeNull();
  });
  it("after a sidecar restart (count back to 0) a new loss shows again", async () => {
    statusBody = body({ lost: { spoolFailed: 2 } });
    render(surface("connected", true).ui);
    await showAll();
    fireEvent.click(within(noticeOf("lost") as HTMLElement).getByRole("button", { name: "OK" }));
    statusBody = body();
    await nextPoll();
    statusBody = body({ lost: { spoolFailed: 1 } });
    await nextPoll();
    expect(noticeOf("lost")).not.toBeNull();
  });
  it("has an OK in fr and ar", async () => {
    statusBody = body({ lost: { spoolFailed: 2 } });
    for (const [lang, ok] of [["fr", "OK"], ["ar", "حسناً"]] as const) {
      harness.locale = lang;
      resetIngressHealthStore();
      const view = render(surface("connected", true).ui);
      await showAll();
      expect(within(noticeOf("lost") as HTMLElement).getByRole("button", { name: ok })).toBeTruthy();
      view.unmount();
    }
  });
});

describe("recovery dock reads failed spool files from the block (S05a-10)", () => {
  it("quarantined and unreadable files are shown, not 'all clear'", async () => {
    statusBody = body({ spool: { quarantined: 2, unreadable: 1 } });
    render(<WhatsAppIngressRecoveryDock />);
    await showAll();
    expect(noticeOf("lost")?.textContent).toContain("3 messages could not be received");
  });
  it("shows nothing when everything is clear (Q7)", async () => {
    render(<WhatsAppIngressRecoveryDock />);
    await showAll();
    expect(region()).toBeNull();
  });
});
