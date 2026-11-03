/**
 * @vitest-environment happy-dom
 */
/**
 * F-0028 — the conversation list row and the thread header never show a raw
 * WhatsApp id (`<digits>@lid`, `<digits>@s.whatsapp.net`, `<digits>@g.us`) as
 * visible text or in an aria-label / title / alt, and the avatar circle never
 * shows a digit. Rendered with the real components (not source text).
 */
import { describe, expect, it, vi } from "vitest";

import { InboxThreadHeader } from "@/components/inbox/inbox-thread-header";
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

const RAW_ID = /\d{8,}@(lid|s\.whatsapp\.net|g\.us)/;
const TEXT_ATTRIBUTES = ["aria-label", "title", "alt", "aria-description", "placeholder", "aria-valuetext"];

const LID_A = "202460866064562@lid";
const LID_B = "54783113175105@lid";
const PN = "213791999157@s.whatsapp.net";
const GROUP = "120363025123456789@g.us";

/** Raw ids in anything a person or a screen reader can read. */
function rawIdLeaks(root: Element): string[] {
  const leaks: string[] = [];
  if (RAW_ID.test(root.textContent ?? "")) leaks.push(`text: ${root.textContent}`);
  for (const element of Array.from(root.querySelectorAll("*"))) {
    for (const attribute of TEXT_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value && RAW_ID.test(value)) leaks.push(`${attribute}: ${value}`);
    }
  }
  return leaks;
}

function unnamedChats() {
  return [
    makeChat({ id: LID_A, transportId: LID_A, conversationId: "c_a", name: LID_A, phone: undefined }),
    makeChat({ id: LID_B, transportId: LID_B, conversationId: "c_b", name: LID_B, phone: undefined }),
    makeChat({ id: PN, transportId: PN, conversationId: "c_c", name: "213791999157", phone: "213791999157" }),
    makeChat({ id: GROUP, transportId: GROUP, conversationId: "c_d", name: GROUP, phone: undefined }),
    makeChat({ id: "213555000002@s.whatsapp.net", transportId: "213555000002@s.whatsapp.net", conversationId: "c_e", name: "Amina B." }),
  ];
}

function renderQueue(locale: "ar" | "fr" | "en") {
  const chats = unnamedChats();
  const workspace = makeInboxWorkspace({ chats, locale });
  return render(
    <InboxV3Queue
      workspace={workspace}
      chats={chats}
      activeChatId={null}
      currentMemberId="member_fixture"
      queueFilter="all"
      workflowFilter="all"
      onQueueFilterChange={() => {}}
      onWorkflowFilterChange={() => {}}
    />,
  );
}

function renderHeader(locale: "ar" | "fr" | "en", activeChat: ReturnType<typeof makeChat>) {
  const identity = (key: string) => key;
  return render(
    <InboxThreadHeader
      activeChat={activeChat as never}
      selectedCandidate={null}
      threadMessages={[]}
      isMobile={false}
      isWhatsAppConversation
      canUpdateConversation={false}
      locale={locale}
      t={identity as never}
      copy={identity as never}
      markUnread={vi.fn() as never}
      refreshChats={vi.fn() as never}
      threadSearchOpen={false}
      setThreadSearchOpen={vi.fn()}
      onBackToQueue={() => {}}
      contextPanel={null}
    />,
  );
}

describe("F-0028 conversation list row", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    it(`shows no raw id and no digit avatar (${locale})`, () => {
      const { container } = renderQueue(locale);
      const rows = Array.from(container.querySelectorAll("[data-inbox-conversation]"));
      expect(rows.length).toBe(5);

      expect(rawIdLeaks(container)).toEqual([]);

      for (const row of rows) {
        const avatar = row.querySelector("span[aria-hidden='true']");
        expect(avatar, "avatar slot").not.toBeNull();
        expect(avatar?.textContent ?? "").not.toMatch(/\d/);
      }
    });
  }

  it("names an unnamed LID row with a neutral label and a stable suffix (en)", () => {
    const { container } = renderQueue("en");
    const text = container.textContent ?? "";
    expect(text).toContain("Unknown contact ·4562");
    expect(text).toContain("Unknown contact ·5105");
    expect(text).toContain("Group ·6789");
    expect(text).toContain("+213 791 99 91 57");
    expect(text).toContain("Amina B.");
  });

  it("uses the Arabic and French wording on those locales", () => {
    expect(renderQueue("ar").container.textContent).toContain("جهة اتصال غير معروفة");
    expect(renderQueue("fr").container.textContent).toContain("Contact inconnu");
  });

  it("keeps a real name's first letter in the avatar", () => {
    const { container } = renderQueue("en");
    const row = container.querySelector("[data-inbox-conversation='213555000002@s.whatsapp.net']");
    expect(row?.querySelector("span[aria-hidden='true']")?.textContent).toBe("A");
  });
});

describe("F-0028 thread header", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    it(`shows no raw id in a LID header (${locale})`, () => {
      const chat = makeChat({ id: LID_A, transportId: LID_A, name: LID_A, phone: "202460866064562" });
      const { container } = renderHeader(locale, chat);
      expect(rawIdLeaks(container)).toEqual([]);
      const avatar = container.querySelector("[data-slot='avatar-fallback']");
      expect(avatar?.textContent ?? "").not.toMatch(/\d/);
      // The LID digits stored in the phone column are not a phone number.
      expect(container.textContent ?? "").not.toMatch(/\d{9,}/);
    });
  }

  it("titles the header with the neutral label, a phone only from a phone jid", () => {
    const lid = renderHeader("en", makeChat({ id: LID_A, transportId: LID_A, name: LID_A, phone: undefined }));
    expect(lid.container.querySelector("h3")?.textContent).toBe("Unknown contact ·4562");
    lid.unmount();

    const pn = renderHeader("en", makeChat({ id: PN, transportId: PN, name: "", phone: undefined }));
    expect(pn.container.querySelector("h3")?.textContent).toBe("+213 791 99 91 57");
  });
});
