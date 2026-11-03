/**
 * @vitest-environment happy-dom
 */
// F-0029 (A): the conversation list row. Real code: InboxV3Queue and its row.
// Stand-ins: the workspace object (test-utils/inbox-fixture) and the router.
// NOT covered: fonts, truncation in a real browser, the live API.
import { describe, expect, it, vi } from "vitest";

import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

function rowsFor(locale: "ar" | "fr" | "en", chats: ReturnType<typeof makeChat>[]) {
  render(
    <InboxV3Queue
      workspace={makeInboxWorkspace({ chats, locale })}
      chats={chats}
      activeChatId={null}
      currentMemberId="member_fixture"
      queueFilter="all"
      workflowFilter="all"
      onQueueFilterChange={() => {}}
      onWorkflowFilterChange={() => {}}
    />,
  );
  const byName = new Map<string, HTMLElement>();
  for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-inbox-conversation]"))) {
    byName.set(row.textContent ?? "", row);
  }
  return (name: string) => {
    const row = Array.from(byName.entries()).find(([text]) => text.includes(name))?.[1];
    if (!row) throw new Error(`row for ${name} not rendered`);
    return row;
  };
}

const preview = (row: HTMLElement) =>
  row.querySelector("[data-inbox-preview]")?.textContent?.trim() ?? null;

const base = { lastMessageAt: Date.UTC(2026, 10, 3, 18, 0, 0), unread: 0 };

describe("conversation list: the last-message line", () => {
  const chats = [
    makeChat({ ...base, id: "a@s", conversationId: "c-a", name: "Sent photo", lastMessageText: "", lastMessageType: "image", lastMessageFromMe: true }),
    makeChat({ ...base, id: "b@s", conversationId: "c-b", name: "Sent voice", lastMessageText: "", lastMessageType: "audio", lastMessageFromMe: true }),
    makeChat({ ...base, id: "c@s", conversationId: "c-c", name: "Empty text", lastMessageText: "", lastMessageType: "text", lastMessageFromMe: true }),
    makeChat({ ...base, id: "d@s", conversationId: "c-d", name: "No preview", lastMessageText: undefined, lastMessageType: undefined, lastMessageFromMe: undefined }),
    makeChat({ ...base, id: "e@s", conversationId: "c-e", name: "Two lines", lastMessageText: "Hello\nsecond", lastMessageType: "text" }),
    makeChat({ ...base, id: "f@s", conversationId: "c-f", name: "Captioned", lastMessageText: "Colis prêt", lastMessageType: "image" }),
  ];

  it("English: a caption-less photo, a voice note and an empty text each say what they are", () => {
    const row = rowsFor("en", chats);
    expect(preview(row("Sent photo"))).toBe("Photo");
    expect(preview(row("Sent voice"))).toBe("Voice message");
    expect(preview(row("Empty text"))).toBe("Message could not be shown");
    expect(preview(row("Two lines"))).toBe("Hello");
    expect(preview(row("Captioned"))).toBe("Photo · Colis prêt");
  });

  it("no row ever shows the saved-history phrase; a chat with no preview data shows an empty line", () => {
    const row = rowsFor("en", chats);
    for (const name of ["Sent photo", "Sent voice", "Empty text", "No preview", "Two lines", "Captioned"]) {
      expect(row(name).textContent).not.toMatch(/savedHistory|Saved history|السجل المحفوظ|Historique enregistré/);
    }
    expect(preview(row("No preview"))).toBe("");
  });

  it("Arabic: the labels are Arabic", () => {
    const row = rowsFor("ar", chats);
    expect(preview(row("Sent photo"))).toBe("صورة");
    expect(preview(row("Sent voice"))).toBe("رسالة صوتية");
    expect(preview(row("Empty text"))).toBe("تعذّر عرض هذه الرسالة");
  });

  it("French: the labels are French", () => {
    const row = rowsFor("fr", chats);
    expect(preview(row("Sent photo"))).toBe("Photo");
    expect(preview(row("Sent voice"))).toBe("Message vocal");
    expect(preview(row("Empty text"))).toBe("Ce message ne peut pas être affiché");
  });
});
