import { supportsEd25519 } from "../../../../src/lib/connected-platform/web";
import { DEFAULT_LOCALE, dirOf, isLocale, type Locale } from "../i18n";
import { createPinRecord, verifyPin, type PinRecord } from "../lock/pin";
import { afterAttempt, attemptStatus, initialState, isValidPin, onHidden, onVisible, type LockState } from "../lock/state";
import { watchApproval } from "../poll/approval";
import { runPairing, takePairingLink, type PairingTransport } from "../pair/flow";
import { createKeygen } from "../pair/keygen";
import { readResume, savePairingRecord } from "../pair/resume";
import { createFetchTransport } from "../pair/transport";
import { openDb, saveDeviceKeys, type Db } from "../storage/idb";
import { isOpen } from "../outbox/state";
import { createVault, purgeOld } from "../storage/sealed";
import { wipeAll } from "../storage/wipe";
import { createSync } from "../sync/engine";
import { reactToPoll, type PollReaction } from "../sync/revoke";
import { focusKeyOf } from "../kit/focus";
import { createDirectPoll } from "./direct-poll";
import type { Budget } from "../sync/schedule";
import type { UpdateController } from "../sw/update";
import { createRelayClient } from "../today/relay-source";
import { freshness, type Projection, type ProjectionSource } from "../today/projection";
import { effectiveScreen, isLazyScreen, renderApp, type ScreenId, type Theme, type View } from "../views/view";
import { createInboxHost } from "../views/inbox/host";
import { createCommandStack, type CommandStack } from "./commands";
import { createCommandFollow } from "./command-follow";
import { createInboxMount } from "./inbox-mount";
import { createOrdersHost, ORDERS_VAULT_KEY, type OrdersHostHandle } from "./orders-host";
import { createSettingsHost, type SettingsHostHandle } from "./settings-host";
import { applyPreview } from "./preview";
import { GROUP_OF, loadScreen } from "./registry";
import { clickTarget } from "./click-target";
import { createScreenMount } from "./screen-mount";
import { withShellStrip } from "./shell-strip";
import { createVaultWiring } from "./vault-wiring";

declare const __APP_VERSION__: string;
declare const __RELAY_URL__: string;
type InstallEvent = Event & { prompt(): Promise<void> };
type LockRow = Readonly<{ pin: PinRecord; failures: number; waitUntil: number }>;
export type AppOptions = Readonly<{ source?: ProjectionSource; transport?: PairingTransport }>;

