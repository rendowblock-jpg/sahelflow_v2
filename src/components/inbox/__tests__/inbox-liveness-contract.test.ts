import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n";
import { getInboxLivenessRuntimeTranslation } from "@/lib/i18n/inbox-liveness-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const LIVENESS_KEYS = [
  "inbox.liveness.unreadMessages",
  "inbox.liveness.newMessageTitle",
  "inbox.liveness.newMessageBody",
  "inbox.liveness.openInbox",
  "inbox.liveness.toastToggle",
  "inbox.liveness.soundToggle",
  "inbox.liveness.lastActive",
  "inbox.liveness.alertsMenu",
] as const;

const locales: readonly Locale[] = ["en", "fr", "ar"];

describe("Inbox liveness (R4-a) contract", () => {
  it("routes the unread badge through the canonical navigation registry", () => {
    const navigation = read("src/components/layout/navigation.ts");
    expect(navigation).toContain("unreadBadge?: boolean");
    expect(navigation).toMatch(
      /id: "inbox",[\s\S]*?unreadBadge: true,/,
    );
    // Only the inbox declares a live unread signal today.
    expect(navigation.match(/unreadBadge: true/g)).toHaveLength(1);
  });

  it("renders a live, capped, aria-labelled unread badge on the sidebar inbox item", () => {
    const sidebar = read("src/components/layout/sidebar.tsx");
    expect(sidebar).toContain("useInboxUnread()");
    expect(sidebar).toContain("useNewMessageAlerts()");
    expect(sidebar).toContain('data-inbox-unread-badge="true"');
    expect(sidebar).toContain('unreadCount > 99 ? "99+" : unreadCount');
    expect(sidebar).toContain("inbox.liveness.unreadMessages");
    // The sidebar owns the single poll: both hooks mount there.
    expect(sidebar).toContain("item.unreadBadge ? inboxUnreadTotal : undefined");
  });

  it("exposes a cheap read-only unread summary without touching the owned routes", () => {
    const route = read("src/app/api/conversations/unread-summary/route.ts");
    expect(route).toContain("requireTrustedAction");
    expect(route).toContain("_sum: { unreadCount: true }");
    // The badge reads the same unreadCount column the inbox renders.
    expect(route).toContain("unreadCount: { gt: 0 }");
    // Only inbound bodies can become a "new message" preview.
    expect(route).toContain('where: { direction: "inbound" }');
    // Contact identity is projected through the trusted-actor policy.
    expect(route).toContain("projectConversationForTrustedActor");
    expect(route).not.toContain("POST");
    expect(route).not.toContain("PATCH");
    expect(route).not.toContain("DELETE");

    // The PR-#355-owned collection route stays byte-identical (read-only sibling).
    const gitStatus = read("src/app/api/conversations/route.ts");
    expect(gitStatus).toContain("GET /api/conversations");
    expect(gitStatus).not.toContain("unread-summary");
  });

  it("polls the summary on a 15s cadence that pauses while hidden and refreshes on focus", () => {
    const hook = read("src/hooks/use-inbox-unread.ts");
    expect(hook).toContain("INBOX_UNREAD_REFRESH_MS = 15_000");
    expect(hook).toContain("refreshInterval: INBOX_UNREAD_REFRESH_MS");
    expect(hook).toContain("revalidateOnFocus: true");
    expect(hook).toContain("refreshWhenHidden: false");

    // The alerts hook shares the exact SWR key — one network cadence total.
    const alerts = read("src/hooks/use-new-message-alerts.ts");
    expect(alerts).toContain("INBOX_UNREAD_SUMMARY_KEY");
    expect(alerts).toContain("refreshInterval: 15_000");
  });

  it("keeps new-message alerts one-per-cycle and out of the inbox/background", () => {
    const alerts = read("src/hooks/use-new-message-alerts.ts");
    // Seeding: pre-existing unread never announces as new on mount.
    expect(alerts).toContain("previousTotalRef");
    expect(alerts).toContain("shouldFireNewMessageAlert");
    expect(alerts).toContain("documentHidden");
    // Toast action deep-links to the inbox.
    expect(alerts).toContain('router.push("/inbox")');
  });

  it("embeds a bounded two-tone chime with no external audio assets", () => {
    const alerts = read("src/hooks/use-new-message-alerts.ts");
    expect(alerts).toContain("CHIME_WAV_BASE64");
    // No network fetch and no public asset path can carry the sound.
    expect(alerts).not.toMatch(/fetch\([^)]*\.(mp3|wav|ogg)/);
    expect(alerts).not.toContain("/sounds/");
    expect(alerts).not.toContain("/public/");

    const base64 = alerts.match(/CHIME_WAV_BASE64 =\s*"([A-Za-z0-9+/=]+)"/)?.[1];
    expect(base64).toBeDefined();
    const bytes = Buffer.from(base64 ?? "", "base64");
    // Under the 8 KB budget.
    expect(bytes.length).toBeLessThan(8 * 1024);
    // A real, tiny WAV: RIFF/WAVE container, mono PCM.
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    const sampleRate = bytes.readUInt32LE(24);
    const durationMs = Math.round(((bytes.length - 44) / 2 / sampleRate) * 1000);
    expect(durationMs).toBeGreaterThanOrEqual(100);
    expect(durationMs).toBeLessThanOrEqual(200);
  });

  it("persists the toast/sound toggles per device with opposite defaults", () => {
    const alerts = read("src/hooks/use-new-message-alerts.ts");
    expect(alerts).toContain('"sf_inbox_toast_alerts_v1"');
    expect(alerts).toContain('"sf_inbox_sound_alerts_v1"');
    expect(alerts).toContain("NEW_MESSAGE_TOAST_DEFAULT = true");
    expect(alerts).toContain("NEW_MESSAGE_SOUND_DEFAULT = false");
    expect(alerts).toContain("window.localStorage.setItem");
  });

  it("puts the alert toggles in the inbox header overflow menu", () => {
    const header = read("src/components/inbox/inbox-v3-header.tsx");
    expect(header).toContain("AlertPreferencesMenu");
    expect(header).toContain("DropdownMenuCheckboxItem");
    expect(header).toContain("writeNewMessageToastEnabled");
    expect(header).toContain("writeNewMessageSoundEnabled");
    expect(header).toContain("playNewMessageChime");
    expect(header).toContain("inbox.liveness.alertsMenu");
    expect(header).toContain("inbox.liveness.toastToggle");
    expect(header).toContain("inbox.liveness.soundToggle");
    // The existing header affordances stay intact.
    expect(header).toContain("WhatsAppIngressRecoveryDock");
    expect(header).toContain("ConnectionState");
  });

  it("falls back to a last-active hint in the thread header (no sidecar presence)", () => {
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(thread).toContain("ThreadLastActive");
    expect(thread).toContain("LAST_ACTIVE_MIN_IDLE_MS = 5 * 60_000");
    expect(thread).toContain('data-inbox-last-active="true"');
    // The hint derives from the persisted lastMessageAt, never a presence event.
    expect(thread).toContain("activeChat.lastMessageAt");
    expect(thread).toContain("inbox.liveness.lastActive");
    // The socket layer has no presence contract to lean on.
    const socketTypes = read("src/lib/whatsapp/types.ts");
    expect(socketTypes).not.toMatch(/presence|typing|composing/i);
  });

  it("keeps the v3 queue unread styling (bold name + preview + capped count badge)", () => {
    const queue = read("src/components/inbox/inbox-v3-queue.tsx");
    expect(queue).toContain('data-inbox-unread={chat.unread > 0 ? "true" : "false"}');
    expect(queue).toMatch(
      /chat\.unread > 0 \? "font-semibold text-foreground" : "font-medium"/,
    );
    expect(queue).toContain('chat.unread > 99 ? "99+" : chat.unread');
  });

  it("ships every liveness key in English, French and Arabic via the runtime chain", () => {
    for (const locale of locales) {
      for (const key of LIVENESS_KEYS) {
        const direct = getInboxLivenessRuntimeTranslation(locale, key);
        expect(direct, `${locale} must define ${key}`).toBeTypeOf("string");
        expect(direct?.trim()).not.toBe("");
        expect(direct).not.toBe(key);
        // Registered in the shared resolver both client and server translators use.
        const chained = getRuntimeTranslation(locale, key);
        expect(chained).toBe(direct);
      }
    }
    expect(
      getRuntimeTranslation("en", "inbox.liveness.unknown"),
    ).toBeUndefined();
  });

  it("interpolates the count and relative-time parameters", () => {
    const en = getRuntimeTranslation("en", "inbox.liveness.unreadMessages");
    expect(en).toContain("{{count}}");
    const lastActive = getRuntimeTranslation("fr", "inbox.liveness.lastActive");
    expect(lastActive).toContain("{{time}}");
    const body = getRuntimeTranslation("ar", "inbox.liveness.newMessageBody");
    expect(body).toContain("{{name}}");
    expect(body).toContain("{{preview}}");
  });
});
