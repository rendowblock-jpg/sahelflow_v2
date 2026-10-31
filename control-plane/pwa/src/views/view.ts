import { dirOf, formatDzd, formatNumber, formatTime, formatWeekday, t, type Locale } from "../i18n";
import type { PairFailure, PairStep } from "../pair/flow";
import type { Projection } from "../today/projection";

export type ScreenId = "welcome" | "pair" | "today" | "settings" | "lock";
export type ViewState = "loading" | "empty" | "error" | "stale" | "offline" | "ready" | "expired" | "keygen" | "waiting";
export type Theme = "light" | "dark" | "system";
export type LockNotice = null | Readonly<{ kind: "wrong"; left: number }> | Readonly<{ kind: "wait"; seconds: number }> | Readonly<{ kind: "mismatch" | "invalid" | "checking" }>;
export type View = Readonly<{
  locale: Locale; theme: Theme; screen: ScreenId; state: ViewState; now: number; online: boolean;
  updateReady: boolean; canInstall: boolean; installed: boolean; ios: boolean;
  projection: Projection | null; step: PairStep | null; fingerprint: string | null; failure: PairFailure | null;
  lockMode: "enter" | "set" | "confirm"; lockNotice: LockNotice; hasLock: boolean;
  version: string; confirmRemove: boolean; removeError: string | null; removed: boolean;
}>;
type Params = Readonly<Record<string, string | number>>;
type Tr = (key: string, params?: Params) => string;

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const STEPS: readonly PairStep[] = ["signing", "encryption", "send"];
const FAILURE_KEY: Readonly<Record<PairFailure, string>> = {
  invalid_link: "pair.error.invalid", unsupported: "pair.error.unsupported", keygen_failed: "pair.error.keygen", storage_failed: "pair.error.storage",
  offline: "pair.offline", expired: "pair.expired", rejected: "pair.error.rejected", network: "pair.error.network",
};

const note = (cls: string, role: string, title: string, body: string, action = ""): string =>
  `<div class="note ${cls}" role="${role}">${title ? `<h2>${title}</h2>` : ""}<p>${body}</p>${action}</div>`;
const button = (act: string, label: string, kind = "primary"): string => `<button type="button" class="btn btn-${kind}" data-act="${act}">${label}</button>`;
const skeleton = (label: string): string => `<div class="skeleton" role="status" aria-busy="true"><span class="sr">${label}</span><i></i><i></i><i></i></div>`;

function welcome(v: View, tr: Tr): string {
  if (v.state === "loading") return `<h1>${tr("app.name")}</h1>${skeleton(tr("welcome.loading"))}`;
  if (v.state === "error") return `<h1>${tr("app.name")}</h1>${note("alert", "alert", tr("common.error.title"), tr("welcome.unsupported"))}`;
  const install = v.installed ? `<p class="stamp stamp-ok">${tr("welcome.installed")}</p>`
    : v.canInstall ? `${button("install", tr("welcome.install"))}<p class="hint">${tr("welcome.install.hint")}</p>`
    : v.ios ? note("", "group", tr("welcome.ios.title"), tr("welcome.ios.steps")) : "";
  return `<h1>${tr("welcome.title")}</h1><p class="lead">${tr("welcome.lead")}</p><div class="sheet">${install}</div><div class="actions">${button("go-pair", tr("welcome.pair"), v.installed || v.canInstall || v.ios ? "ghost" : "primary")}</div>`;
}

function pair(v: View, tr: Tr): string {
  const head = `<h1>${tr("pair.title")}</h1>`;
  switch (v.state) {
    case "loading": return head + skeleton(tr("common.loading"));
    case "keygen": {
      const at = Math.max(0, STEPS.indexOf(v.step ?? "signing"));
      const label = tr(`pair.keygen.${STEPS[at] ?? "signing"}`);
      return `${head}<div class="sheet" role="status" aria-live="polite"><h2>${tr("pair.keygen.title")}</h2><p>${tr("pair.keygen.step", { step: at + 1, total: STEPS.length, label })}</p><progress max="3" value="${at + 1}" aria-label="${label}"></progress></div>`;
    }
    case "waiting": {
      const fp = v.fingerprint ? `<div class="sheet"><h2>${tr("pair.fingerprint.title")}</h2><p class="fp num" dir="ltr">${esc(v.fingerprint)}</p><p class="hint">${tr("pair.fingerprint.hint")}</p></div>` : "";
      return `${head}${fp}<div class="note margin" role="status"><h2>${tr("pair.waiting")}</h2><p>${tr("pair.waiting.hint")}</p></div>`;
    }
    case "error": return head + note("alert", "alert", tr("common.error.title"), tr(FAILURE_KEY[v.failure ?? "network"]), button("retry", tr("common.retry"), "ghost"));
    case "stale": return head + note("alert", "alert", "", tr("pair.expired"));
    case "offline": return head + note("", "status", "", tr("pair.offline"), button("retry", tr("common.retry"), "ghost"));
    default: return `${head}<div class="sheet"><p>${tr("pair.empty")}</p></div>`;
  }
}

