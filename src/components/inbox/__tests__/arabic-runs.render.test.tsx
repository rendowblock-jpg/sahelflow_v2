/**
 * @vitest-environment happy-dom
 */
// Arabic words inside a French or English page carry lang="ar" in the inbox.
// Real code: ArabicRuns, the message bubble, the helper. Stand-ins: the locale
// hook and the translation functions. NOT covered: the fonts a browser picks.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

import { ArabicRuns } from "../arabic-runs";
import { MessageBubble } from "../inbox-thread-message";
import type { InboxMessage } from "../inbox-workspace-types";

afterEach(() => cleanup());

const MIXED = "Nike حذاء رياضي 42";

function tagged(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[lang="ar"]')).map((node) => node.textContent ?? "");
}

describe("ArabicRuns", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`${locale} page: the Arabic words are tagged and the text is unchanged`, () => {
      const { container } = render(<p><ArabicRuns text={MIXED} locale={locale} /></p>);
      expect(tagged(container)).toEqual(["حذاء رياضي"]);
      expect(container.textContent).toBe(MIXED);
    });
  }

  it("Arabic page: no extra tag, the page already says Arabic", () => {
    const { container } = render(<p><ArabicRuns text={MIXED} locale="ar" /></p>);
    expect(tagged(container)).toEqual([]);
    expect(container.textContent).toBe(MIXED);
  });

  it("pure Latin and digits-only text get no tag and no wrapper", () => {
    for (const text of ["Bonjour 2 pièces", "0555 12 34 56"]) {
      const { container, unmount } = render(<p><ArabicRuns text={text} locale="fr" /></p>);
      expect(container.querySelector("span")).toBeNull();
      expect(container.textContent).toBe(text);
      unmount();
    }
  });

  it("pure Arabic on a French page is tagged as a whole", () => {
    const { container } = render(<p><ArabicRuns text="السلام عليكم" locale="fr" /></p>);
    expect(tagged(container)).toEqual(["السلام عليكم"]);
  });

  it("no letter spacing inside a tagged run", () => {
    const { container } = render(<p><ArabicRuns text={MIXED} locale="en" /></p>);
    expect(container.querySelector('[lang="ar"]')?.className).toContain("tracking-normal");
  });
});

describe("message bubble", () => {
  const passthrough = ((key: string) => key) as unknown as Parameters<typeof MessageBubble>[0]["t"];
  const copyThrough = ((key: string) => key) as unknown as Parameters<typeof MessageBubble>[0]["copy"];

  function bubble(over: Partial<InboxMessage>, locale: "ar" | "fr" | "en", searchQuery = "") {
    const message: InboxMessage = {
      id: "m1",
      body: MIXED,
      direction: "inbound",
      timestamp: 1_700_000_000_000,
      ...over,
    };
    return render(
      <MessageBubble
        message={message}
        locale={locale}
        t={passthrough}
        copy={copyThrough}
        candidate={false}
        onChooseCandidate={() => undefined}
        onRetry={() => undefined}
        onReply={() => undefined}
        canInteract={false}
        onCancelUpload={() => undefined}
        searchQuery={searchQuery}
      />,
    );
  }

  it("tags the Arabic words of the text on a French page", () => {
    const { container } = bubble({}, "fr");
    const body = container.querySelector('[data-sf-user-content="true"]');
    expect(body).not.toBeNull();
    expect(tagged(body as HTMLElement)).toEqual(["حذاء رياضي"]);
    expect(body?.textContent).toBe(MIXED);
  });

  it("does not tag anything on an Arabic page", () => {
    const { container } = bubble({}, "ar");
    expect(tagged(container)).toEqual([]);
  });

  it("keeps the tag when a search match is highlighted in the same text", () => {
    const { container } = bubble({}, "en", "Nike");
    expect(container.querySelector("mark")?.textContent).toBe("Nike");
    expect(tagged(container)).toEqual(["حذاء رياضي"]);
  });

  it("tags the Arabic words of a quoted reply", () => {
    const { container } = bubble(
      {
        quotedMessageId: "m0",
        quoted: { fromMe: false, preview: "Colis حذاء أزرق", messageType: null },
      },
      "en",
    );
    expect(tagged(container)).toContain("حذاء أزرق");
  });
});

describe("where the conversation list and header draw a name or preview", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the queue row name and last-message preview go through ArabicRuns", () => {
    const queue = read("src/components/inbox/inbox-v3-queue.tsx");
    expect(queue).toContain("<ArabicRuns text={chat.name} locale={locale} />");
    expect(queue).toContain("<ArabicRuns text={chat.lastMessageText} locale={locale} />");
  });

  it("the thread header name goes through ArabicRuns", () => {
    const header = read("src/components/inbox/inbox-thread-header.tsx");
    expect(header).toContain("<ArabicRuns text={activeChat.name} locale={locale} />");
  });
});