const SCREENS: readonly ScreenId[] = ["welcome", "pair", "today", "settings", "lock", "orders", "order", "inbox", "conversation", "devices", "install"];
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
  // The command stack (outbox on the real transport) exists once the phone is paired; decrypted orders live only in the vault.
  let stack: Awaited<ReturnType<typeof createCommandStack>> = null; let ordersHost: OrdersHostHandle | null = null;
  let inboxMount: ReturnType<typeof createInboxMount> | null = null; // the chats: loaded on the first visit, fed ONLY from the vault
  const vault = createVault();
  // W3b F6a: every direct poll (inbox, orders) acts on a revoked answer at once (one tested function, direct-poll.ts).
  const directPoll = createDirectPoll({ poll: (k) => relay.poll(k), wipe, onRevoked: showRevoked });
  // W3b W196: what happened to a tap. ONE emitter (command-follow.ts, own tests) tells the orders host and the inbox screen after a flush and after a status poll that changed a record.
  const follow = createCommandFollow({ commandSent: () => sync.commandSent() });
  follow.subscribe(() => ordersHost?.notify());
  // The lazy screens (orders, inbox, devices, install) are drawn into <main> by ONE mounter (screen-mount.ts, own tests): skeleton, render, bind, Retry.
  const screenMount = createScreenMount({ load: loadScreen, ctx: () => ({ view, go: (x) => go(x) }), root: () => root.querySelector<HTMLElement>("#main") });
  // Lock / hidden >= 5 min / unlock / wipe on the vault: one tested module. `wake`: the orders screen redraws from what is left and reloads if it was emptied.
  const vaultWiring = createVaultWiring({
    vault, key: ORDERS_VAULT_KEY,
    wake: (emptied) => {
      // An unlock revisits the inbox (the sealed copy opens without the network); never while locked. On the lock screen the screen to return to counts.
      if (lockState.phase !== "locked" && GROUP_OF[view.screen === "lock" ? returnTo : view.screen] === "inbox") void inboxMount?.visit("inbox").catch(() => undefined);
      const h = ordersHost; if (!h) return; h.notify(); if (emptied && lockState.phase !== "locked") void h.reload().catch(() => undefined); },
  });

  const derive = (v: View): View => {
    if (v.screen !== "today") return v;
    const p = v.projection;
    if (v.state === "error" || v.state === "loading") return v;
    if (!p) return { ...v, state: "empty" };
    const f = freshness(p.generatedAt, v.now);
    return { ...v, state: f === "expired" ? "expired" : !v.online ? "offline" : v.pcoff ? "pcoff" : f === "fresh" ? "ready" : "stale" };
  };
  const paint = (): void => {
    const v = previewOn ? applyPreview(view, location.search) : derive(view);
    document.documentElement.lang = v.locale; document.documentElement.dir = dirOf(v.locale);
    document.documentElement.dataset.theme = v.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : v.theme;
    // "Your PC is off" on every screen that shows shop data (Today and Orders draw their own strip; this one is added once, only when none is there).
    const focusKey = focusKeyOf(document.activeElement, root); const shown = effectiveScreen(v);
    screenMount.dispose();
    root.innerHTML = withShellStrip(renderApp(v), { screen: v.screen, pcoff: v.pcoff === true, asOf: v.projection?.generatedAt ?? null, locale: v.locale });
    if (isLazyScreen(shown)) screenMount.show(shown, focusKey);
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
    attachFor();
    if (screen === "today") void loadToday(); else sync.onScreen();
  };
  function showRevoked(reaction: Extract<PollReaction, { kind: "revoked" }>): void {
    sync.stop();
    set({ screen: "settings", state: "empty", revoked: true, paired: false, removed: false, hasLock: false, projection: null, pcoff: false, removeError: reaction.wiped ? null : reaction.failed.join(", ") });
  }
  async function loadToday(): Promise<void> {
    if (!options.source) {
      // ALARM 1: the poll answer is acted on. A phone the PC removed wipes itself before anything is read or drawn.
      const poll = await relay.poll().catch(() => null);
      const reaction = poll ? await reactToPoll(poll, wipe) : null;
      if (reaction?.kind === "revoked") return showRevoked(reaction);
      set({ pcoff: reaction?.kind === "pcoff" });
      if (poll && poll.kind !== "not_paired") sync.start(false);
    }
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
    if (out.ok) {
      const pairedAt = Date.now();
      // Kept so a reload comes back to this screen with the window counted from now (a failed write only loses that).
      void getDb().then((db) => savePairingRecord(db, { pairedAt, fingerprint: out.fingerprint })).catch(() => undefined);
      set({ state: "waiting", fingerprint: out.fingerprint, pairedAt }); startWatch(); return;
    }
    set({ state: out.reason === "expired" ? "stale" : out.reason === "offline" ? "offline" : "error", failure: out.reason, fingerprint: out.fingerprint ?? null });
  }
  async function resumeWaiting(): Promise<void> {
    const r = await readResume(await getDb(), Date.now());
    if (r.kind === "none") return;
    const patch: Partial<View> = r.kind === "waiting"
      ? { state: "waiting", failure: null, fingerprint: r.fingerprint || null, pairedAt: r.pairedAt }
      : { state: "error", failure: "approval_timeout", fingerprint: r.fingerprint || null, pairedAt: r.pairedAt };
    // A PIN lock stays in front; it returns to this screen after the PIN.
    if (view.screen === "lock") { returnTo = "pair"; set(patch); } else set({ screen: "pair", ...patch }, true);
    if (r.kind === "waiting") startWatch(r.remainingMs);
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
    if (lockState.phase === "unlocked") { vaultWiring.unlocked(); return set({ screen: returnTo, lockNotice: null }, true); }
    if (lockState.phase !== "locked") return;
    lockRow = { pin: lockRow.pin, failures: lockState.failures, waitUntil: lockState.waitUntil };
    await (await getDb()).put("settings", "lock", lockRow);
    const next = attemptStatus(lockState, Date.now());
    set({ lockNotice: next.allowed ? { kind: "wrong", left: next.triesLeft } : { kind: "wait", seconds: next.waitSeconds } });
    if (!next.allowed) setTimeout(() => set({ lockNotice: null }), next.waitSeconds * 1000);
  }
  function startWatch(timeoutMs?: number): void {
    watcher?.stop();
    watcher = watchApproval({
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      poll: async () => { const r = await relay.poll(); return r.kind === "updated" || r.kind === "unchanged" ? "approved" : r.kind === "pending" ? "pending" : r.kind === "revoked" ? "revoked" : "retry"; },
      now: Date.now, setTimer: (run, ms) => setTimeout(run, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      isHidden: () => document.visibilityState === "hidden",
      onVisibilityChange: (run) => { document.addEventListener("visibilitychange", run); return () => document.removeEventListener("visibilitychange", run); },
      onEnd: (end) => {
        watcher = null;
        if (view.screen !== "pair") return;
        if (end === "approved") { go("today"); detectPaired(); }
        else set({ state: "error", failure: end === "timeout" ? "approval_timeout" : "rejected" }, true);
      },
    });
  }
  async function wipe(): ReturnType<typeof wipeAll> {
    watcher?.stop(); watcher = null; vaultWiring.wipe(); stack = null; ordersHost = null; inboxMount = null; view = { ...view, paired: false };
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

  async function getStack(): ReturnType<typeof createCommandStack> {
    if (stack) return stack;
    stack = await createCommandStack({ db: await getDb(), relayBase: __RELAY_URL__, fetch: (input, init) => fetch(input, init), now: Date.now });
    return stack;
  }
  // ONE flush wrapper for both hosts: an accepted command goes to the relay at once (the outbox keeps it when that fails), then the screens are told and the status poll is armed.
  const flushingOutbox = (s: CommandStack) => follow.wrap(s.outbox);
  // Mounts the orders screen on a real host (own file, own tests).
  async function attachOrders(): Promise<void> {
    if (ordersHost) return;
    const s = await getStack(); if (!s || ordersHost) return;
    const mod = await import("../views/orders/screen");
    const outbox = flushingOutbox(s);
    const h = createOrdersHost({
      now: Date.now, locale: () => view.locale, online: () => navigator.onLine, pcOff: () => view.pcoff === true,
      fetchOrders: async () => { await directPoll("orders"); await s.refresh(); }, openOrders: s.openOrders,
      vault, outbox, drafts: s.drafts, authorityExpiresAt: s.authorityExpiresAt, go: (x) => go(x),
    });
    ordersHost = h; mod.attachOrdersHost(h); await h.reload();
  }
  // Mounts the settings / devices screen (own files settings-host.ts and views/settings, own chunk, own tests). Needs no pairing: lock, language and remove work offline.
  let settingsHost: SettingsHostHandle | null = null;
  async function attachSettings(): Promise<void> {
    if (settingsHost) return;
    const mod = await import("../views/settings/screen"); if (settingsHost) return;
    const s = await getStack().catch(() => null);
    const h = createSettingsHost({
      now: Date.now, locale: () => view.locale, online: () => navigator.onLine, theme: () => view.theme, hasLock: () => view.hasLock, revoked: () => view.revoked === true,
      projectionAt: () => view.projection?.generatedAt ?? null,
      pairedAt: async () => { const r = await readResume(await getDb(), Date.now()); return r.kind === "none" ? null : r.pairedAt; },
      db: getDb, flush: async () => { await s?.outbox.flush(); }, refresh: async () => { await s?.outbox.refresh(); },
      setLocale: (l) => { store.set("sf.locale", l); previewOn = false; set({ locale: l }); },
      setTheme: (x) => { store.set("sf.theme", x); previewOn = false; set({ theme: x }); },
      startLockSetup: () => { returnTo = "settings"; set({ screen: "lock", lockMode: "set", lockNotice: null }); },
      wipe: async () => { const r = await wipe(); settingsHost?.notify(); return { ok: r.ok }; },
    });
    settingsHost = h; mod.attachSettingsHost(h); await h.reload();
  }
  // Mounts the inbox (own file inbox-mount.ts, own tests): the screen chunk loads once, the host reads ONLY the vault, a reply goes through the real outbox.
  async function attachInbox(screen: "inbox" | "conversation"): Promise<void> {
    const s = await getStack(); if (!s) return;
    inboxMount ??= createInboxMount({
      vault, loadScreen: () => import("../views/inbox/screen"),
      makeHost: (p) => createInboxHost({
        now: Date.now, locale: () => view.locale, online: () => navigator.onLine, pcOff: () => view.pcoff === true,
        readConversations: p.read, reload: p.reload, subscribeAll: p.subscribe,
        outbox: flushingOutbox(s), drafts: s.drafts, authorityExpiresAt: s.authorityExpiresAt, go: (x) => go(x),
      }),
      openConversations: s.openConversations,
      poll: async () => { await directPoll("conversations"); await s.refresh(); },
      subscribeAll: follow.subscribe,
    });
    await inboxMount.open(screen);
  }
  // A lazy screen draws nothing real until its host exists: attach once (first visit), then draw it again. Orders and Inbox need the paired stack; Settings does not.
  const attachFor = (): void => {
    const id = effectiveScreen(view); const group = GROUP_OF[id];
    const redraw = (): void => { if (effectiveScreen(view) === id && view.screen !== "lock") screenMount.show(id); };
    if (group === "orders" && !ordersHost) void attachOrders().then(redraw, () => undefined);
    else if (group === "settings" && !settingsHost) void attachSettings().then(redraw, () => undefined);
    else if (group === "inbox") { const first = inboxMount === null; void attachInbox(id as "inbox" | "conversation").then(() => { if (first) redraw(); }, () => undefined); }
  };
  // The tabs Orders and Inbox appear once the command stack exists (a paired phone); never for a phone that is not paired.
  function detectPaired(): void {
    void getStack().then((s) => { if (s && view.paired !== true) { set({ paired: true }); attachFor(); } }, () => undefined);
  }
  // Polling budget: fetch on open/visible/online/Refresh, 30 s on Orders and Inbox, 60 s elsewhere, nothing while hidden, 600 a day.
  const sync = createSync({
    now: Date.now, visible: () => !document.hidden, online: () => navigator.onLine, screen: () => view.screen,
    fetchKind: (kind) => relay.poll(kind),
    pollCommands: async () => {
      const s = await getStack().catch(() => null); if (!s) return false;
      return follow.polled(s.outbox, async () => {
        await s.outbox.flush(); await s.outbox.refresh();
        return (await s.outbox.list()).some((r) => isOpen(r.state));
      });
    },
    loadBudget: async () => (await (await getDb()).get<Budget>("settings", "pollBudget")) ?? null,
    saveBudget: async (b) => { await (await getDb()).put("settings", "pollBudget", b); },
    onPoll: (poll) => { if (poll.kind === "updated") void stack?.refresh().catch(() => undefined); if (poll.kind === "revoked") void reactToPoll(poll, wipe).then((r) => { if (r.kind === "revoked") showRevoked(r); }); },
    timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
  root.addEventListener("click", (event) => {
    const el = clickTarget(event.target, root);
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
  window.addEventListener("online", () => { set({ online: true }); sync.onOnline(); });
  window.addEventListener("offline", () => set({ online: false }));
  window.addEventListener("popstate", () => { const s = SCREENS.find((x) => x === new URLSearchParams(location.search).get("screen")); set({ screen: s ?? "welcome" }); attachFor(); });
  document.addEventListener("visibilitychange", () => {
    lockState = document.hidden ? onHidden(lockState, Date.now()) : onVisible(lockState, Date.now());
    vaultWiring.visibility({ hidden: document.hidden, phase: lockState.phase, now: Date.now() }); // hidden for 5 minutes or more, or locked: the decrypted copies are dropped
    if (document.hidden) sync.onHidden(); else sync.onVisible();
    if (!document.hidden && lockState.phase === "locked" && view.screen !== "lock") { returnTo = view.screen; set({ screen: "lock", lockMode: "enter", lockNotice: null }); }
  });

  void getDb().then((db) => purgeOld(db, Date.now())).catch(() => undefined);
  link = takePairingLink(location.hash, location.pathname + location.search, (u) => history.replaceState(null, "", u));
  paint(); attachFor(); detectPaired();
  void getDb().then((db) => db.get<LockRow>("settings", "lock")).then((row) => {
    if (!row) return;
    lockRow = row; lockState = initialState(true, row); vaultWiring.locked(); returnTo = view.screen === "lock" ? "welcome" : view.screen;
    set({ hasLock: true, screen: "lock", lockMode: "enter", lockNotice: null });
  }).catch(() => undefined);
  // A reload while the PC has not approved yet: back to the waiting screen, polling from the start of the backoff.
  if (link.kind === "none" && !preview) void resumeWaiting().catch(() => undefined);
  if (link.kind === "invalid") set({ screen: "pair", state: "error", failure: "invalid_link" });
  else if (link.kind === "link") void pair();
  else if (view.screen === "today") void loadToday();
  return { attachUpdates(c) { updates = c; c.subscribe((s) => set({ updateReady: s === "waiting" })); if (c.state() === "waiting") set({ updateReady: true }); } };
}
