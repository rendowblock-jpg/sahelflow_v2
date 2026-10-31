import { beforeEach, describe, expect, it } from "vitest";

import type { ExtractedOrder } from "@/lib/ai/extraction";
import {
  approvalGate,
  dockState,
  draftDomId,
  ledgerOf,
  pendingDraft,
  phoneState,
  threadOpenTarget,
  type ThreadOrderDraft,
} from "@/components/inbox/inbox-order-draft-model";
import {
  getOrderDraftsSnapshot,
  registerOrderDraft,
  resetOrderDraftsForTests,
  updateOrderDraft,
} from "@/components/inbox/inbox-order-draft-store";

const CATALOG = [
  { name: "Robe", price: 2500 },
  { name: "Sac", price: 1200 },
];
const order = (patch: Partial<ExtractedOrder> = {}): ExtractedOrder =>
  ({
    customerName: "Amel",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    items: [
      { productName: "Robe", quantity: 2 },
      { productName: "Sac", quantity: 1 },
    ],
    ...patch,
  }) as ExtractedOrder;
const draft = (patch: Partial<ThreadOrderDraft> = {}): ThreadOrderDraft => ({
  conversationId: "c1",
  anchorMessageId: "m7",
  order: order(),
  catalog: CATALOG,
  method: "gemini",
  confidence: 0.9,
  status: "pending",
  created: null,
  readAt: 1,
  ...patch,
});

describe("which draft is pending", () => {
  it.each([
    ["pending, same conversation", [draft()], "c1", "m7"],
    ["approved is not pending", [draft({ status: "approved" })], "c1", null],
    ["dismissed is not pending", [draft({ status: "dismissed" })], "c1", null],
    ["other conversation", [draft()], "c2", null],
    ["no conversation open", [draft()], null, null],
    ["none", [], "c1", null],
  ])("%s", (_name, drafts, conversationId, expected) => {
    expect(pendingDraft(drafts, conversationId)?.anchorMessageId ?? null).toBe(expected);
  });
});

describe("where the thread opens", () => {
  it("on the draft when one is pending, at the bottom otherwise", () => {
    expect(threadOpenTarget(draft())).toEqual({ kind: "draft", domId: draftDomId("m7") });
    expect(threadOpenTarget(draft({ status: "approved" }))).toEqual({ kind: "bottom" });
    expect(threadOpenTarget(draft({ status: "dismissed" }))).toEqual({ kind: "bottom" });
    expect(threadOpenTarget(null)).toEqual({ kind: "bottom" });
  });
});

describe("ledger", () => {
  it("prices from the catalog, adds the default delivery, never invents a price", () => {
    const l = ledgerOf(order(), CATALOG, 600);
    expect(l.rows).toEqual([
      { name: "Robe", quantity: 2, unitPrice: 2500, amount: 5000 },
      { name: "Sac", quantity: 1, unitPrice: 1200, amount: 1200 },
    ]);
    expect(l.subtotal).toBe(6200);
    expect(l.delivery).toBe(600);
    expect(l.total).toBe(6800);
    expect(l.unpriced).toBe(0);
  });
  it("an item outside the catalog has no price and is counted", () => {
    const l = ledgerOf(order({ items: [{ productName: "Inconnu", quantity: 3 }] } as never), CATALOG, 600);
    expect(l.rows[0]).toEqual({ name: "Inconnu", quantity: 3, unitPrice: null, amount: null });
    expect(l.subtotal).toBe(0);
    expect(l.unpriced).toBe(1);
  });
});

describe("phone state matches the validator (0[5-7] + 8 digits)", () => {
  it.each([
    ["0555123456", "ok"],
    ["05 55 12 34 56", "ok"],
    ["055512345", "incomplete"],
    ["0455123456", "incomplete"],
    ["", "missing"],
    ["   ", "missing"],
  ])("%s -> %s", (raw, expected) => {
    expect(phoneState(raw)).toBe(expected);
  });
});

describe("approval gate mirrors the review form", () => {
  it("builds the same reviewed order the form would submit", () => {
    const gate = approvalGate(order(), CATALOG, undefined);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.reviewed).toEqual({
        customer: { name: "Amel", phone: "0555123456", wilaya: "Alger", commune: "Bab Ezzouar", address: "" },
        items: [
          { productName: "Robe", quantity: 2 },
          { productName: "Sac", quantity: 1 },
        ],
        notes: undefined,
        deliveryCost: 600,
      });
    }
  });
  it("lists what is missing and does not approve", () => {
    expect(approvalGate(order({ phone: "05551234" }), CATALOG, undefined)).toEqual({ ok: false, missing: ["phone"] });
    expect(approvalGate(order({ wilaya: "" }), CATALOG, undefined)).toEqual({ ok: false, missing: ["wilaya"] });
    expect(approvalGate(order({ items: [] }), CATALOG, undefined)).toEqual({ ok: false, missing: ["items"] });
    expect(approvalGate(order({ items: [{ productName: "Inconnu", quantity: 1 }] } as never), CATALOG, undefined)).toEqual({ ok: false, missing: ["items"] });
  });
  it("falls back to the known phone like the form", () => {
    expect(approvalGate(order({ phone: "" }), CATALOG, "0666123456").ok).toBe(true);
  });
});

describe("dock", () => {
  it("shows only for a pending draft whose card is out of view", () => {
    expect(dockState({ draft: draft(), cardVisible: false })).toEqual({ visible: true, total: 6800 });
    expect(dockState({ draft: draft(), cardVisible: true }).visible).toBe(false);
    expect(dockState({ draft: draft(), cardVisible: null }).visible).toBe(false);
    expect(dockState({ draft: null, cardVisible: false }).visible).toBe(false);
    expect(dockState({ draft: draft({ status: "approved" }), cardVisible: false }).visible).toBe(false);
    expect(dockState({ draft: draft({ status: "dismissed" }), cardVisible: false }).visible).toBe(false);
  });
});

describe("draft store (client state only)", () => {
  beforeEach(() => resetOrderDraftsForTests());
  it("keeps one draft per conversation and updates its status", () => {
    registerOrderDraft(draft());
    registerOrderDraft(draft({ anchorMessageId: "m9" }));
    expect(getOrderDraftsSnapshot()).toHaveLength(1);
    expect(getOrderDraftsSnapshot()[0]?.anchorMessageId).toBe("m9");
    updateOrderDraft("c1", { status: "dismissed" });
    expect(pendingDraft(getOrderDraftsSnapshot(), "c1")).toBeNull();
    updateOrderDraft("c1", { status: "pending" });
    expect(pendingDraft(getOrderDraftsSnapshot(), "c1")?.anchorMessageId).toBe("m9");
  });
});
