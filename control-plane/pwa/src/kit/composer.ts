import { t, type Locale } from "../i18n";
import { esc } from "../views/view";

export function renderComposer(i: Readonly<{ mode: "reply" | "note"; id: string; draft: string; locale: Locale }>): string {
  const field = `cmp-${esc(i.id)}`;
  return `<form class="composer" data-form="composer" data-mode="${i.mode}" data-id="${esc(i.id)}"><label for="${field}">${esc(t(i.locale, i.mode === "reply" ? "cmd.composer.reply" : "cmd.composer.note"))}</label><textarea id="${field}" name="text" rows="3" maxlength="4000">${esc(i.draft)}</textarea><button type="submit" class="btn btn-primary">${esc(t(i.locale, "cmd.send"))}</button></form>`;
}
