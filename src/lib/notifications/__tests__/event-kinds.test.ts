import { describe, expect, it } from "vitest";
import {
  KIND_SPECS,
  NOTIFICATION_KINDS,
  TO_CONFIRM_WARNING_AGE_MS,
  backupSeverity,
  buildEventKey,
  kindOfEventType,
  licenceSeverity,
  licenceThreshold,
  safeToken,
  toConfirmSeverity,
} from "../event-kinds";
import { isSafeNotificationLink } from "../native-client";

const T = (iso: string) => new Date(iso);

describe("the nine kinds", () => {
  it("are nine, all on in the app by default, each with its own words", () => {
    expect(NOTIFICATION_KINDS).toHaveLength(9);
    for (const kind of NOTIFICATION_KINDS) {
      const spec = KIND_SPECS[kind];
      expect(spec.inAppDefault).toBe(true);
      expect(spec.titleKey).toBe(`notifications.events.${kind}.title`);
      expect(spec.bodyKey).toBe(`notifications.events.${kind}.body`);
      expect(kindOfEventType(spec.eventType)).toBe(kind);
      expect(isSafeNotificationLink(spec.link)).toBe(true);
    }
    expect(kindOfEventType("whatsapp.message.received.v1")).toBe("whatsapp.received");
    expect(kindOfEventType("something.else")).toBeNull();
  });
});

describe("dedupe keys: KIND + SHOP-DAY + BUCKET", () => {
  it("order.new: same 10-minute bucket is one key, the next bucket another", () => {
    const k = (iso: string) => buildEventKey({ kind: "order.new", at: T(iso) });
    expect(k("2026-10-31T10:00:00Z")).toBe(k("2026-10-31T10:09:59Z"));
    expect(k("2026-10-31T10:09:59Z")).not.toBe(k("2026-10-31T10:10:00Z"));
  });
  it("whatsapp.received: per conversation per 5 minutes, never per message", () => {
    const k = (c: string, iso: string) => buildEventKey({ kind: "whatsapp.received", at: T(iso), subject: c });
    expect(k("c1", "2026-10-31T10:00:00Z")).toBe(k("c1", "2026-10-31T10:04:59Z"));
    expect(k("c1", "2026-10-31T10:04:59Z")).not.toBe(k("c1", "2026-10-31T10:05:00Z"));
    expect(k("c1", "2026-10-31T10:00:00Z")).not.toBe(k("c2", "2026-10-31T10:00:00Z"));
  });
  it("backup.failed: once per shop day (the day turns at 23:00 UTC)", () => {
    const k = (iso: string) => buildEventKey({ kind: "backup.failed", at: T(iso) });
    expect(k("2026-10-31T08:00:00Z")).toBe(k("2026-10-31T22:59:59Z"));
    expect(k("2026-10-31T22:59:59Z")).not.toBe(k("2026-10-31T23:00:00Z"));
  });
  it("delivery.failed: a flip-flop back to the same status makes no second key", () => {
    const k = (status: string, iso: string) =>
      buildEventKey({ kind: "delivery.failed", at: T(iso), subject: "d1", variant: status });
    expect(k("failed", "2026-10-31T10:00:00Z")).toBe(k("failed", "2026-10-31T16:00:00Z"));
    expect(k("failed", "2026-10-31T10:00:00Z")).not.toBe(k("returned", "2026-10-31T10:00:00Z"));
  });
  it("update.available once per version, ai.quota once per provider per pause", () => {
    const u = (v: string) => buildEventKey({ kind: "update.available", at: new Date(), variant: v });
    expect(u("1.4.2")).toBe(u("1.4.2"));
    expect(u("1.4.2")).not.toBe(u("1.4.3"));
    const a = (p: string, until: string) => buildEventKey({ kind: "ai.quota", at: new Date(), subject: p, variant: until });
    expect(a("gemini", "2026-10-31T14:30:00.000Z")).toBe(a("gemini", "2026-10-31T14:30:00.000Z"));
    expect(a("gemini", "2026-10-31T14:30:00.000Z")).not.toBe(a("groq", "2026-10-31T14:30:00.000Z"));
    expect(a("gemini", "2026-10-31T14:30:00.000Z")).not.toBe(a("gemini", "2026-11-01T09:00:00.000Z"));
  });
});

describe("severity rules", () => {
  it("orders to confirm: warning only when the oldest is MORE than 2 h old", () => {
    expect(TO_CONFIRM_WARNING_AGE_MS).toBe(7_200_000);
    expect(toConfirmSeverity(0)).toBe("info");
    expect(toConfirmSeverity(7_200_000)).toBe("info");
    expect(toConfirmSeverity(7_200_001)).toBe("warning");
  });
  it("backup: critical after the 2nd failure or 3 days, warning before", () => {
    expect(backupSeverity({ consecutiveFailures: 1, daysSinceGoodBackup: 0 })).toBe("warning");
    expect(backupSeverity({ consecutiveFailures: 2, daysSinceGoodBackup: 0 })).toBe("critical");
    expect(backupSeverity({ consecutiveFailures: 1, daysSinceGoodBackup: 2 })).toBe("warning");
    expect(backupSeverity({ consecutiveFailures: 1, daysSinceGoodBackup: 3 })).toBe("critical");
  });
  it("licence: told at 7, 3 and 1 days and when expired, never at 8; expired is critical", () => {
    expect(licenceThreshold(8)).toBeNull();
    expect(licenceThreshold(7)).toBe("7");
    expect(licenceThreshold(4)).toBe("7");
    expect(licenceThreshold(3)).toBe("3");
    expect(licenceThreshold(2)).toBe("3");
    expect(licenceThreshold(1)).toBe("1");
    expect(licenceThreshold(0)).toBe("expired");
    expect(licenceThreshold(-5)).toBe("expired");
    expect(licenceSeverity("expired")).toBe("critical");
    expect(licenceSeverity("1")).toBe("warning");
  });
});

describe("marker tokens carry no personal data", () => {
  it("refuses phones, names with spaces, emails and long text", () => {
    for (const bad of ["0550123456", "+213550123456", "213550123456", "Amine Benali", "a@b.dz", "x".repeat(65), ""]) {
      expect(safeToken(bad)).toBe("none");
    }
    expect(safeToken("cm1abc234def5678ghi")).toBe("cm1abc234def5678ghi");
    expect(safeToken("1.4.2")).toBe("1.4.2");
    expect(safeToken(undefined)).toBe("none");
  });
});

describe("toast links", () => {
  it("allows the listed screens and nothing else", () => {
    for (const ok of [
      "/inbox?conversation=abc123", "/orders?status=pending", "/orders", "/deliveries",
      "/settings?section=backup", "/settings?section=license",
    ]) expect(isSafeNotificationLink(ok)).toBe(true);
    for (const bad of [
      "/settings", "/settings?section=security", "/orders?status=pending&x=1", "/orders/",
      "//evil.example", "https://evil.example", "/admin", "/orders?status=pending#x", "javascript:alert(1)", null, 5,
    ]) expect(isSafeNotificationLink(bad)).toBe(false);
  });
});