function bars(p: Projection, v: View, tr: Tr): string {
  const max = Math.max(1, ...p.week.map((d) => d.orders));
  const label = `${tr("today.week.label")}: ${p.week.map((d) => formatNumber(d.orders)).join(", ")}`;
  const items = p.week.map((d) => `<li class="b${Math.round((d.orders / max) * 20)}"><span class="n num" aria-hidden="true">${formatNumber(d.orders)}</span><span class="d" aria-hidden="true">${esc(formatWeekday(d.at, v.locale))}</span></li>`).join("");
  return `<figure class="week"><figcaption>${tr("today.week")}</figcaption><ol class="bars" role="img" aria-label="${esc(label)}">${items}</ol></figure>`;
}

function today(v: View, tr: Tr): string {
  const head = `<h1>${tr("today.title")}</h1>`;
  const p = v.projection;
  if (v.state === "loading") return head + skeleton(tr("common.loading"));
  if (v.state === "error") return head + note("alert", "alert", tr("common.error.title"), tr("today.error"), button("retry", tr("common.retry"), "ghost"));
  if (!p) return head + note("", "status", "", tr("today.notpaired"), button("go-pair", tr("welcome.pair")));
  if (v.state === "expired") return head + note("alert", "status", "", tr("today.expired"));
  const strip = v.state === "stale" || v.state === "offline"
    ? `<div class="strip" role="status"><strong>${tr("today.stale", { time: formatTime(p.generatedAt, v.locale) })}</strong><span>${tr("today.stale.hint")}</span></div>` : "";
  const call = p.toConfirm > 0 ? `<div class="note margin" role="status"><h2>${tr("today.call.title")}</h2><p>${tr("today.call.body", { count: formatNumber(p.toConfirm) })}</p></div>` : "";
  if (v.state === "empty") return `${head}<p class="stamp">${tr("common.readonly")}</p>${strip}${note("", "status", "", tr("today.empty"))}`;
  const fig = (label: string, value: string, wide = ""): string => `<div class="fig${wide}"><dt>${label}</dt><dd class="num">${value}</dd></div>`;
  return `${head}<p class="stamp">${tr("common.readonly")}</p>${strip}${call}<dl class="figs">${fig(tr("today.newOrders"), formatNumber(p.newOrders))}${fig(tr("today.toConfirm"), formatNumber(p.toConfirm))}${fig(tr("today.inDelivery"), formatNumber(p.inDelivery))}${fig(tr("today.cod"), esc(formatDzd(p.codToCollectDzd, v.locale)), " wide")}</dl>${bars(p, v, tr)}`;
}

