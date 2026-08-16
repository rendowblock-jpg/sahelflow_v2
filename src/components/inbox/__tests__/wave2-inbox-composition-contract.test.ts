import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Class-AAA Inbox composition contract", () => {
  it("uses the shared immersive workspace while replacing the rejected legacy composition", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    const foundation = read("src/app/phase5.css");

    expect(page).toContain('className="app-workspace-content flex flex-col"');
    expect(page).toContain("InboxOperationsDesk");
    expect(page).not.toContain("InboxDesktopPrimer");
    expect(desk).toContain('data-inbox-workspace="v2"');
    expect(desk).toContain('data-inbox-operations-desk="true"');
    expect(foundation).not.toContain("data-inbox-operations-desk");
  });

  it("keeps the common desktop path two-pane and exposes context progressively", () => {
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");
    expect(thread).toContain('className="min-[1500px]:hidden"');
    expect(thread).toContain('min-[1500px]:block');
    expect(thread).toContain("InboxCustomerWorkPanel");
    expect(thread).toContain("<Sheet>");
    expect(thread).toContain('side={locale === "ar" ? "left" : "right"}');
  });

  it("uses task-shaped queues instead of five equal workflow tabs", () => {
    const queue = read("src/components/inbox/inbox-work-queue.tsx");
    expect(queue).toContain('["mine", "unassigned", "unread", "all"]');
    expect(queue).toContain("WorkflowFilter");
    expect(queue).toContain("queueFilter === \"mine\"");
    expect(queue).toContain("queueFilter === \"unassigned\"");
    expect(queue).toContain("/api/conversations/search?q=");
  });

  it("keeps operational typography above legacy microcopy sizes", () => {
    const queue = read("src/components/inbox/inbox-work-queue.tsx");
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");
    const context = read("src/components/inbox/inbox-customer-work-panel.tsx");

    for (const source of [queue, thread, context]) {
      expect(source).not.toContain('text-[10px]');
      expect(source).not.toContain('text-[11px]');
    }
    expect(thread).toContain('text-[14px] leading-6');
    expect(thread).toContain("text-xs");
  });

  it("preserves bounded thread scrolling and mobile queue-first navigation", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const desk = read("src/components/inbox/inbox-operations-desk.tsx");
    const thread = read("src/components/inbox/inbox-thread-workbench.tsx");

    expect(hook).toContain("messages?limit=200");
    expect(hook).toContain("isNearBottomRef");
    expect(desk).toContain("!isMobile || !activeChat");
    expect(desk).toContain("!isMobile || activeChat");
    expect(thread).toContain("clearActiveChat");
  });

  it("keeps a localized semantic work-surface heading without consuming layout space", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    expect(page).toContain("const { t } = await getI18n();");
    expect(page).toContain('<h1 className="sr-only">{t("metadata.title.inbox")}</h1>');
  });
});
