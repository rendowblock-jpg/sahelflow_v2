import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import {
  getWhatsAppSendGuardRuntimeTranslation,
  sendGuardPauseMinutes,
  sendGuardWarnCopy,
} from "@/lib/i18n/whatsapp-send-guard-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { whatsappSendFailureCopy } from "../inbox-workspace-shared";

const LOCALES: Locale[] = ["ar", "fr", "en"];

function translator(locale: Locale) {
  return (key: string, params?: Record<string, string | number>): string => {
    const raw = getRuntimeTranslation(locale, key) ?? key;
    return raw.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(params?.[name] ?? ""));
  };
}

describe("send guard copy in the inbox composer path", () => {
  it("the shared runtime registry serves the new keys in all three languages", () => {
    for (const locale of LOCALES) {
      for (const key of ["whatsapp.sendGuard.paused.many", "whatsapp.sendGuard.warn", "whatsapp.sendGuard.held"]) {
        expect(getWhatsAppSendGuardRuntimeTranslation(locale, key)).toBeTruthy();
        expect(getRuntimeTranslation(locale, key)).toBe(getWhatsAppSendGuardRuntimeTranslation(locale, key));
      }
    }
  });

  it("a refused send says it is paused for N minutes (rounded up), in ar/fr/en", () => {
    const refused = (locale: Locale, retryAfterSeconds: number) =>
      whatsappSendFailureCopy(translator(locale), { errorCode: "SEND_GUARD_REFUSED", retryAfterSeconds });
    expect(refused("en", 870)).toBe("Sending to this chat is paused for 15 minutes to protect your WhatsApp number.");
    expect(refused("en", 60)).toBe("Sending to this chat is paused for 1 minute to protect your WhatsApp number.");
    expect(refused("fr", 301)).toContain("suspendu pendant 6 minutes");
    expect(refused("ar", 120)).toContain("دقيقتين");
    expect(refused("ar", 300)).toContain("5 دقائق");
    expect(refused("ar", 3600)).toContain("60 دقيقة");
    expect(refused("ar", 60)).toContain("دقيقة واحدة");
    for (const locale of LOCALES) expect(refused(locale, 999)).not.toContain("{{");
  });

  it("minutes never show 0 and an unknown pause shows the full hour", () => {
    expect(sendGuardPauseMinutes(1)).toBe(1);
    expect(sendGuardPauseMinutes(0)).toBe(1);
    expect(sendGuardPauseMinutes(61)).toBe(2);
    expect(sendGuardPauseMinutes(undefined)).toBe(60);
  });

  it("a warned send shows the slow-down notice; any other outcome shows nothing", () => {
    const t = translator("en");
    expect(sendGuardWarnCopy(t, { action: "warn", conversationCountLastHour: 41 })).toContain("41 messages");
    expect(sendGuardWarnCopy(t, { action: "delay" })).toBeNull();
    expect(sendGuardWarnCopy(t, undefined)).toBeNull();
  });

  it("the held code has its own copy and other failures are unchanged", () => {
    expect(whatsappSendFailureCopy(translator("en"), { errorCode: "SEND_GUARD_BULK_SAME_TEXT" })).toContain("On hold");
    expect(whatsappSendFailureCopy(translator("en"), { errorCode: "WHATSAPP_NOT_CONNECTED" })).not.toContain("paused");
  });

  it("the composer hook wires the warning and the 429 body into this copy", () => {
    const hook = readFileSync(join(process.cwd(), "src/hooks/inbox/use-inbox-outbox.ts"), "utf8");
    expect(hook).toContain("sendGuardWarnCopy(t, data.guard)");
    expect(hook).toContain("whatsappSendFailureCopy(t, data)");
  });
});
