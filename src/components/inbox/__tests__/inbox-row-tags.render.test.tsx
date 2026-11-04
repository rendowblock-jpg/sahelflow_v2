/**
 * @vitest-environment happy-dom
 */
// s42 inbox lane, steps 1-2: the conversation row shows a status tag ONLY when
// the state needs the seller (needs reply, draft waiting, snoozed, assigned,
// sample, priority); ONE unread signal (count badge + bold name); the selected
// marker, avatar and row height are fixed numbers in the module css.
// Real code: InboxV3Queue + its row + the module css text.
// NOT covered: the painted pixels (measured by the sweep, see results/inbox-design.md).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { rowChipFor } from "@/components/inbox/inbox-queue-model";
import { DEMO_ID_PREFIX } from "@/lib/demo/demo-tag";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

const css = readFileSync(join(process.cwd(), "src/components/inbox/inbox-v3-workspace.module.css"), "utf8");
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`css rule ${selector} not found`);
  return css.slice(start, css.indexOf("}", start));
};

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
  return (id: string) => {
    const row = document.querySelector<HTMLElement>(`[data-inbox-conversation="${id}"]`);
    if (!row) throw new Error(`row ${id} not rendered`);
    return row;
  };
}

const t0 = Date.UTC(2026, 10, 3, 18, 0, 0);
const chats = [
  makeChat({ id: "open@s", conversationId: "c-open", name: "Open quiet", lastMessageAt: t0, workflow: { status: "open" } }),
  makeChat({ id: "none@s", conversationId: "c-none", name: "No workflow", lastMessageAt: t0, workflow: {} }),
  makeChat({ id: "done@s", conversationId: "c-done", name: "Resolved quiet", lastMessageAt: t0, workflow: { status: "resolved" } }),
  makeChat({ id: "pend@s", conversationId: "c-pend", name: "Needs reply", lastMessageAt: t0, workflow: { status: "pending" } }),
  makeChat({ id: "snz@s", conversationId: "c-snz", name: "Snoozed one", lastMessageAt: t0, workflow: { status: "snoozed" } }),
  makeChat({ id: "asg@s", conversationId: "c-asg", name: "Assigned one", lastMessageAt: t0, workflow: { status: "open", assigneeId: "member_other" } }),
  makeChat({ id: "smp@s", conversationId: `${DEMO_ID_PREFIX}1`, name: "Sample one", lastMessageAt: t0, workflow: { status: "open" } }),
  makeChat({ id: "unr@s", conversationId: "c-unr", name: "Unread one", lastMessageAt: t0, unread: 4, workflow: { status: "open" } }),
];

describe("step 1: the default 'new' tag is gone from quiet rows", () => {
  it("model: open / resolved / unknown statuses have NO chip; pending, snoozed and a draft do", () => {
    expect(rowChipFor({ status: "open", hasDraft: false })).toBeNull();
    expect(rowChipFor({ status: "resolved", hasDraft: false })).toBeNull();
    expect(rowChipFor({ status: "something-new", hasDraft: false })).toBeNull();
    expect(rowChipFor({ status: "pending", hasDraft: false })?.shape).toBe("diamond");
    expect(rowChipFor({ status: "snoozed", hasDraft: false })?.labelKey).toBe("inbox.list.chip.snoozed");
    expect(rowChipFor({ status: "open", hasDraft: true })?.labelKey).toBe("inbox.list.chip.draft");
    expect(rowChipFor({ status: "resolved", hasDraft: true })?.shape).toBe("diamond");
  });

  it.each(["en", "fr", "ar"] as const)("%s: quiet rows render no tag line and no 'New' word", (locale) => {
    const row = rowsFor(locale, chats);
    for (const id of ["open@s", "none@s", "done@s", "unr@s"]) {
      expect(row(id).querySelector("[data-inbox-row-chip]"), id).toBeNull();
      expect(row(id).querySelector("[data-inbox-row-tags]"), id).toBeNull();
      expect(row(id).textContent).not.toMatch(/\bNew\b|Nouvelle|جديدة/);
    }
  });

  it.each(["en", "fr", "ar"] as const)("%s: needs-reply, snoozed, assigned and sample rows keep their tag", (locale) => {
    const row = rowsFor(locale, chats);
    expect(row("pend@s").querySelector('[data-inbox-row-chip][data-shape="diamond"]')).not.toBeNull();
    expect(row("snz@s").querySelector("[data-inbox-row-chip]")).not.toBeNull();
    expect(row("asg@s").querySelector('[data-inbox-assignee="other"]')).not.toBeNull();
    expect(row("smp@s").querySelector("[data-inbox-sample-badge]")).not.toBeNull();
    for (const id of ["pend@s", "snz@s", "asg@s", "smp@s"]) {
      expect(row(id).querySelector("[data-inbox-row-tags]"), id).not.toBeNull();
    }
  });
});

describe("step 2: one unread signal, one selected marker, fixed sizes", () => {
  it("an unread row has ONE count badge and a bold name; the time and the preview stay quiet", () => {
    const row = rowsFor("en", chats)("unr@s");
    expect(row.querySelectorAll("[data-inbox-unread-count]")).toHaveLength(1);
    expect(row.querySelector("[data-inbox-unread-count]")?.textContent).toContain("4");
    expect(row.querySelector("[data-inbox-name]")?.className).toContain("font-semibold");
    expect(row.querySelector("[data-inbox-time]")?.className).not.toMatch(/font-(medium|semibold|bold)|text-foreground/);
    expect(row.querySelector("[data-inbox-preview]")?.className).not.toMatch(/font-(medium|semibold|bold)|text-foreground/);
  });

  it("a read row has no count badge and a regular-weight name", () => {
    const row = rowsFor("en", chats)("open@s");
    expect(row.querySelector("[data-inbox-unread-count]")).toBeNull();
    expect(row.querySelector("[data-inbox-name]")?.className).not.toContain("font-semibold");
  });

  it("css: 40 px avatar, 64-72 px row, the selected marker is thin (<= 3 px), rounded, and uses --primary", () => {
    expect(rule(".rowAvatar")).toMatch(/inline-size:\s*40px/);
    expect(rule(".rowAvatar")).toMatch(/block-size:\s*40px/);
    const h = Number(/block-size:\s*(\d+)px/.exec(rule(".row"))?.[1]);
    expect(h).toBeGreaterThanOrEqual(64);
    expect(h).toBeLessThanOrEqual(72);
    expect(rule(".skeletonRow")).toContain(`block-size: ${h}px`);
    const marker = rule('.row[aria-current="true"]::before');
    expect(Number(/inline-size:\s*(\d+)px/.exec(marker)?.[1])).toBeLessThanOrEqual(3);
    expect(marker).toContain("var(--primary)");
    expect(rule('.row[aria-current="true"]')).not.toMatch(/border-inline-start:\s*1px solid color-mix/);
  });

  it("css: hover and focus-visible are defined and the focus ring is a real outline", () => {
    expect(css).toMatch(/\.row:hover\s*\{/);
    expect(rule(".row:focus-visible")).toMatch(/outline:\s*2px solid var\(--ring\)/);
  });
});
