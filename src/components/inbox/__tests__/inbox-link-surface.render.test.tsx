/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InboxLinkSurface } from "@/components/inbox/inbox-link-surface";
import { getInboxCarnetRuntimeTranslation } from "@/lib/i18n/inbox-carnet-runtime";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import arJson from "@/lib/i18n/locales/ar.json";
import enJson from "@/lib/i18n/locales/en.json";
import frJson from "@/lib/i18n/locales/fr.json";
import { render } from "@/test-utils/render";

type L = "ar" | "fr" | "en";
const harness = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));
const CATALOGS: Record<L, Record<string, string>> = {
  ar: arJson as Record<string, string>,
  fr: frJson as Record<string, string>,
  en: enJson as Record<string, string>,
};

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      CATALOGS[harness.locale][key] ??
      getInboxCarnetRuntimeTranslation(harness.locale, key) ??
      key,
    locale: harness.locale,
    dir: harness.locale === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("@/components/inbox/whatsapp-pairing-dialog", () => ({
  WhatsAppPairingDialog: () => <button type="button">pair-stub</button>,
}));
vi.mock("@/components/inbox/whatsapp-ingress-recovery-dock", () => ({
  WhatsAppIngressRecoveryDock: () => null,
}));

const BAD_NEWS: Record<L, RegExp> = {
  en: /unavailable|does not answer|not responding/gi,
  fr: /indisponible|ne répond pas/gi,
  ar: /غير متاح|لا تستجيب/g,
};
const KINDS = {
  connected: { status: "connected", wsOpen: true, reachable: true, online: true },
  connecting: { status: "connecting", wsOpen: false, reachable: true, online: true },
  disconnected: { status: "disconnected", wsOpen: false, reachable: true, online: true },
  offline: { status: "disconnected", wsOpen: false, reachable: true, online: false },
  error: { status: null, wsOpen: false, reachable: false, online: true },
  "unofficial-only": { status: "qr", wsOpen: false, reachable: true, online: true },
} as const;

function workspace(locale: L, k: (typeof KINDS)[keyof typeof KINDS]) {
  return {
    locale,
    t: (key: string) =>
      CATALOGS[locale][key] ?? getInboxCarnetRuntimeTranslation(locale, key) ?? key,
    copy: (key: Parameters<typeof getInboxWorkspaceCopy>[1]) => getInboxWorkspaceCopy(locale, key),
    transport: { reachable: k.reachable, status: k.status, user: null, wsOpen: k.wsOpen },
    dataDegraded: false,
    reconnect: vi.fn(),
    refreshChats: vi.fn(),
    refreshQr: vi.fn(),
    canManageWhatsApp: true,
  } as never;
}

beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))));
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

describe("one connection notice for the whole inbox DOM", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    for (const [kind, k] of Object.entries(KINDS)) {
      it(`${locale} / ${kind}: one tag, at most one banner, bad news at most once, unofficial line once`, () => {
        harness.locale = locale;
        Object.defineProperty(window.navigator, "onLine", { value: k.online, configurable: true });
        const { container } = render(
          <InboxLinkSurface workspace={workspace(locale, k)} canViewIngress canRetryIngress />,
        );
        expect(container.querySelectorAll("[data-inbox-link-tag]")).toHaveLength(1);
        const banners = container.querySelectorAll("[data-inbox-link-banner]");
        expect(banners.length).toBeLessThanOrEqual(1);
        const blocked = kind !== "connected" && kind !== "connecting";
        expect(banners.length).toBe(blocked ? 1 : 0);
        expect(container.querySelector("[data-inbox-link-tag]")?.getAttribute("data-inbox-link-kind")).toBe(kind);
        const text = document.body.textContent ?? "";
        expect((text.match(BAD_NEWS[locale]) ?? []).length).toBeLessThanOrEqual(1);
        const body = CATALOGS[locale]["inbox.unofficialNoticeBody"]!;
        expect(text.split(body).length - 1).toBe(1);
        expect(container.querySelectorAll('[role="alert"]').length).toBeLessThanOrEqual(1);
      });
    }
  }
  it("the banner never promises more than the code does (offline prints no 'saved' sentence)", () => {
    harness.locale = "en";
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    render(<InboxLinkSurface workspace={workspace("en", KINDS.offline)} canViewIngress={false} canRetryIngress={false} />);
    expect(screen.queryByText(/saved on this computer/i)).toBeNull();
  });
  it("disconnected banner states the verified draft fact once", () => {
    harness.locale = "en";
    render(<InboxLinkSurface workspace={workspace("en", KINDS.disconnected)} canViewIngress={false} canRetryIngress={false} />);
    expect(screen.getAllByText(/saved on this computer/i)).toHaveLength(1);
  });
});
