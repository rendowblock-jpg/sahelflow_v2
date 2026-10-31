import { supportsEd25519 } from "../../../../src/lib/connected-platform/web";
import { DEFAULT_LOCALE, dirOf, isLocale, type Locale } from "../i18n";
import { createPinRecord, verifyPin, type PinRecord } from "../lock/pin";
import { afterAttempt, attemptStatus, initialState, isValidPin, onHidden, onVisible, type LockState } from "../lock/state";
import { watchApproval } from "../poll/approval";
import { runPairing, takePairingLink, type PairingTransport } from "../pair/flow";
import { createKeygen } from "../pair/keygen";
import { createFetchTransport } from "../pair/transport";
import { openDb, saveDeviceKeys, type Db } from "../storage/idb";
import { wipeAll } from "../storage/wipe";
import type { UpdateController } from "../sw/update";
import { createRelayClient } from "../today/relay-source";
import { freshness, type Projection, type ProjectionSource } from "../today/projection";
import { renderApp, type ScreenId, type Theme, type View } from "../views/view";
import { applyPreview } from "./preview";

declare const __APP_VERSION__: string;
declare const __RELAY_URL__: string;
type InstallEvent = Event & { prompt(): Promise<void> };
type LockRow = Readonly<{ pin: PinRecord; failures: number; waitUntil: number }>;
export type AppOptions = Readonly<{ source?: ProjectionSource; transport?: PairingTransport }>;

