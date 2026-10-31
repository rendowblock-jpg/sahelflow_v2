// W3b F6c item 7: the outbox keeps no label for a reply or a note, so the open-commands list says the kind in words.
import { describe, expect, it } from "vitest";
import type { OutboxRecord } from "../src/outbox/state";
import { createSettingsController, type SettingsHost } from "../src/views/settings/controller";
import { NOW, rec } from "./orders-fixtures";

type L = "en" | "fr" | "ar";
function html(locale: L, commands: OutboxRecord[]): string {
  const host: SettingsHost = {
    now: () => NOW, locale: () => locale, online: () => true, timeZone: "UTC", theme: () => "system", hasLock: () => false,
    read: () => ({ status: "ready", asOf: NOW, pairedAt: NOW, commands }), reload: async () => undefined, retry: async () => undefined, discard: async () => undefined,
    setLocale: () => undefined, setTheme: () => undefined, startLockSetup: () => undefined, remove: async () => true, subscribe: () => () => undefined,
  };
  return createSettingsController(host).html();
}
const label = (h: string): string[] => Array.from(h.matchAll(/<span class="cmd-label">([^<]*)<\/span>/g), (m) => m[1] ?? "");
const KINDS = [["command.orders.confirm", "Confirm order"], ["command.orders.reject", "Reject order"], ["command.messages.reply", "Reply"], ["command.comments.write", "Note"]] as const;

describe("settings list: a record without a label shows its kind", () => {
  for (const [kind, word] of KINDS) {
    it(`${kind} with an empty label says "${word}"`, () => {
      expect(label(html("en", [rec({ commandId: "c1", state: "queued", kind, labelForUi: "" })]))).toEqual([word]);
      expect(label(html("en", [rec({ commandId: "c2", state: "queued", kind, labelForUi: "   " })]))).toEqual([word]);
    });
  }
  it("a label that exists is shown as it is (escaped) and the kind word is not added", () => {
    expect(label(html("en", [rec({ commandId: "c3", state: "queued", kind: "command.orders.confirm", labelForUi: "SF-1042" })]))).toEqual(["SF-1042"]);
    expect(label(html("en", [rec({ commandId: "c4", state: "queued", kind: "command.orders.reject", labelForUi: "<b>x</b>" })]))).toEqual(["&lt;b&gt;x&lt;/b&gt;"]);
  });
  it("French and Arabic have their own words", () => {
    expect(label(html("fr", [rec({ commandId: "c5", state: "queued", kind: "command.messages.reply", labelForUi: "" })]))).toEqual(["Réponse"]);
    expect(label(html("ar", [rec({ commandId: "c6", state: "queued", kind: "command.comments.write", labelForUi: "" })]))).toEqual(["ملاحظة"]);
  });
});
