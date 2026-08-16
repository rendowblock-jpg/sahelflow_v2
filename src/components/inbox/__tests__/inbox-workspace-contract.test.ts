import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Inbox Class-AAA operations desk contract", () => {
  it("routes Inbox through one cohesive operations desk with bounded recovery", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    const header = read("src/components/inbox/inbox-operations-header.tsx");

    expect(page).toContain("InboxOperationsDesk");
    expect(page).not.toContain("InboxDesktopPrimer");
    expect(page).not.toContain("InboxWorkspace");
    expect(desk).toContain('data-inbox-operations-desk="true"');
    expect(header).toContain("WhatsAppIngressRecoveryDock");
    expect(header).toContain("canRetryIngress");
  });

  it("selects desktop work through workspace state instead of DOM click priming", () => {
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    expect(desk).toContain("visibleQueueChats[0] ?? chats[0]");
    expect(desk).toContain("selectChat(first)");
    expect(desk).toContain("if (isMobile || loadingChats || activeChat || requestedConversationId) return");
    expect(desk).not.toContain("MutationObserver");
    expect(desk).not.toContain("querySelector");
    expect(desk).not.toContain(".click()");
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

  it("preserves assignment versions and coalesced live refresh at the authority boundary", () => {
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
  });

  it("opens search and command results through canonical persisted conversation ids", () => {
    const palette = read("src/components/command-palette.tsx");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const queue = read("src/components/inbox/inbox-work-queue.tsx");

    expect(palette).toContain(
      'href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`',
    );
    expect(hook).toContain('searchParams.get("conversation")');
    expect(hook).toContain("pinnedDeepLinkChatRef");
    expect(queue).toContain("/api/conversations/search?q=");
    expect(queue).toContain("router.push(`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`)");
  });

  it("keeps transport and durable outbox authority in the existing workspace hook", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");

    expect(desk).toContain("useInboxWorkspace()");
    expect(hook).toContain('fetch("/api/whatsapp/chats?limit=100"');
    expect(hook).toContain("loadFallbackProjection");
    expect(hook).toContain("monitorWhatsAppEffect");
    expect(hook).toContain("retryFailedMessage");
    expect(thread).toContain("retryFailedMessage");
    expect(thread).toContain("MessageStatus");
  });

  it("unifies workflow routing and private notes without weakening concurrency", () => {
    const panel = read("src/components/inbox/inbox-customer-work-panel.tsx");
    const collaboration = read("src/components/inbox/conversation-collaboration-inline.tsx");
    const controls = read("src/components/inbox/conversation-controls.tsx");

    expect(panel).toContain("ConversationControls");
    expect(panel).toContain("ConversationCollaborationInline");
    expect(collaboration).toContain("expectedVersion");
    expect(collaboration).toContain("idempotencyKey");
    expect(collaboration).toContain("response.status === 409");
    expect(controls).toContain("expectedVersion: version");
    expect(controls).toContain("idempotencyKey: idempotencyKey(fingerprint)");
  });

  it("keeps customer, contact, order and financial context independently permission-filtered", () => {
    const route = read("src/app/api/inbox/context/[id]/route.ts");
    expect(route).toContain('"customers.read"');
    expect(route).toContain('"customers.contact.read"');
    expect(route).toContain('"orders.read"');
    expect(route).toContain('"orders.financials.read"');
    expect(route).toContain("totalSpent: canReadFinancials ? customer.totalSpent : null");
    expect(route).toContain("totalPrice: canReadFinancials ? order.totalPrice : null");
  });

  it("makes persistent search operational without moving plaintext message search to cloud", () => {
    const route = read("src/app/api/conversations/search/route.ts");
    expect(route).toContain('requireTrustedAction("conversations.read")');
    expect(route).toContain('"customers.contact.read"');
    expect(route).toContain("sourceId: canReadContact ? conversation.sourceId : null");
    expect(route).toContain("conversation.messages.some");
    expect(route).toContain("take: 500");
  });

  it("represents persisted non-text message types honestly until durable media bytes exist", () => {
    const messages = read("src/app/api/whatsapp/chats/[jid]/messages/route.ts");
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");
    const copy = read("src/lib/i18n/inbox-workspace.ts");

    expect(messages).toContain("messageType: true");
    expect(messages).toContain("messageType: message.messageType");
    expect(thread).toContain("isMediaMessage");
    expect(thread).toContain('copy("mediaMetadataOnly")');
    expect(copy).toContain("does not expose durable local media bytes yet");
  });

  it("keeps one human-reviewed order candidate instead of extraction cards under every message", () => {
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");
    const panel = read("src/components/inbox/inbox-customer-work-panel.tsx");

    expect(desk).toContain("selectedCandidate");
    expect(thread).not.toContain("MessageExtraction");
    expect(thread).toContain('copy("chooseOrderMessage")');
    expect(panel).toContain("MessageExtraction");
    expect(panel).toContain("orderCandidate");
  });

  it("keeps inbound recovery visible but bounded away from normal conversation work", () => {
    const recovery = read("src/components/inbox/whatsapp-ingress-recovery-dock.tsx");
    expect(recovery).toContain('new Set(["retrying", "quarantined", "dead_letter"])');
    expect(recovery).toContain("RECOVERY_POLL_MS");
    expect(recovery).toContain('document.visibilityState === "visible"');
    expect(recovery).toContain('fetch("/api/whatsapp/inbound/recovery"');
    expect(recovery).toContain("reason.trim().length < 3");
  });

  it("keeps new desk copy governed in English French and Arabic", () => {
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");
    const copy = read("src/lib/i18n/inbox-workspace.ts");
    expect(thread).toContain('copy("composerShortcut")');
    expect(thread).not.toContain("Enter · Shift+Enter");
    expect(copy).toContain('queueMine: "Mine"');
    expect(copy).toContain('queueMine: "À moi"');
    expect(copy).toContain('queueMine: "مسندة إليّ"');
    expect(copy).toContain('composerShortcut: "Enter to send');
    expect(copy).toContain('composerShortcut: "Entrée pour envoyer');
    expect(copy).toContain('composerShortcut: "Enter للإرسال');
  });
});
