/**
 * @vitest-environment happy-dom
 */
/**
 * Founder (4 Nov 2026): the thread header ends in FOUR unlabelled icon buttons
 * (panel, AI sparkle in a box, envelope, search). Rendered with the real
 * header: ONE emphasised primary action that says what it does in words,
 * the quiet icons grouped in a labelled toolbar, every icon button named,
 * phone targets 40 px, the name above the status/channel line.
 */
import { describe, expect, it, vi } from "vitest";

import { InboxThreadHeader } from "@/components/inbox/inbox-thread-header";
import { getInboxWorkspaceCopy, type InboxWorkspaceKey } from "@/lib/i18n/inbox-workspace";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

type Locale = "ar" | "fr" | "en";

function renderHeader(locale: Locale, isMobile = false) {
  const chat = makeChat({ id: "213555000002@s.whatsapp.net", transportId: "213555000002@s.whatsapp.net", conversationId: "c_h", name: "Daf store" });
  const workspace = makeInboxWorkspace({ chats: [chat], locale });
  const copy = (key: InboxWorkspaceKey) => getInboxWorkspaceCopy(locale, key);
  return render(
    <InboxThreadHeader
      activeChat={chat as never}
      selectedCandidate={null}
      threadMessages={[]}
      isMobile={isMobile}
      isWhatsAppConversation
      canUpdateConversation
      locale={locale}
      t={((key: string) => key) as never}
      copy={copy as never}
      markUnread={vi.fn() as never}
      refreshChats={vi.fn() as never}
      threadSearchOpen={false}
      setThreadSearchOpen={vi.fn()}
      onBackToQueue={() => {}}
      contextPanel={null}
    />,
  );
  void workspace;
}

describe("thread header actions", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`has one labelled primary action and a named, grouped toolbar (${locale})`, () => {
      const copy = { threadOrderAction: getInboxWorkspaceCopy(locale, "threadOrderAction"), threadActions: getInboxWorkspaceCopy(locale, "threadActions") };
      const { container } = renderHeader(locale);
      const primary = container.querySelector('[data-inbox-primary-action="true"]');
      expect(primary).not.toBeNull();
      // words, not just a sparkle: the visible text is the accessible name
      expect(primary?.textContent?.trim()).toBe(copy.threadOrderAction);
      expect(primary?.getAttribute("aria-label")).toBe(copy.threadOrderAction);

      const toolbar = container.querySelector('[role="toolbar"]');
      expect(toolbar?.getAttribute("aria-label")).toBe(copy.threadActions);
      const quiet = Array.from(toolbar?.querySelectorAll("button") ?? []);
      expect(quiet.length).toBe(3);
      for (const button of quiet) {
        expect(button.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(2);
      }
      // the primary action is NOT inside the quiet group, and is the only one that is not ghost
      expect(toolbar?.contains(primary as Element)).toBe(false);
      expect(container.querySelectorAll('[data-inbox-primary-action="true"]').length).toBe(1);
    });

    it(`the dictionary has the two new strings (${locale})`, () => {
      expect(getInboxWorkspaceCopy(locale, "threadActions").length).toBeGreaterThan(5);
      expect(getInboxWorkspaceCopy(locale, "threadOrderAction").length).toBeGreaterThan(3);
    });
  }

  it("on the phone the back button, the primary action and the quiet icons are at least 40 px", () => {
    const { container } = renderHeader("ar", true);
    const buttons = [
      ...Array.from(container.querySelectorAll('[data-inbox-primary-action="true"]')),
      ...Array.from(container.querySelectorAll('[role="toolbar"] button')),
      ...Array.from(container.querySelectorAll('button[aria-label="common.backToConversations"]')),
    ];
    expect(buttons.length).toBe(5);
    for (const button of buttons) {
      expect(button.className, button.getAttribute("aria-label") ?? "").toMatch(/(?:^|\s)(?:max-sm:)?size-(?:10|11|12)(?:\s|$)/);
    }
  });

  it("the name is 15 px with a 24 px line (Arabic ascenders are not cut) and the avatar yields on narrow phones", () => {
    const { container } = renderHeader("ar", true);
    const name = container.querySelector("header h3");
    expect(name?.className).toMatch(/text-\[15px\]/);
    expect(name?.className).toMatch(/leading-6/);
    expect(container.querySelector('[data-slot="avatar"]')?.className).toMatch(/max-\[480px\]:hidden/);
  });

  it("the status chip is a real control: 40 px tall on the phone and shows keyboard focus", () => {
    const { container } = renderHeader("ar", true);
    const chip = container.querySelector('header button[aria-haspopup="menu"]');
    expect(chip).not.toBeNull();
    expect(chip?.className).toMatch(/max-sm:min-h-10/);
    expect(chip?.className).toMatch(/focus-visible:ring-2/);
  });
});
