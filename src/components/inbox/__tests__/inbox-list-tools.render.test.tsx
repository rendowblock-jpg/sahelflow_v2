/**
 * @vitest-environment happy-dom
 */
// s42 inbox lane, step 3: the list's tools row and the queue tabs.
// Real code: InboxV3Queue. Stand-ins: the workspace object and the router.
// NOT covered: the painted size of the targets on a phone (measured by the sweep).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { fireEvent, render, screen, within } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

const LOCALES = ["en", "fr", "ar"] as const;
const chats = [makeChat({ id: "a@s", conversationId: "c-a", name: "Amina" })];

function mount(locale: (typeof LOCALES)[number], onQueueFilterChange = vi.fn(), queueFilter: "all" | "mine" | "unread" | "archived" = "all") {
  render(
    <InboxV3Queue
      workspace={makeInboxWorkspace({ chats, locale })}
      chats={chats}
      activeChatId={null}
      currentMemberId="member_fixture"
      queueFilter={queueFilter}
      workflowFilter="all"
      onQueueFilterChange={onQueueFilterChange}
      onWorkflowFilterChange={() => {}}
    />,
  );
  return onQueueFilterChange;
}

describe("tools row: every icon button has a name and a visible tooltip, grouped", () => {
  it.each(LOCALES)("%s: one labelled group; each button has aria-label === title (from the dictionary)", (locale) => {
    mount(locale);
    // The fixture's copy() echoes the key; the dictionary check is the next test.
    const group = screen.getByRole("group", { name: "queueTools" });
    const groupName = getInboxWorkspaceCopy(locale, "queueTools");
    const buttons = within(group).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const b of buttons) {
      const name = b.getAttribute("aria-label") ?? "";
      expect(name.length, b.outerHTML.slice(0, 80)).toBeGreaterThan(1);
      expect(b.getAttribute("title")).toBe(name);
    }
    expect(groupName).not.toBe("queueTools");
  });

  it("the three languages say different things (no English left in fr/ar)", () => {
    const names = LOCALES.map((l) => getInboxWorkspaceCopy(l, "queueTools"));
    expect(new Set(names).size).toBe(3);
  });
});

describe("queue tabs are real tabs", () => {
  it.each(LOCALES)("%s: tablist with 4 tabs, one aria-selected, roving tabindex, a tabpanel", (locale) => {
    mount(locale, vi.fn(), "mine");
    const list = screen.getByRole("tablist");
    expect(list.getAttribute("aria-label")).toBeTruthy();
    const tabs = within(list).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs.find((t) => t.getAttribute("aria-selected") === "true")?.tabIndex).toBe(0);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs.find((t) => t.getAttribute("aria-selected") === "true")?.id);
    expect(tabs.every((t) => t.getAttribute("aria-controls") === panel.id)).toBe(true);
  });

  it("LTR: ArrowRight goes to the next tab, ArrowLeft to the previous, End/Home to the ends", () => {
    const onChange = mount("en");
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("mine");
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("archived");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("archived"); // wraps
  });

  it("RTL (Arabic): ArrowLeft goes to the next tab (reading direction)", () => {
    const onChange = mount("ar");
    const tabs = screen.getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("mine");
  });

  it("clicking a tab selects it", () => {
    const onChange = mount("fr");
    fireEvent.click(screen.getAllByRole("tab")[2]!);
    expect(onChange).toHaveBeenLastCalledWith("unread");
  });
});

describe("phone targets", () => {
  const src = readFileSync(join(process.cwd(), "src/components/inbox/inbox-v3-queue.tsx"), "utf8");
  it("tools, tabs and the search field are 40 px on a phone (max-sm)", () => {
    expect(src).toMatch(/styles\.tab,[\s\S]{0,200}max-sm:h-10/);
    expect((src.match(/size-8 max-sm:size-10/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/h-9 max-sm:h-10/);
  });
});
