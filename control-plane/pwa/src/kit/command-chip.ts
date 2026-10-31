import { formatTime, t, type Locale } from "../i18n";
import { mapResultCode } from "../outbox/codes";
import type { OutboxRecord } from "../outbox/state";
import { esc } from "../views/view";

type ChipRecord = Pick<OutboxRecord, "state" | "kind" | "lastError" | "nextTryAt"> & { resultCode?: string | undefined; resultGuarded?: boolean | undefined };
// Nothing is drawn as done until the PC said so. A reply that is committed was "handed to WhatsApp on your PC".
export function renderChip(i: Readonly<{ record: ChipRecord; locale: Locale; now: number; authorityExpiresAt?: number; timeZone?: string }>): string {
  const { record, locale } = i; let key: string; let action = ""; let shown: string = record.state;
  const btn = (act: string, label: string): string => `<button type="button" class="btn btn-ghost" data-act="${act}">${esc(label)}</button>`;
  switch (record.state) {
    case "queued":
      key = record.lastError === "waiting_pc" && i.authorityExpiresAt !== undefined ? "cmd.waitpc" : "cmd.queued"; break;
    case "sent": key = "cmd.sent"; break;
    case "committed": key = record.kind === "command.messages.reply" ? (record.resultGuarded === true ? "cmd.guarded" : "cmd.replied") : "cmd.committed"; break;
    case "unknown": key = "cmd.unknown"; break;
    case "expired": key = "cmd.expired"; action = btn("cmd-retry", t(locale, "cmd.retry")); break;
    case "failed": {
      const ui = mapResultCode(record.resultCode);
      key = ui === "done" ? "cmd.already" : ui === "review" ? "cmd.review" : ui === "answered" ? "cmd.answered" : ui === "resync" ? "cmd.resync" : ui === "expired" ? "cmd.expired" : "cmd.failed";
      if (ui === "answered") shown = "answered"; // finished, not failed: its own look, no button
      else if (ui === "resync" || ui === "expired" || ui === "failed") action = btn("cmd-retry", t(locale, "cmd.retry"));
      break;
    }
  }
  const time = i.authorityExpiresAt === undefined ? "" : formatTime(i.authorityExpiresAt, locale, i.timeZone);
  return `<div class="chip chip-${shown}" role="status" data-state="${shown}"><span>${esc(t(locale, key, { time }))}</span>${action}</div>`;
}
