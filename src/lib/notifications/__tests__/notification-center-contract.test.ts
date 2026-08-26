import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("FRC notification center source contract", () => {
  it("commits a PII-free recoverable marker inside the inbound message command", () => {
    const inbound = source("src/lib/whatsapp/inbound-processor.ts");
    const messageCreate = inbound.indexOf("await tx.message.create");
    const eventUpsert = inbound.indexOf("await tx.notificationEvent.upsert");
    const ingressApplied = inbound.indexOf(
      "await tx.providerIngressEvent.updateMany",
      eventUpsert,
    );

    expect(messageCreate).toBeGreaterThan(-1);
    expect(eventUpsert).toBeGreaterThan(messageCreate);
    expect(ingressApplied).toBeGreaterThan(eventUpsert);
    expect(inbound.slice(eventUpsert, ingressApplied)).not.toContain("body,");
    expect(inbound.slice(eventUpsert, ingressApplied)).not.toContain("contactName");
    expect(inbound.slice(eventUpsert, ingressApplied)).not.toContain("contactPhone");
  });

  it("defines deterministic per-actor lifecycle, delivery evidence, and scale indexes", () => {
    const schema = source("prisma/models/notification-center.prisma");
    const migration = source(
      "prisma/migrations/20260826110000_notification_center/migration.sql",
    );

    expect(schema).toContain("@@unique([eventId, recipientMemberId])");
    expect(schema).toContain("dedupeKey         String    @unique");
    expect(schema).toContain("readAt             DateTime?");
    expect(schema).toContain("archivedAt         DateTime?");
    expect(schema).toContain("lastRecoveredAt    DateTime?");
    expect(schema).toContain("attemptKey     String    @unique");
    expect(migration).toContain(
      '"OperationalNotification_recipientMemberId_archivedAt_createdAt_id_idx"',
    );
    expect(migration).toContain(
      '"OperationalNotification_recipientMemberId_category_severity_createdAt_id_idx"',
    );
  });

  it("uses the official Tauri plugin behind least-privilege capabilities", () => {
    const manifest = source("package.json");
    const cargo = source("src-tauri/Cargo.toml");
    const runtime = source("src-tauri/src/lib.rs");
    const capability = source("src-tauri/capabilities/default.json");

    expect(manifest).toContain('"@tauri-apps/plugin-notification": "2.3.3"');
    expect(cargo).toContain('tauri-plugin-notification = "2.3.3"');
    expect(cargo).toContain('rust-version = "1.77.2"');
    expect(runtime).toContain("tauri_plugin_notification::init()");
    expect(capability).toContain("notification:allow-notify");
    expect(capability).toContain("notification:allow-register-listener");
    expect(capability).not.toContain("notification:default");
  });

  it("keeps privacy export and erase authority complete", () => {
    const privacy = source("src/lib/privacy/lifecycle.ts");
    for (const model of [
      "NotificationDeliveryAttempt",
      "NotificationEvent",
      "NotificationPreference",
      "OperationalNotification",
    ]) {
      expect(privacy).toContain(`${model}:`);
    }
    expect(privacy).toContain("tx.notificationDeliveryAttempt.deleteMany");
    expect(privacy).toContain("tx.operationalNotification.deleteMany");
    expect(privacy).toContain("tx.notificationPreference.deleteMany");
    expect(privacy).toContain("tx.notificationEvent.deleteMany");
  });

  it("ships all new visible strings in AR, FR, and EN", () => {
    const locales = ["ar", "fr", "en"].map((locale) =>
      JSON.parse(source(`src/lib/i18n/locales/${locale}.json`)) as Record<
        string,
        string
      >,
    );
    const keys = [
      "notifications.description",
      "notifications.inbox.title",
      "notifications.inbox.body",
      "notifications.nativeDesktop",
      "notifications.preview",
      "notifications.enableQuietHours",
      "notifications.archive",
      "notifications.recover",
    ];
    for (const key of keys) {
      for (const locale of locales) expect(locale[key]).toBeTruthy();
    }
  });

  it("retains legacy operational alerts and hidden-window recovery", () => {
    const route = source("src/app/api/notifications/route.ts");
    const hook = source("src/hooks/use-notification-center.ts");
    const native = source("src/lib/notifications/notification-center.ts");

    expect(route).toContain("listLegacyOperationalNotifications");
    expect(hook).toContain(
      "const interval = window.setInterval(() => {\n      void reload();",
    );
    expect(native).toContain("sanitizeNativePreview");
  });
});
