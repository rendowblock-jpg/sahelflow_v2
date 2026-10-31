import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHIP_SHAPES,
  INBOX_CHAT_FETCH_LIMIT,
  INBOX_ROW_CHIPS,
  deriveListFooter,
  rowChipFor,
  tabCounts,
} from "@/components/inbox/inbox-queue-model";
import { getInboxCarnetRuntimeTranslation } from "@/lib/i18n/inbox-carnet-runtime";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const LOCALES = ["ar", "fr", "en"] as const;

function unionLiterals(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export type ${name} =([^;]+);`));
  if (!m) throw new Error(`union ${name} not found`);
  return [...m[1]!.matchAll(/"([a-z_-]+)"/g)].map((x) => x[1]!);
}

describe("row state chip table", () => {
  const statuses = unionLiterals(read("src/lib/data/conversation-service.ts"), "ConversationStatus");
  it("reads the real status union (guards the guard)", () => {
    expect(statuses).toEqual(expect.arrayContaining(["open", "pending", "resolved", "snoozed"]));
  });
  it("maps EVERY status the code knows; a new status without a mapping fails here", () => {
    for (const s of statuses) {
      const chip = INBOX_ROW_CHIPS[s];
      expect(chip, `status "${s}" has no chip`).toBeDefined();
      expect(CHIP_SHAPES).toContain(chip!.shape);
      for (const l of LOCALES) {
        expect(getInboxCarnetRuntimeTranslation(l, chip!.labelKey), `${l}:${chip!.labelKey}`).toBeTruthy();
      }
    }
  });
  it("the workflow filter union holds the same statuses", () => {
    const wf = unionLiterals(read("src/components/inbox/inbox-desk-types.ts"), "WorkflowFilter").filter((x) => x !== "all");
    expect([...wf].sort()).toEqual([...statuses].sort());
  });
  it("shape meaning: diamond needs you, dot ok, ring neutral, triangle failed", () => {
    expect(INBOX_ROW_CHIPS.pending!.shape).toBe("diamond");
    expect(INBOX_ROW_CHIPS.resolved!.shape).toBe("dot");
    expect(INBOX_ROW_CHIPS.open!.shape).toBe("ring");
    expect(INBOX_ROW_CHIPS.snoozed!.shape).toBe("ring");
    expect(rowChipFor({ status: "open", hasDraft: true }).shape).toBe("diamond");
    expect(rowChipFor({ status: "resolved", hasDraft: true }).shape).toBe("diamond");
    expect(rowChipFor({ status: "something-new", hasDraft: false }).shape).toBe("ring");
  });
});

describe("honest list footer", () => {
  it("prints a total only when one is known", () => {
    expect(deriveListFooter({ loaded: 9, total: 23 })).toEqual({ kind: "of-total", loaded: 9, total: 23 });
    expect(deriveListFooter({ loaded: 9, total: null })).toEqual({ kind: "loaded-only", loaded: 9, total: null });
    expect(deriveListFooter({ loaded: 0, total: null })).toEqual({ kind: "empty", loaded: 0, total: null });
  });
  it("never invents or repeats a number it does not have", () => {
    expect(deriveListFooter({ loaded: 30, total: 12 }).total).toBeNull();
    expect(deriveListFooter({ loaded: 5, total: Number.NaN }).total).toBeNull();
    expect(deriveListFooter({ loaded: 5, total: 5.5 }).total).toBeNull();
    expect(deriveListFooter({ loaded: -3, total: null }).loaded).toBe(0);
    expect(deriveListFooter({ loaded: INBOX_CHAT_FETCH_LIMIT, total: null }).kind).toBe("capped");
  });
  it("the real client request has no total, so the queue never passes one", () => {
    expect(read("src/hooks/inbox/use-inbox-chat-queue.ts")).toContain("/api/whatsapp/chats?limit=100");
    expect(INBOX_CHAT_FETCH_LIMIT).toBe(100);
    expect(read("src/components/inbox/inbox-v3-queue.tsx")).toContain("total: null");
  });
});

describe("tab counts equal the rows they filter", () => {
  const mk = (id: string, o: { unread?: number; assignee?: string; archived?: boolean }) => ({
    id, conversationId: id, name: id, channel: "whatsapp" as const, unread: o.unread ?? 0,
    pinned: false, muted: false, archived: o.archived ?? false,
    workflow: { assigneeId: o.assignee ?? null },
  });
  const chats = [
    mk("a", { unread: 2, assignee: "me" }), mk("b", {}), mk("c", { unread: 1 }),
    mk("d", { assignee: "me", archived: true }), mk("e", { assignee: "x" }),
  ];
  it("matches an independent reference filter for every tab", () => {
    const counts = tabCounts(chats as never, "me");
    const live = chats.filter((c) => !c.archived);
    expect(counts.all).toBe(live.length);
    expect(counts.unread).toBe(live.filter((c) => c.unread > 0).length);
    expect(counts.mine).toBe(live.filter((c) => c.workflow.assigneeId === "me").length);
    expect(counts.unassigned).toBe(live.filter((c) => !c.workflow.assigneeId).length);
    expect(counts.archived).toBe(chats.length - live.length);
    expect(tabCounts(chats as never, null).mine).toBe(0);
  });
});
