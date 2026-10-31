// W3b F6b: the settings / devices screen, drawn from one model. Every shown text is escaped; no secret is ever put in the page.
import { formatTime, t, type Locale } from "../../i18n";
import { renderSkeleton } from "../../kit/skeleton";
import type { OutboxRecord } from "../../outbox/state";
import { esc, type Theme } from "../view";

export type SettingsRead =
  | Readonly<{ status: "loading" }> | Readonly<{ status: "error" }> | Readonly<{ status: "revoked" }>
  | Readonly<{ status: "ready"; asOf: number | null; pairedAt: number | null; commands: readonly OutboxRecord[] }>;
export type SettingsModel = Readonly<{
  locale: Locale; theme: Theme; online: boolean; timeZone?: string; hasLock: boolean; read: SettingsRead;
  confirmRemove: boolean; removeError: boolean; removed: boolean;
}>;

// A reply the PC already answered has no button; only a command that was never sent can be discarded.
export const canRetry = (r: OutboxRecord): boolean => (r.state === "queued" || r.state === "unknown") && r.resultCode !== "ALREADY_ANSWERED";
export const canDiscard = (r: OutboxRecord): boolean => r.state === "queued" && r.resultCode !== "ALREADY_ANSWERED";

const day = (at: number, l: Locale, tz?: string): string =>
  new Intl.DateTimeFormat(`${l}-u-nu-latn`, { day: "numeric", month: "short", year: "numeric", ...(tz ? { timeZone: tz } : {}) }).format(at);
const btn = (act: string, label: string, kind: string, extra = ""): string => `<button type="button" class="btn btn-${kind}" data-act="${act}"${extra}>${label}</button>`;

function commandRow(r: OutboxRecord, m: SettingsModel): string {
  const L = m.locale; const state = esc(t(L, `settings.commands.state.${r.state}`));
  const retry = canRetry(r) ? btn("s-retry", esc(t(L, "settings.commands.retry")), "small", m.online ? "" : " disabled") : "";
  const discard = canDiscard(r) ? btn("s-discard", esc(t(L, "settings.commands.discard")), "ghost") : "";
  return `<li data-id="${esc(r.commandId)}" data-state="${esc(r.state)}"><span class="cmd-label">${esc(r.labelForUi)}</span> <span class="stamp">${state}</span>${retry}${discard}</li>`;
}

export function renderSettings(m: SettingsModel): string {
  const L = m.locale; const tr = (k: string, p?: Readonly<Record<string, string | number>>): string => esc(t(L, k, p));
  const head = `<h1>${tr("settings.title")}</h1>`; const wrap = (state: string, body: string): string => `<section class="settings" data-screen="settings" data-state="${state}">${head}${body}</section>`;
  if (m.read.status === "revoked") return wrap("revoked", `<div class="note alert" role="alert"><p>${tr("settings.revoked")}</p></div>`);
  if (m.read.status === "loading") return wrap("loading", renderSkeleton({ rows: 4, label: t(L, "common.loading") }));
  const r = m.read;
  const info = r.status === "error"
    ? `<div class="note alert" role="alert"><p>${tr("settings.error.load")}</p>${btn("s-reload", tr("common.retry"), "primary")}</div>`
    : `<p class="stamp" data-testid="last-sync">${r.asOf === null ? tr("settings.lastSync.none") : tr("settings.lastSync", { time: `${day(r.asOf, L, m.timeZone)} ${formatTime(r.asOf, L, m.timeZone)}` })}</p>${r.pairedAt === null ? "" : `<p class="stamp" data-testid="paired-since">${tr("settings.pairedSince", { date: day(r.pairedAt, L, m.timeZone) })}</p>`}`;
  const seg = (a: string, id: string, label: string, on: boolean, lang = ""): string => `<button type="button" class="seg" data-act="s-${a}" data-s-${a}="${id}" aria-pressed="${on}"${lang}>${label}</button>`;
  const langs = (["ar", "fr", "en"] as const).map((l) => seg("lang", l, l === "ar" ? "العربية" : l === "fr" ? "Français" : "English", L === l, ` lang="${l}"`)).join("");
  const themes = (["light", "dark", "system"] as const).map((x) => seg("theme", x, tr(`settings.theme.${x}`), m.theme === x)).join("");
  const lock = `${m.hasLock ? `<p class="stamp stamp-ok">${tr("settings.lock.active")}</p>` : `<p class="hint">${tr("settings.lock.hint")}</p>${btn("s-lock-set", tr("settings.lock.set"), "ghost")}`}<p class="hint" data-testid="pin-note">${tr("settings.pinNote")}</p>`;
  const list = r.status !== "ready" ? "" : `<section class="sheet" aria-labelledby="s-c"><h2 id="s-c">${tr("settings.commands.title")}</h2>${r.commands.length === 0 ? `<p class="hint">${tr("settings.commands.empty")}</p>` : `<ul class="cmds">${r.commands.map((c) => commandRow(c, m)).join("")}</ul>`}</section>`;
  const remove = m.removed ? `<p class="stamp stamp-ok" role="status">${tr("settings.remove.done")}</p>`
    : m.confirmRemove ? `<div class="note alert" role="alertdialog" aria-labelledby="rm-t"><h2 id="rm-t">${tr("settings.remove.title")}</h2><p>${tr("settings.remove.body")}</p><div class="actions">${btn("s-remove-yes", tr("settings.remove.confirm"), "danger")}${btn("s-remove-no", tr("settings.remove.cancel"), "ghost")}</div></div>`
    : `<p>${tr("settings.remove.body")}</p>${btn("s-remove", tr("settings.remove.button"), "ghost")}`;
  const err = m.removeError ? `<div class="note alert" role="alert"><p>${tr("settings.error.wipe")}</p></div>` : "";
  const off = m.online ? "" : `<p class="banner" role="status">${tr("settings.offline.note")}</p>`;
  return wrap(m.online ? r.status : "offline", `${off}${info}<section class="sheet" aria-labelledby="s-l"><h2 id="s-l">${tr("settings.language")}</h2><div class="segs" role="group" aria-labelledby="s-l">${langs}</div></section><section class="sheet" aria-labelledby="s-t"><h2 id="s-t">${tr("settings.theme")}</h2><div class="segs" role="group" aria-labelledby="s-t">${themes}</div></section><section class="sheet" aria-labelledby="s-k"><h2 id="s-k">${tr("settings.lock")}</h2>${lock}</section>${list}<section class="sheet" aria-labelledby="rm-h"><h2 id="rm-h">${tr("settings.remove.title")}</h2>${err}${remove}</section>`);
}
