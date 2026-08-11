import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Inbox operational workspace contract", () => {
  it("routes the Inbox through the new durable workspace and compact recovery dock", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    expect(page).toContain("InboxWorkspace");
    expect(page).toContain("WhatsAppIngressRecoveryDock");
    expect(page).not.toContain("<InboxLive");
    expect(page).not.toContain("WhatsAppIngressRecoveryPanel");
  });

  it("keeps persisted conversations authoritative independently of transport health", () => {
    const route = read("src/app/api/whatsapp/chats/route.ts");
    expect(route).toContain('where: { channel: "whatsapp", sourceId: { not: null } }');
    expect(route).toContain("conversationId: conversation.id");
    expect(route).toContain("assignmentVersion:");
    expect(route).toContain('source: "database"');
    expect(route).toContain("sidecarReachable");
    expect(route.indexOf("const conversations = await db.conversation.findMany")).toBeLessThan(
      route.indexOf("await sidecar.status()"),
    );
  });

  it("separates Inbox transport/state logic from presentation", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const view = read("src/components/inbox/inbox-workspace.tsx");
    expect(hook).toContain('fetch("/api/whatsapp/chats?limit=100"');
    expect(hook).toContain("loadFallbackProjection");
    expect(hook).not.toContain('setMode("seeded")');
    expect(hook).not.toContain("inbox.demo");
    expect(hook).toContain("monitorWhatsAppEffect");
    expect(hook).toContain("retryFailedMessage");
    expect(view).toContain('data-inbox-workspace="v2"');
    expect(view).toContain("ConversationControls");
    expect(view).toContain("ConversationCollaborationPanel");
    expect(view).toContain("MessageExtraction");
  });

  it("preserves persisted activity/message types through WhatsApp history", () => {
    const messages = read("src/app/api/whatsapp/chats/[jid]/messages/route.ts");
    expect(messages).toContain("messageType: true");
    expect(messages).toContain("messageType: message.messageType");
  });

  it("keeps inbound recovery visible but bounded away from normal Inbox work", () => {
    const recovery = read(
      "src/components/inbox/whatsapp-ingress-recovery-dock.tsx",
    );
    expect(recovery).toContain('new Set(["retrying", "quarantined", "dead_letter"])');
    expect(recovery).toContain("recoveryEvents.length === 0");
    expect(recovery).toContain('fetch("/api/whatsapp/inbound/recovery"');
    expect(recovery).toContain("reason.trim().length < 3");
    expect(recovery).toContain("<Sheet");
  });
});
