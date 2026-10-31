// Today's numbers: the desktop writes order status as a plain string ("pending" = waiting for confirmation;
// canonical-file-import.ts / canonical-fulfillment.ts). Exact totals (stats.*) win; without them the figure is a FLOOR
// counted from the few recent orders and the view says "at least".
import { describe, expect, it } from "vitest";
import { LOCALES, t } from "../src/i18n";
import { parseDashboard } from "../src/today/relay-source";
import { renderApp, type View } from "../src/views/view";

const AT = Date.UTC(2026, 9, 31, 8, 0);
const body = (stats: Record<string, unknown>, recent: unknown[] = []) => ({ stats: { ordersToday: 4, ...stats }, recentOrders: recent, analytics: { revenueSeries: [] } });
const P = { status: "pending" };
const view = (locale: View["locale"], payload: unknown): View => {
  const projection = parseDashboard(payload, AT);
  if (!projection) throw new Error("setup: payload");
  return { locale, theme: "light", screen: "today", state: "ready", now: AT, online: true, updateReady: false, canInstall: false, installed: false, ios: false, projection, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false, version: "0.1.0", confirmRemove: false, removeError: null, removed: false };
};

describe("parseDashboard: orders waiting", () => {
  it("counts only the exact status 'pending' among the recent orders, and says it is a floor", () => {
    const got = parseDashboard(body({}, [P, { status: "Pending" }, { status: "PENDING" }, { status: " pending" }, { status: "confirmed" }, { status: "draft" }, { status: "shipped" }, null, 5]), AT);
    expect(got).toMatchObject({ toConfirm: 1, toConfirmIsFloor: true });
  });
  it("prefers stats.ordersWaiting when present (even 0, even when recent orders say more) and then it is exact", () => {
    expect(parseDashboard(body({ ordersWaiting: 37 }, [P, P]), AT)).toMatchObject({ toConfirm: 37, toConfirmIsFloor: false });
    expect(parseDashboard(body({ ordersWaiting: 0 }, [P, P, P]), AT)).toMatchObject({ toConfirm: 0, toConfirmIsFloor: false });
  });
  it("ignores an unusable ordersWaiting (text, negative, fractional, NaN) and falls back to the floor", () => {
    for (const bad of ["3", -1, 2.5, Number.NaN, null, true]) expect(parseDashboard(body({ ordersWaiting: bad }, [P, P]), AT)).toMatchObject({ toConfirm: 2, toConfirmIsFloor: true });
  });
});
describe("parseDashboard: cash on delivery and held WhatsApp messages", () => {
  it("takes whole non-negative DZD from stats.codToCollectDzd; absent or unusable stays a dash (NaN)", () => {
    expect(parseDashboard(body({ codToCollectDzd: 125000 }), AT)?.codToCollectDzd).toBe(125000);
    expect(parseDashboard(body({ codToCollectDzd: 0 }), AT)?.codToCollectDzd).toBe(0);
    for (const bad of [undefined, -5, 12.5, "100", null]) expect(Number.isNaN(parseDashboard(body({ codToCollectDzd: bad }), AT)?.codToCollectDzd ?? 0)).toBe(true);
  });
  it("whatsappHeld: a number (0 too) is kept, absent is null", () => {
    expect(parseDashboard(body({ whatsappHeld: 0 }), AT)?.whatsappHeld).toBe(0);
    expect(parseDashboard(body({ whatsappHeld: 6 }), AT)?.whatsappHeld).toBe(6);
    expect(parseDashboard(body({}), AT)?.whatsappHeld).toBeNull();
  });
});
describe("Today view: 'at least' and dashes", () => {
  for (const locale of LOCALES) {
    it(`${locale}: a floor reads 'at least N'; an exact total does not; absent figures are dashes`, () => {
      const floor = renderApp(view(locale, body({}, [P, P])));
      expect(floor).toContain(t(locale, "today.atLeast", { count: 2 }));
      expect(t(locale, "today.atLeast", { count: 2 })).not.toBe("today.atLeast");
      const exact = renderApp(view(locale, body({ ordersWaiting: 2, whatsappHeld: 1, codToCollectDzd: 5000 }, [P, P])));
      expect(exact).not.toContain(t(locale, "today.atLeast", { count: 2 }));
      expect(exact).not.toContain("—");
      const bare = renderApp(view(locale, body({})));
      expect(bare.match(/<dd class="num">—<\/dd>/g)?.length).toBe(2);
      expect(bare).toContain(t(locale, "today.whatsappHeld"));
    });
  }
});