function settings(v: View, tr: Tr): string {
  if (v.state === "loading") return `<h1>${tr("settings.title")}</h1>${skeleton(tr("common.loading"))}`;
  const seg = (attr: string, id: string, label: string, on: boolean, lang = ""): string => `<button type="button" class="seg" data-${attr}="${id}" aria-pressed="${on}"${lang}>${label}</button>`;
  const langs = (["ar", "fr", "en"] as const).map((l) => seg("lang", l, l === "ar" ? "العربية" : l === "fr" ? "Français" : "English", v.locale === l, ` lang="${l}"`)).join("");
  const themes = (["light", "dark", "system"] as const).map((x) => seg("theme", x, tr(`settings.theme.${x}`), v.theme === x)).join("");
  const remove = v.removed ? `<p class="stamp stamp-ok" role="status">${tr("settings.remove.done")}</p>`
    : v.confirmRemove ? `<div class="note alert" role="alertdialog" aria-labelledby="rm-t"><h2 id="rm-t">${tr("settings.remove.title")}</h2><p>${tr("settings.remove.body")}</p><div class="actions">${button("remove-yes", tr("settings.remove.confirm"), "danger")}${button("remove-no", tr("settings.remove.cancel"), "ghost")}</div></div>`
    : `<p>${tr("settings.remove.body")}</p>${button("remove", tr("settings.remove.button"), "ghost")}`;
  const err = v.removeError ? note("alert", "alert", "", tr("settings.remove.error", { steps: esc(v.removeError) })) : "";
  const lock = v.hasLock ? `<p class="stamp stamp-ok">${tr("settings.lock.active")}</p>` : `<p class="hint">${tr("settings.lock.hint")}</p>${button("lock-set", tr("settings.lock.set"), "ghost")}`;
  return `<h1>${tr("settings.title")}</h1><section class="sheet" aria-labelledby="s-l"><h2 id="s-l">${tr("settings.language")}</h2><div class="segs" role="group" aria-labelledby="s-l">${langs}</div></section><section class="sheet" aria-labelledby="s-t"><h2 id="s-t">${tr("settings.theme")}</h2><div class="segs" role="group" aria-labelledby="s-t">${themes}</div></section><section class="sheet" aria-labelledby="s-k"><h2 id="s-k">${tr("settings.lock")}</h2>${lock}</section><section class="sheet" aria-labelledby="s-r"><h2 id="s-r">${tr("settings.remove.title")}</h2>${err}${remove}</section><p class="version num" dir="ltr">${tr("settings.version", { version: esc(v.version) })}</p>`;
}

function lock(v: View, tr: Tr): string {
  const n = v.lockNotice;
  const msg = !n ? "" : n.kind === "wrong" ? tr("lock.wrong", { left: n.left }) : n.kind === "wait" ? tr("lock.wait", { seconds: n.seconds }) : tr(`lock.${n.kind}`);
  const title = v.lockMode === "enter" ? tr("lock.title") : v.lockMode === "set" ? tr("lock.set.title") : tr("lock.set.confirm");
  const label = v.lockMode === "enter" ? tr("lock.enter") : title;
  const wait = n?.kind === "wait" || n?.kind === "checking";
  return `<h1>${title}</h1><form class="sheet" data-form="lock" novalidate><label for="pin">${label}</label><input id="pin" name="pin" class="pin num" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" dir="ltr" required${msg ? ' aria-describedby="pin-msg"' : ""}>${msg ? `<p id="pin-msg" class="${n?.kind === "checking" ? "hint" : "err"}" role="alert">${msg}</p>` : ""}<button type="submit" class="btn btn-primary"${wait ? " disabled" : ""}>${v.lockMode === "enter" ? tr("lock.unlock") : tr("lock.save")}</button></form>`;
}

export function renderApp(v: View): string {
  const tr: Tr = (key, params) => esc(t(v.locale, key, params));
  if (v.screen === "lock") return `<main id="main" class="lock" tabindex="-1">${lock(v, tr)}</main>`;
  const body = v.screen === "pair" ? pair(v, tr) : v.screen === "today" ? today(v.state === "keygen" || v.state === "waiting" ? { ...v, state: "loading" } : v, tr) : v.screen === "settings" ? settings(v, tr) : welcome(v, tr);
  const banners = `${v.online ? "" : `<p class="banner" role="status">${tr("common.offline")}</p>`}${v.updateReady ? `<div class="banner" role="status"><span>${tr("common.update.ready")}</span>${button("update", tr("common.update.apply"), "small")}</div>` : ""}`;
  const tab = (id: "today" | "pair" | "settings"): string => `<a class="tab" href="/?screen=${id}" data-nav="${id}"${v.screen === id ? ' aria-current="page"' : ""}>${tr(`nav.${id}`)}</a>`;
  return `<header class="top"><a class="brand" href="/?screen=welcome" data-nav="welcome">${tr("app.name")}</a></header>${banners}<main id="main" tabindex="-1">${body}</main><nav class="tabs" aria-label="${tr("nav.label")}">${tab("today")}${tab("pair")}${tab("settings")}</nav>`;
}
export { dirOf };
