import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Inbox operational workspace contract", () => {
  it("routes the Inbox through the durable workspace, compact recovery dock and desktop primer", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    expect(page).toContain("InboxDesktopPrimer");
    expect(page).toContain("InboxWorkspace");
    expect(page).toContain("WhatsAppIngressRecoveryDock");
    expect(page).not.toContain("<InboxLive");
    expect(page).not.toContain("WhatsAppIngressRecoveryPanel");
  });

  it("opens the newest permitted conversation on desktop without stealing mobile queue-first navigation", () => {
    const primer = read("src/components/inbox/inbox-desktop-primer.tsx");
    expect(primer).toContain("useMobile");
    expect(primer).toContain("if (mobile || conversation) return");
    expect(primer).toContain('fetch("/api/conversations"');
    expect(primer).toContain('next.set("conversation", firstId)');
    expect(primer).toContain("router.replace");
  });

  it("keeps persisted conversations authoritative independently of transport health", () => {
    const route = read("src/app/api/whatsapp/chats/route.ts");
    expect(route).toContain('where: { channel: "whatsapp", sourceId: { not: null } }');
    expect(route).toContain("conversationId: conversation.id");
    expect(route).toContain("assignmentVersion:");
    expect(route).toContain('source: "database"');
    expect(route).toContain("sidecarReachable");
    expect(route).toContain("SidecarUnavailableError");
    expect(route).toContain("SidecarRequestError");
    expect(route.indexOf("const conversations = await db.conversation.findMany")).toBeLessThan(
      route.indexOf("await sidecar.status()"),
    );
  });

  it("batches assignment versions at the reviewed authority boundary and coalesces live list refreshes", () => {
    const route = read("src/app/api/whatsapp/chats/route.ts");
    const assignment = read("src/lib/inbox/conversation-assignment.ts");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    expect(route).toContain("getConversationAssignmentVersions");
    expect(route).toContain("{ prisma: db, shop: shopContext }");
    expect(route).not.toContain("$queryRaw");
    expect(assignment).toContain("Prisma.join(unique)");
    expect(assignment).toContain('FROM "BusinessAggregateVersion"');
    expect(hook).toContain("CHAT_REFRESH_COALESCE_MS");
    expect(hook).toContain("scheduleChatsRefresh");
    expect(hook).toContain("if (chatRefreshTimerRef.current !== null) return");
  });

  it("opens command-search conversation results by canonical persisted conversation id", () => {
    const palette = read("src/components/command-palette.tsx");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const detailRoute = read("src/app/api/conversations/[id]/route.ts");

    expect(palette).toContain(
      'href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`',
    );
    expect(hook).toContain('import { useSearchParams } from "next/navigation"');
    expect(hook).toContain('searchParams.get("conversation")');
    expect(hook).toContain(
      "(chat) => chat.conversationId === requestedConversationId",
    );
    expect(hook).toContain(
      "`/api/conversations/${encodeURIComponent(requestedConversationId)}`",
    );
    expect(hook).toContain("pinnedDeepLinkChatRef");
    expect(hook).toContain("mergePinnedDeepLink");
    expect(detailRoute).toContain('requireTrustedAction("conversations.read")');
    expect(detailRoute).toContain("projectConversationForTrustedActor");
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

  it("reconciles committed workflow mutations back into canonical queue state", () => {
    const view = read("src/components/inbox/inbox-workspace.tsx");
    const controls = read("src/components/inbox/conversation-controls.tsx");
    expect(view).toContain("onUpdated={() => void refreshChats()}");
    expect(controls).toContain("onUpdated?.(newStatus)");
    expect(controls).toContain("onUpdated?.(next)");
    expect(controls).toContain("onUpdated?.(nextAssigneeId, body.assignment.version)");
  });

  it("preserves persisted thread history through provider degradation", () => {
    const messages = read("src/app/api/whatsapp/chats/[jid]/messages/route.ts");
    expect(messages).toContain("messageType: true");
    expect(messages).toContain("messageType: message.messageType");
    expect(messages).toContain("SidecarUnavailableError");
    expect(messages).toContain("SidecarRequestError");
    expect(messages.indexOf("const conversation = await db.conversation.findUnique")).toBeLessThan(
      messages.indexOf("await sidecar.status()"),
    );
  });

  it("keeps inbound recovery visible but bounded away from normal Inbox work", () => {
    const recovery = read(
      "src/components/inbox/whatsapp-ingress-recovery-dock.tsx",
    );
    expect(recovery).toContain('new Set(["retrying", "quarantined", "dead_letter"])');
    expect(recovery).toContain("RECOVERY_POLL_MS");
    expect(recovery).toContain("window.setInterval");
    expect(recovery).toContain('document.visibilityState === "visible"');
    expect(recovery).toContain("recoveryEvents.length === 0");
    expect(recovery).toContain('fetch("/api/whatsapp/inbound/recovery"');
    expect(recovery).toContain("reason.trim().length < 3");
    expect(recovery).toContain("<Sheet");
  });

  it("keeps composer guidance inside the locale authority", () => {
    const view = read("src/components/inbox/inbox-workspace.tsx");
    const copy = read("src/lib/i18n/inbox-workspace.ts");
    expect(view).toContain('copy("composerShortcut")');
    expect(view).not.toContain("Enter · Shift+Enter");
    expect(copy).toContain('composerShortcut: "Enter to send');
    expect(copy).toContain('composerShortcut: "Entrée pour envoyer');
    expect(copy).toContain('composerShortcut: "Enter للإرسال');
  });
});
