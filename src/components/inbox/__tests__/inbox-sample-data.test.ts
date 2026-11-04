import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isSampleChat,
  orderQueueRows,
  sampleRowsLast,
} from "@/components/inbox/inbox-sample-model";
import { DEMO_ID_PREFIX, isDemoId } from "@/lib/demo/demo-tag";
import { getInboxSampleRuntimeTranslation } from "@/lib/i18n/inbox-sample-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

// F-0030: sample conversations sat among the Founder's real chats with nothing
// marking them. The tag is the one the demo policy already uses: the `demo-` id
// prefix (FD-052 / FD-054: "isolation remains id-prefix based").

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES = ["ar", "fr", "en"] as const;

const row = (conversationId: string, pinned = false) => ({ conversationId, pinned });

describe("the sample tag is the id prefix the demo lifecycle already uses", () => {
  it("is exactly the `demo-` prefix, the same literal the seeder and the lifecycle delete by", () => {
    expect(DEMO_ID_PREFIX).toBe("demo-");
    expect(read("src/lib/demo/algerian-demo.ts")).toContain(`const DEMO_PREFIX = "${DEMO_ID_PREFIX}"`);
    expect(read("src/lib/demo/algerian-demo-lifecycle.ts")).toContain(`const DEMO_PREFIX = "${DEMO_ID_PREFIX}"`);
  });

  it("marks only ids that start with the prefix", () => {
    expect(isDemoId("demo-conversation-01")).toBe(true);
    expect(isDemoId("cmabc123demo-x")).toBe(false);
    expect(isDemoId("Demo-conversation-01")).toBe(false);
    expect(isDemoId("")).toBe(false);
    expect(isDemoId(null)).toBe(false);
    expect(isDemoId(undefined)).toBe(false);
    expect(isSampleChat({ conversationId: "demo-conversation-12" })).toBe(true);
    expect(isSampleChat({ conversationId: "ckreal0001" })).toBe(false);
  });

  it("the server never serves a real chat under the demo prefix (the id is the tag, nothing else)", () => {
    // A real WhatsApp conversation id comes from the database default, never from a seller string.
    expect(isSampleChat({ conversationId: "628f9a7e-0d5b-4e0a-8f43-7f1f4b0f3a11" })).toBe(false);
  });
});

describe("sample rows sort below real rows without reordering the real ones", () => {
  it("keeps the real order exactly and the sample order exactly, real first", () => {
    const rows = [
      row("demo-conversation-03"),
      row("real-a"),
      row("demo-conversation-01"),
      row("real-b"),
      row("real-c"),
      row("demo-conversation-02"),
    ];
    expect(sampleRowsLast(rows).map((r) => r.conversationId)).toEqual([
      "real-a",
      "real-b",
      "real-c",
      "demo-conversation-03",
      "demo-conversation-01",
      "demo-conversation-02",
    ]);
  });

  it("does not mutate its input and returns the same order when there is no sample row", () => {
    const rows = [row("real-a"), row("real-b")];
    const copy = [...rows];
    expect(sampleRowsLast(rows)).toEqual(copy);
    expect(rows).toEqual(copy);
  });

  it("pinned rows still float first inside each group, but a pinned sample never outranks a real row", () => {
    const rows = [
      row("demo-conversation-01"),
      row("real-a"),
      row("demo-conversation-02", true),
      row("real-b", true),
      row("real-c"),
    ];
    expect(orderQueueRows(rows).map((r) => r.conversationId)).toEqual([
      "real-b",
      "real-a",
      "real-c",
      "demo-conversation-02",
      "demo-conversation-01",
    ]);
  });

  it("for a shop without sample data it equals the old pinned-first stable order", () => {
    const rows = [row("r1"), row("r2", true), row("r3"), row("r4", true), row("r5")];
    const old = [...rows].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    expect(orderQueueRows(rows)).toEqual(old);
  });
});

describe("Sample strings exist in Arabic, French and English together", () => {
  it("badge words are the ones the Founder asked for", () => {
    expect(getInboxSampleRuntimeTranslation("en", "inbox.sample.badge")).toBe("Sample");
    expect(getInboxSampleRuntimeTranslation("fr", "inbox.sample.badge")).toBe("Exemple");
    expect(getInboxSampleRuntimeTranslation("ar", "inbox.sample.badge")).toBe("مثال");
  });

  it("every key is present and non-empty in all three locales, with the same placeholders", () => {
    const keys = [
      "inbox.sample.badge",
      "inbox.sample.badgeHint",
      "inbox.sample.mixed",
      "inbox.sample.only",
      "inbox.sample.remove",
      "inbox.sample.confirmTitle",
      "inbox.sample.confirmIntro",
      "inbox.sample.count.conversations",
      "inbox.sample.count.orders",
      "inbox.sample.count.customers",
      "inbox.sample.count.products",
      "inbox.sample.removed",
      "inbox.sample.blocked",
      "inbox.sample.failed",
    ];
    for (const key of keys) {
      const placeholders = LOCALES.map((locale) => {
        const text = getInboxSampleRuntimeTranslation(locale, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        return (text!.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
      });
      expect(new Set(placeholders).size, `placeholders of ${key}`).toBe(1);
    }
  });

  it("the shared runtime resolver (what the client and server translators call) reaches them", () => {
    for (const locale of LOCALES) {
      expect(getRuntimeTranslation(locale, "inbox.sample.badge")).toBe(
        getInboxSampleRuntimeTranslation(locale, "inbox.sample.badge"),
      );
    }
  });
});

describe("the inbox wiring (source contract; the render test proves the behaviour)", () => {
  const queue = read("src/components/inbox/inbox-v3-queue.tsx");
  const header = read("src/components/inbox/inbox-thread-header.tsx");
  const workspace = read("src/components/inbox/inbox-v3-workspace.tsx");
  const hook = read("src/hooks/inbox/use-inbox-chat-queue.ts");

  it("the conversation row and the thread header both render the Sample badge from the shared tag", () => {
    expect(queue).toContain("<SampleBadge");
    expect(header).toContain("<SampleBadge");
  });

  it("the list footer carries the remove-sample-data control and refreshes the list after it", () => {
    expect(queue).toContain("<SampleDataFooter");
  });

  it("the queue the desk auto-opens from and the hook list both order sample rows last", () => {
    expect(workspace).toContain(".sort(compareQueueRows)");
    expect(workspace).not.toContain("Number(b.pinned) - Number(a.pinned)");
    expect(workspace).toContain("const first = visibleQueueChats[0]");
    expect(hook).toContain(".sort(compareQueueRows)");
    expect(hook).not.toContain("Number(b.pinned) - Number(a.pinned)");
  });

  it("uses no physical left/right and no arbitrary pixel value in the new component", () => {
    const source = read("src/components/inbox/inbox-sample-data.tsx");
    expect(source).not.toMatch(/(?<![\w-])(?:ml|mr|pl|pr|left|right)-/);
    expect(source).not.toMatch(/\[\d+(?:\.\d+)?(?:px|rem)\]/);
  });
});
