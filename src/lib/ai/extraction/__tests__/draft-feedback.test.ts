import { describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/lib/data/service-base";
import {
  checkTotal,
  confidenceBasisOf,
  fieldAcceptance,
  metricConfidence,
  recomputeTotal,
  recordDraftFeedback,
  summariseConfidence,
} from "../draft-feedback";

const line = (quantity: number, unitPrice?: number) => ({ productName: "robe", quantity, ...(unitPrice !== undefined ? { unitPrice } : {}) });

describe("recomputeTotal", () => {
  it("sums quantity x unit price, and only when every line has both", () => {
    expect(recomputeTotal([line(2, 3000), line(1, 500)])).toBe(6500);
    expect(recomputeTotal([line(2, 3000), line(1)])).toBeNull();
    expect(recomputeTotal([])).toBeNull();
    expect(recomputeTotal([line(0, 3000)])).toBeNull();
    expect(recomputeTotal([line(2, 0)])).toBeNull();
  });
});

describe("checkTotal", () => {
  it("flags a stated total that the lines do not give", () => {
    expect(checkTotal({ items: [line(2, 3000)], totalPrice: 5000 })).toEqual({ status: "mismatch", computed: 6000, stated: 5000 });
    expect(checkTotal({ items: [line(2, 3000)], totalPrice: 6000 })).toEqual({ status: "match", computed: 6000, stated: 6000 });
    expect(checkTotal({ items: [line(2, 3000)] })).toEqual({ status: "unchecked", computed: 6000, stated: null });
    expect(checkTotal({ items: [line(2)], totalPrice: 5000 })).toEqual({ status: "unchecked", computed: null, stated: 5000 });
    expect(checkTotal(null)).toEqual({ status: "unchecked", computed: null, stated: null });
  });
});

describe("confidence honesty", () => {
  it("keeps a rule's number and never stores a model's own claim as measured", () => {
    expect(confidenceBasisOf("regex")).toBe("rule");
    expect(confidenceBasisOf("none")).toBe("rule");
    expect(confidenceBasisOf("gemini")).toBe("self-reported");
    expect(metricConfidence({ method: "regex", confidence: 0.8 })).toEqual({ value: 0.8, basis: "rule" });
    expect(metricConfidence({ method: "none", confidence: 0 })).toEqual({ value: 0, basis: "rule" });
    for (const method of ["gemini", "groq", "openai"] as const) {
      expect(metricConfidence({ method, confidence: 0.9 })).toEqual({ value: -1, basis: "self-reported" });
    }
  });
  it("averages only the known rows and says what is left", () => {
    expect(summariseConfidence("groq", [0.9, 0.9, -1])).toEqual({ avgConfidence: 0.9, basis: "self-reported", unknownCount: 1 });
    expect(summariseConfidence("groq", [-1, -1])).toEqual({ avgConfidence: null, basis: "unknown", unknownCount: 2 });
    expect(summariseConfidence("regex", [0.5, 0.7])).toEqual({ avgConfidence: 0.6, basis: "rule", unknownCount: 0 });
    expect(summariseConfidence("regex", [])).toEqual({ avgConfidence: null, basis: "rule", unknownCount: 0 });
  });
});

describe("fieldAcceptance", () => {
  const draft = { phone: "0550000001", wilaya: "Oran", items: [{ productName: "robe", quantity: 2 }, { productName: "sac", quantity: 1 }], totalPrice: 4000 };
  const same = { phone: "0550 00 00 01", wilaya: "oran", items: [{ productName: "sac", quantity: 1 }, { productName: "robe", quantity: 2 }], totalPrice: 4000 };
  it("marks a field accepted when the seller kept it", () => {
    expect(fieldAcceptance(draft, same)).toEqual({ phone: true, wilaya: true, items: true, total: true });
  });
  it("marks a field edited when the seller changed, added or cleared it", () => {
    expect(fieldAcceptance(draft, { ...same, phone: "0550000002" }).phone).toBe(false);
    expect(fieldAcceptance(draft, { ...same, wilaya: "Alger" }).wilaya).toBe(false);
    expect(fieldAcceptance(draft, { ...same, commune: "Kouba" }).commune).toBe(false);
    expect(fieldAcceptance({ ...draft, commune: "Kouba" }, same).commune).toBe(false);
    expect(fieldAcceptance(draft, { ...same, items: [{ productName: "robe", quantity: 3 }, { productName: "sac", quantity: 1 }] }).items).toBe(false);
    expect(fieldAcceptance(draft, { ...same, totalPrice: 4500 }).total).toBe(false);
    expect(fieldAcceptance(draft, { phone: same.phone, wilaya: same.wilaya, items: same.items }).total).toBe(false);
  });
  it("treats everything the seller typed as edited when there was no draft", () => {
    expect(fieldAcceptance(null, { phone: "0550000001", items: [{ productName: "robe", quantity: 1 }] })).toEqual({ phone: false, items: false });
    expect(fieldAcceptance(null, {})).toEqual({});
  });
});

describe("recordDraftFeedback", () => {
  const ctx = (findFirst: unknown, update: unknown) => ({ prisma: { extractionMetric: { findFirst, update } } }) as unknown as ServiceContext;
  it("stores only the booleans on the newest row of that message", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "m1" });
    const update = vi.fn().mockResolvedValue({});
    await expect(recordDraftFeedback(ctx(findFirst, update), { messageId: "msg-1", accepted: { phone: true, total: false } })).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({ where: { messageId: "msg-1" }, orderBy: { createdAt: "desc" }, select: { id: true } });
    expect(update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { fieldAccuracy: '{"phone":true,"total":false}' } });
  });
  it("does nothing without a row, and never throws", async () => {
    const update = vi.fn();
    await expect(recordDraftFeedback(ctx(vi.fn().mockResolvedValue(null), update), { messageId: "x", accepted: { phone: true } })).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
    await expect(recordDraftFeedback(ctx(vi.fn().mockRejectedValue(new Error("db")), update), { messageId: "x", accepted: {} })).resolves.toBe(false);
  });
});
