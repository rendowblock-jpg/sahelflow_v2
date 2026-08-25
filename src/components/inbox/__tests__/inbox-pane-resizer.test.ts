import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  clampInboxQueueWidth,
  INBOX_QUEUE_DEFAULT_WIDTH,
  INBOX_QUEUE_MAX_WIDTH,
  INBOX_QUEUE_MIN_WIDTH,
  INBOX_QUEUE_WIDTH_STORAGE_KEY,
  inboxQueueWidthBounds,
  inboxQueueWidthFromKey,
  inboxQueueWidthFromPointer,
  persistInboxQueueWidth,
  readPersistedInboxQueueWidth,
} from "@/components/inbox/inbox-pane-width";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Inbox pane width contract", () => {
  it("keeps the queue and thread inside bounded desktop widths", () => {
    expect(inboxQueueWidthBounds(1_200)).toEqual({ min: 280, max: 480 });
    expect(inboxQueueWidthBounds(720)).toEqual({ min: 280, max: 312 });
    expect(inboxQueueWidthBounds(600)).toEqual({ min: 280, max: 280 });
    expect(clampInboxQueueWidth(100, 1_200)).toBe(INBOX_QUEUE_MIN_WIDTH);
    expect(clampInboxQueueWidth(700, 1_200)).toBe(INBOX_QUEUE_MAX_WIDTH);
    expect(clampInboxQueueWidth(Number.NaN, 1_200)).toBe(
      INBOX_QUEUE_DEFAULT_WIDTH,
    );
  });

  it("maps pointer position and physical arrow keys correctly in LTR and RTL", () => {
    expect(inboxQueueWidthFromPointer(424, 100, 1_100, "ltr")).toBe(324);
    expect(inboxQueueWidthFromPointer(776, 100, 1_100, "rtl")).toBe(324);

    expect(inboxQueueWidthFromKey(324, "ArrowRight", "ltr", 1_000)).toBe(
      340,
    );
    expect(inboxQueueWidthFromKey(324, "ArrowLeft", "ltr", 1_000)).toBe(308);
    expect(inboxQueueWidthFromKey(324, "ArrowRight", "rtl", 1_000)).toBe(308);
    expect(inboxQueueWidthFromKey(324, "ArrowLeft", "rtl", 1_000)).toBe(340);
    expect(inboxQueueWidthFromKey(324, "Home", "rtl", 1_000)).toBe(280);
    expect(inboxQueueWidthFromKey(324, "End", "rtl", 1_000)).toBe(480);
  });

  it("prefers the cross-port cookie and mirrors commits to local storage", () => {
    const values = new Map<string, string>([
      [INBOX_QUEUE_WIDTH_STORAGE_KEY, "360"],
    ]);
    const documentStub = {
      cookie: `${INBOX_QUEUE_WIDTH_STORAGE_KEY}=420`,
    };
    vi.stubGlobal("document", documentStub);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });

    expect(readPersistedInboxQueueWidth()).toBe(420);
    persistInboxQueueWidth(444);
    expect(documentStub.cookie).toContain(
      `${INBOX_QUEUE_WIDTH_STORAGE_KEY}=444`,
    );
    expect(values.get(INBOX_QUEUE_WIDTH_STORAGE_KEY)).toBe("444");
  });

  it("renders one desktop-only semantic splitter without squeezing mobile", () => {
    const workspace = source(
      "src/components/inbox/inbox-v3-workspace.tsx",
    );
    const resizer = source("src/components/inbox/inbox-pane-resizer.tsx");
    const queue = source("src/components/inbox/inbox-v3-queue.tsx");
    const styles = source(
      "src/components/inbox/inbox-v3-workspace.module.css",
    );
    const experience = source("src/app/experience-system.css");

    expect(workspace).toContain("!isMobile ? (");
    expect(workspace).toContain("<InboxPaneResizer");
    expect(workspace).toContain('data-inbox-resizable-panes="true"');
    expect(workspace).toContain("persistInboxQueueWidth(next)");
    expect(resizer).toContain('role="separator"');
    expect(resizer).toContain('aria-orientation="vertical"');
    expect(resizer).toContain("aria-valuenow={width}");
    expect(resizer).toContain('event.key !== "ArrowLeft"');
    expect(resizer).toContain("onDoubleClick");
    expect(queue).not.toContain("md:w-[20.25rem]");
    expect(styles).toContain("inline-size: var(--inbox-queue-width)");
    expect(styles).toContain("min-inline-size: var(--inbox-queue-width)");
    expect(experience).toContain(
      '[data-inbox-resizable-panes="true"] > [data-inbox-pane-resizer="true"]',
    );
    expect(experience).toContain("width: var(--inbox-queue-width) !important");
    expect(experience).toContain(
      "min-width: var(--inbox-queue-width) !important",
    );
  });
});