const SCREENS: readonly ScreenId[] = ["welcome", "pair", "today", "settings", "lock"];
const store = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function startApp(root: HTMLElement, options: AppOptions = {}): Readonly<{ attachUpdates(c: UpdateController): void }> {
  const relay = createRelayClient({ baseUrl: __RELAY_URL__, getDb: () => getDb() });
  const source: ProjectionSource = options.source ?? relay.source;
  const transport = options.transport ?? createFetchTransport({ baseUrl: __RELAY_URL__ });
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const savedLocale = store.get("sf.locale"); const savedTheme = store.get("sf.theme");
  const qScreen = new URLSearchParams(location.search).get("screen");
  let view: View = {
    locale: isLocale(savedLocale) ? savedLocale : DEFAULT_LOCALE,
    theme: savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system",
    screen: SCREENS.find((s) => s === qScreen) ?? "welcome", state: "empty", now: Date.now(), online: navigator.onLine,
    updateReady: false, canInstall: false, installed: standalone, ios: /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone,
    projection: null, step: null, fingerprint: null, failure: null, lockMode: "enter", lockNotice: null, hasLock: false,
    version: __APP_VERSION__, confirmRemove: false, removeError: null, removed: false,
  };
  // Old WebViews without Ed25519 get the typed "update your browser" screen now, not a failure after the scan.
  void supportsEd25519().then((ok) => { if (!ok && view.screen === "welcome") set({ state: "error" }); }).catch(() => undefined);
  const preview = new URLSearchParams(location.search).has("state");
  let previewOn = preview;
  let dbPromise: Promise<Db> | null = null;
  const getDb = (): Promise<Db> => (dbPromise ??= openDb(indexedDB));
  let installEvent: InstallEvent | null = null;
  let updates: UpdateController | null = null;
  let lockState: LockState = { phase: "unset" }; let lockRow: LockRow | null = null; let pendingPin = ""; let returnTo: ScreenId = "welcome";
  let link: ReturnType<typeof takePairingLink> = { kind: "none" };
  let watcher: Readonly<{ stop(): void }> | null = null;

  const derive = (v: View): View => {
    if (v.screen !== "today") return v;
    const p = v.projection;
    if (v.state === "error" || v.state === "loading") return v;
    if (!p) return { ...v, state: "empty" };
    const f = freshness(p.generatedAt, v.now);
    return { ...v, state: f === "expired" ? "expired" : !v.online ? "offline" : f === "fresh" ? "ready" : "stale" };
  };
  const paint = (): void => {
    const v = previewOn ? applyPreview(view, location.search) : derive(view);
    document.documentElement.lang = v.locale; document.documentElement.dir = dirOf(v.locale);
    document.documentElement.dataset.theme = v.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : v.theme;
    root.innerHTML = renderApp(v);
    if (v.screen === "lock") root.querySelector<HTMLInputElement>("#pin")?.focus();
  };
  const set = (patch: Partial<View>, focusMain = false): void => {
    view = { ...view, ...patch, now: Date.now() }; paint();
    if (focusMain) root.querySelector<HTMLElement>("#main")?.focus();
  };
  const go = (screen: ScreenId, patch: Partial<View> = {}): void => {
    previewOn = false;
    history.pushState(null, "", `/?screen=${screen}`);
    set({ screen, state: screen === "today" ? "empty" : "empty", confirmRemove: false, removed: false, removeError: null, ...patch }, true);
    if (screen === "today") void loadToday();
  };
  async function loadToday(): Promise<void> {
    if (!options.source) await relay.poll().catch(() => null);
    const r = await source.load().catch(() => null);
    if (!r) return set({ projection: null, state: "error" });
    set(r.ok ? { projection: r.projection as Projection, state: "ready" } : { projection: null, state: r.reason === "unreadable" ? "error" : "empty" });
  }
  async function pair(): Promise<void> {
    if (link.kind !== "link") return;
    previewOn = false;
    set({ screen: "pair", state: "keygen", step: "signing", failure: null, fingerprint: null }, true);
    const out = await runPairing({
      link: link.link, online: navigator.onLine, keygen: createKeygen(), transport,
      store: { saveKeys: async (k) => saveDeviceKeys(await getDb(), k), saveTrust: async (t) => (await getDb()).put("keys", "desktop", t), saveCredentials: async (c) => (await getDb()).put("keys", "credentials", c), discard: async () => { await wipe(); } },
      onStep: (step) => set({ step }),
    });
    if (out.ok) { set({ state: "waiting", fingerprint: out.fingerprint }); startWatch(); return; }
    set({ state: out.reason === "expired" ? "stale" : out.reason === "offline" ? "offline" : "error", failure: out.reason, fingerprint: out.fingerprint ?? null });
  }
  async function submitLock(pin: string): Promise<void> {
    if (view.lockMode === "set") {
      if (!isValidPin(pin)) return set({ lockNotice: { kind: "invalid" } });
      pendingPin = pin; return set({ lockMode: "confirm", lockNotice: null });
    }
    if (view.lockMode === "confirm") {
      if (pin !== pendingPin) { pendingPin = ""; return set({ lockMode: "set", lockNotice: { kind: "mismatch" } }); }
      const pinRecord = await createPinRecord(pin); pendingPin = "";
      lockRow = { pin: pinRecord, failures: 0, waitUntil: 0 }; await (await getDb()).put("settings", "lock", lockRow);
      lockState = { phase: "unlocked", hiddenAt: null };
      return set({ hasLock: true, screen: "settings", lockMode: "enter", lockNotice: null, state: "ready" }, true);
    }
    const status = attemptStatus(lockState, Date.now());
    if (!status.allowed || !lockRow) return set({ lockNotice: { kind: "wait", seconds: status.waitSeconds } });
    set({ lockNotice: { kind: "checking" } });
    const ok = isValidPin(pin) && (await verifyPin(pin, lockRow.pin));
    lockState = afterAttempt(lockState, ok, Date.now());
    if (lockState.phase === "unlocked") return set({ screen: returnTo, lockNotice: null }, true);
    if (lockState.phase !== "locked") return;
    lockRow = { pin: lockRow.pin, failures: lockState.failures, waitUntil: lockState.waitUntil };
    await (await getDb()).put("settings", "lock", lockRow);
    const next = attemptStatus(lockState, Date.now());
    set({ lockNotice: next.allowed ? { kind: "wrong", left: next.triesLeft } : { kind: "wait", seconds: next.waitSeconds } });
    if (!next.allowed) setTimeout(() => set({ lockNotice: null }), next.waitSeconds * 1000);
  }
  function startWatch(): void {
    watcher?.stop();
    watcher = watchApproval({
      poll: async () => { const r = await relay.poll(); return r.kind === "updated" || r.kind === "unchanged" ? "approved" : r.kind === "pending" ? "pending" : r.kind === "revoked" ? "revoked" : "retry"; },
      now: Date.now, setTimer: (run, ms) => setTimeout(run, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      isHidden: () => document.visibilityState === "hidden",
      onVisibilityChange: (run) => { document.addEventListener("visibilitychange", run); return () => document.removeEventListener("visibilitychange", run); },
      onEnd: (end) => {
        watcher = null;
        if (view.screen !== "pair") return;
        if (end === "approved") go("today");
        else set({ state: "error", failure: end === "timeout" ? "approval_timeout" : "rejected" }, true);
      },
    });
  }
  async function wipe(): ReturnType<typeof wipeAll> {
    watcher?.stop(); watcher = null;
    const db = await getDb().catch(() => null); dbPromise = null;
    return wipeAll({
      db, factory: indexedDB, caches: typeof caches === "undefined" ? null : caches,
      unregister: async () => { const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []; await Promise.all(regs.map((r) => r.unregister())); },
      storage: { keys: () => { try { return Object.keys(localStorage); } catch { return []; } }, remove: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } },
    });
  }
  async function removePhone(): Promise<void> {
    const result = await wipe();
    set(result.ok ? { removed: true, confirmRemove: false, hasLock: false, projection: null } : { removeError: result.failed.join(", "), confirmRemove: false });
  }

  root.addEventListener("click", (event) => {
    const el = (event.target as Element).closest<HTMLElement>("[data-act],[data-nav],[data-lang],[data-theme]");
    if (!el) return;
    const mouse = event as MouseEvent;
    if (el.dataset.nav) { if (mouse.metaKey || mouse.ctrlKey) return; event.preventDefault(); go(el.dataset.nav as ScreenId); return; }
    if (el.dataset.lang && isLocale(el.dataset.lang)) { store.set("sf.locale", el.dataset.lang); previewOn = false; set({ locale: el.dataset.lang as Locale }); return; }
    if (el.dataset.theme) { store.set("sf.theme", el.dataset.theme); previewOn = false; set({ theme: el.dataset.theme as Theme }); return; }
    switch (el.dataset.act) {
      case "install": void installEvent?.prompt().then(() => { installEvent = null; set({ canInstall: false }); }); break;
      case "go-pair": go("pair"); break;
      case "restart-pair": link = { kind: "none" }; go("pair"); break;
      case "retry": if (view.screen === "pair") { if (link.kind === "link") void pair(); else go("pair"); } else go(view.screen); break;
      case "update": updates?.apply(); break;
      case "remove": set({ confirmRemove: true }); break;
      case "remove-no": set({ confirmRemove: false }); break;
      case "remove-yes": void removePhone(); break;
      case "lock-set": returnTo = "settings"; set({ screen: "lock", lockMode: "set", lockNotice: null }); break;
    }
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = (event.target as HTMLFormElement).querySelector<HTMLInputElement>("input[name=pin]");
    if (input) void submitLock(input.value);
  });
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e as InstallEvent; set({ canInstall: true }); });
  window.addEventListener("appinstalled", () => set({ installed: true, canInstall: false }));
  window.addEventListener("online", () => set({ online: true }));
  window.addEventListener("offline", () => set({ online: false }));
  window.addEventListener("popstate", () => { const s = SCREENS.find((x) => x === new URLSearchParams(location.search).get("screen")); set({ screen: s ?? "welcome" }); });
  document.addEventListener("visibilitychange", () => {
    lockState = document.hidden ? onHidden(lockState, Date.now()) : onVisible(lockState, Date.now());
    if (!document.hidden && lockState.phase === "locked" && view.screen !== "lock") { returnTo = view.screen; set({ screen: "lock", lockMode: "enter", lockNotice: null }); }
  });

  link = takePairingLink(location.hash, location.pathname + location.search, (u) => history.replaceState(null, "", u));
  paint();
  void getDb().then((db) => db.get<LockRow>("settings", "lock")).then((row) => {
    if (!row) return;
    lockRow = row; lockState = initialState(true, row); returnTo = view.screen === "lock" ? "welcome" : view.screen;
    set({ hasLock: true, screen: "lock", lockMode: "enter", lockNotice: null });
  }).catch(() => undefined);
  if (link.kind === "invalid") set({ screen: "pair", state: "error", failure: "invalid_link" });
  else if (link.kind === "link") void pair();
  else if (view.screen === "today") void loadToday();
  return { attachUpdates(c) { updates = c; c.subscribe((s) => set({ updateReady: s === "waiting" })); if (c.state() === "waiting") set({ updateReady: true }); } };
}
