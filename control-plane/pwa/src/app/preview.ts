import { isLocale } from "../i18n";
import type { PairFailure, PairStep } from "../pair/flow";
import type { Projection } from "../today/projection";
import type { ScreenId, Theme, View, ViewState } from "../views/view";

// ?screen=today&state=stale&lang=fr&theme=dark lets every state be looked at
// without a backend. Fixtures only; they never reach the network or storage.
const SCREENS: readonly ScreenId[] = ["welcome", "pair", "today", "settings", "lock"];
const STATES: readonly ViewState[] = ["loading", "empty", "error", "stale", "offline", "ready", "expired", "keygen", "waiting"];
const HOUR = 3_600_000;

export function fixtureProjection(now: number, ageMs: number, zero = false): Projection {
  const week = [3, 5, 2, 8, 6, 4, zero ? 0 : 9].map((orders, i) => ({ at: now - (6 - i) * 24 * HOUR, orders: zero ? 0 : orders }));
  return { generatedAt: now - ageMs, newOrders: zero ? 0 : 9, toConfirm: zero ? 0 : 4, inDelivery: zero ? 0 : 12, codToCollectDzd: zero ? 0 : 187_500, week };
}
export function applyPreview(base: View, search: string): View {
  const q = new URLSearchParams(search);
  const screen = SCREENS.find((s) => s === q.get("screen")) ?? base.screen;
  const state = STATES.find((s) => s === q.get("state")) ?? null;
  const lang = q.get("lang"); const theme = q.get("theme");
  let v: View = { ...base, screen, locale: isLocale(lang) ? lang : base.locale, theme: theme === "light" || theme === "dark" || theme === "system" ? (theme as Theme) : base.theme };
  if (q.get("ios") === "1") v = { ...v, ios: true, canInstall: false };
  if (!state) return v;
  v = { ...v, state, online: state !== "offline" };
  const failure: PairFailure = "rejected"; const step: PairStep = "encryption";
  switch (screen) {
    case "welcome": return { ...v, updateReady: state === "stale", canInstall: v.ios ? false : state === "ready" || state === "empty" };
    case "pair": return { ...v, step, failure, fingerprint: state === "waiting" ? "A1B2-C3D4-E5F6-7788" : null };
    case "today": {
      const age = state === "ready" ? 2 * 60_000 : state === "expired" ? 30 * HOUR : 3 * HOUR;
      return { ...v, projection: state === "loading" || state === "error" ? null : fixtureProjection(v.now, age, state === "empty") };
    }
    case "settings": return { ...v, updateReady: state === "stale", removeError: state === "error" ? "caches" : null };
    case "lock": {
      const notice = state === "error" ? { kind: "wrong", left: 3 } as const : state === "stale" ? { kind: "wait", seconds: 24 } as const : state === "loading" ? { kind: "checking" } as const : null;
      return { ...v, lockMode: state === "empty" ? "set" : "enter", lockNotice: notice };
    }
  }
}
