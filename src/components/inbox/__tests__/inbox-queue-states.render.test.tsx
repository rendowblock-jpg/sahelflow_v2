/**
 * @vitest-environment happy-dom
 */
// s42 inbox lane, step 5: the five states of the conversation list, in en/fr/ar:
// loading skeleton, empty, no results, error with retry, offline.
// Real code: the state components and InboxV3Queue's choice between them.
// NOT covered: how they look (seen in the dpr-2 screenshots of the sweep batch).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  InboxQueueEmpty,
  InboxQueueError,
  InboxQueueLoading,
  InboxQueueNoResults,
  InboxQueueOffline,
} from "@/components/inbox/inbox-queue-states";
import { getInboxListRuntimeTranslation } from "@/lib/i18n/inbox-list-runtime";
import { fireEvent, render, screen } from "@/test-utils/render";

type Loc = "en" | "fr" | "ar";
let current: Loc = "en";
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      let v = getInboxListRuntimeTranslation(current, key) ?? key;
      for (const [k, x] of Object.entries(params ?? {})) v = v.replaceAll(`{{${k}}}`, x);
      return v;
    },
    locale: current,
    dir: current === "ar" ? "rtl" : "ltr",
  }),
}));

const LOCALES: Loc[] = ["en", "fr", "ar"];
const STATE_KEYS = [
  "inbox.list.empty.title",
  "inbox.list.error.title",
  "inbox.list.error.body",
  "inbox.list.error.retry",
  "inbox.list.noResults.title",
  "inbox.list.noResults.body",
  "inbox.list.noResults.clear",
  "inbox.list.offline.title",
  "inbox.list.offline.body",
  "inbox.list.offline.errorBody",
];

describe("every state has its words in en, fr and ar", () => {
  it("all keys exist and the three languages differ", () => {
    for (const key of STATE_KEYS) {
      const v = LOCALES.map((l) => getInboxListRuntimeTranslation(l, key));
      for (const x of v) expect(x, key).toBeTruthy();
      expect(new Set(v).size, `${key} identical in two languages`).toBe(3);
    }
    expect(getInboxListRuntimeTranslation("ar", "inbox.list.noResults.title")).toMatch(/[\u0600-\u06FF]/);
  });
});

describe.each(LOCALES)("states (%s)", (locale) => {
  it("loading: row-shaped, flat (no pulse/shimmer), hidden from the reader", () => {
    current = locale;
    const { container } = render(<InboxQueueLoading />);
    const root = container.querySelector("[data-inbox-queue-loading]")!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.children).toHaveLength(5);
    expect(root.children[0]!.children).toHaveLength(2); // avatar + lines
    expect(container.innerHTML).not.toMatch(/animate-|shimmer|pulse/);
  });

  it("empty: title + three steps, the two links are phone-sized", () => {
    current = locale;
    const { container } = render(<InboxQueueEmpty />);
    expect(container.querySelector("[data-inbox-queue-empty]")?.textContent).toContain(
      getInboxListRuntimeTranslation(locale, "inbox.list.empty.title")!,
    );
    expect(container.querySelectorAll("li")).toHaveLength(3);
    for (const a of Array.from(container.querySelectorAll("a"))) expect(a.className).toContain("max-sm:min-h-10");
  });

  it("no results: names the search and offers exactly one way out", () => {
    current = locale;
    const onClear = vi.fn();
    const { container } = render(<InboxQueueNoResults query="Zorglub" onClear={onClear} />);
    expect(container.textContent).toContain("Zorglub");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toBe(getInboxListRuntimeTranslation(locale, "inbox.list.noResults.clear"));
    fireEvent.click(buttons[0]!);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("error: an alert with exactly one retry; the offline variant says so", () => {
    current = locale;
    const onRetry = vi.fn();
    const { container, rerender } = render(<InboxQueueError onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain(getInboxListRuntimeTranslation(locale, "inbox.list.error.title")!);
    fireEvent.click(screen.getByRole("button"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<InboxQueueError onRetry={onRetry} offline />);
    expect(container.querySelector("[data-inbox-queue-error]")?.getAttribute("data-inbox-queue-error")).toBe("offline");
    expect(screen.getByRole("alert").textContent).toContain(getInboxListRuntimeTranslation(locale, "inbox.list.offline.title")!);
  });

  it("offline note: a polite status above saved rows", () => {
    current = locale;
    render(<InboxQueueOffline />);
    expect(screen.getByRole("status").textContent).toContain(getInboxListRuntimeTranslation(locale, "inbox.list.offline.body")!);
  });
});

describe("the queue picks the right state (source contract)", () => {
  const q = readFileSync(join(process.cwd(), "src/components/inbox/inbox-v3-queue.tsx"), "utf8");
  it("offline with no rows -> error(offline); search with no rows -> no-results with clear; offline with rows -> note", () => {
    expect(q).toContain("chats.length === 0 && (dataDegraded || !online)");
    expect(q).toContain("<InboxQueueError offline={!online}");
    expect(q).toMatch(/rows\.length === 0 && normalizedQuery \? \(\s*<InboxQueueNoResults query=\{query\.trim\(\)\} onClear=\{\(\) => setQuery\(""\)\}/);
    expect(q).toContain("{!online ? <InboxQueueOffline /> : null}");
  });
});
