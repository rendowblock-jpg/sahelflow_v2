import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getInboxThreadCarnetRuntimeTranslation } from "@/lib/i18n/inbox-thread-carnet-runtime";

const src = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const thread = src("inbox-v3-thread.tsx");
const message = src("inbox-thread-message.tsx");
const extraction = src("message-extraction.tsx");
const connected = src("order-draft-card-connected.tsx");
const NEW_FILES = [
  "inbox-thread-link.tsx",
  "inbox-order-draft-model.ts",
  "inbox-order-draft-store.ts",
  "order-draft-card.tsx",
  "order-draft-card-connected.tsx",
  "order-draft-dock.tsx",
  "inbox-thread-states.tsx",
  "inbox-message-visual.ts",
];

describe("approving keeps calling the one existing action", () => {
  it("the create route is posted from exactly one place, shared by the dialog and the card", () => {
    expect(extraction.match(/fetch\("\/api\/orders\/source\/whatsapp"/g)).toHaveLength(1);
    expect(extraction).toContain("export async function submitReviewedOrder(");
    expect(extraction).toMatch(/handleCreate[\s\S]{0,800}submitReviewedOrder\(/);
    for (const name of NEW_FILES) expect(src(name), name).not.toContain("/api/orders/source/whatsapp");
  });
  it("the card never approves by itself: submit is reached only from the Approve handler", () => {
    expect(connected.match(/submitReviewedOrder\(/g)).toHaveLength(1);
    expect(connected).not.toMatch(/useEffect|setTimeout|setInterval/);
    expect(connected).toMatch(/async function approve\(/);
    expect(connected).toContain("onApprove={() => void approve()}");
  });
});

describe("the thread shows the pieces", () => {
  it("opens on the draft, docks, jumps, and shows states", () => {
    for (const piece of ["<OrderDraftDock", "<ConnectedOrderDraftCard", "<InboxThreadLoading", "<InboxThreadEmpty", "threadOpenTarget(", "scrollIntoView"])
      expect(thread, piece).toContain(piece);
    expect(thread).toContain("inbox.thread.jump");
  });
  it("the composer sits above the safe area", () => {
    expect(thread).toContain("env(safe-area-inset-bottom)");
  });
  it("back arrow is 44px on a phone", () => {
    expect(src("inbox-thread-header.tsx")).toMatch(/onBackToQueue[\s\S]{0,600}(size-11|min-h-11|h-11)/);
  });
});

describe("slips and the failed send", () => {
  it("side is one constant exposed as data-bubble-flow", () => {
    expect(message).toContain("data-bubble-flow={BUBBLE_FLOW}");
    expect(message).toContain("bubbleSide(BUBBLE_FLOW");
  });
  it("customer slip is the card surface, seller slip is the carnet wash only under carnet", () => {
    expect(message).toContain("bg-card");
    expect(src("inbox-v3-workspace.module.css")).toMatch(/html\[data-theme-preset="carnet"\]\) \.slipOut[^}]*--carnet-slip-out/);
  });
  it("a failed send is a designed object reusing the existing resend path", () => {
    expect(message).toContain("messageVisual(");
    expect(message).toContain("outboxAllowsResend(message)");
    expect(message).toContain("data-failed-send");
    expect(message).toContain("onRetry(message)");
    expect(message).toMatch(/border-destructive/);
    expect(message).toMatch(/\[@media\(pointer:coarse\)\]:min-h-11/);
  });
});

describe("honest copy and RTL-safe classes", () => {
  it("no new file uses physical left/right utilities", () => {
    for (const name of NEW_FILES) {
      expect(src(name), name).not.toMatch(/["'`\s](ml|mr|pl|pr|left|right)-[\w\[]/);
      expect(src(name), name).not.toMatch(/text-(left|right)\b/);
    }
  });
  it("every key exists in ar, fr and en with text", () => {
    const text = readFileSync(new URL("../../../lib/i18n/inbox-thread-carnet-runtime.ts", import.meta.url), "utf8");
    const keys = [...text.matchAll(/^\s*"(inbox\.thread\.[\w.]+)":/gm)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(30);
    for (const key of new Set(keys))
      for (const locale of ["ar", "fr", "en"] as const)
        expect(getInboxThreadCarnetRuntimeTranslation(locale, key)?.length ?? 0, `${locale} ${key}`).toBeGreaterThan(0);
  });
  it("never promises that a draft is saved, and never prints the global no-auto-create line", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      const all = ["inbox.thread.draft.fine", "inbox.thread.draft.title", "inbox.thread.dock.text"]
        .map((k) => getInboxThreadCarnetRuntimeTranslation(locale, k) ?? "")
        .join(" ");
      expect(all).not.toMatch(/saved|sauvegard|enregistr|محفوظ|حفظ/i);
    }
    expect(getInboxThreadCarnetRuntimeTranslation("en", "inbox.thread.draft.fine")).toBe(
      "AI only suggests. Nothing is created from this draft until you press Approve.",
    );
  });
});
