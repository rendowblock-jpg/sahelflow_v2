/**
 * Behaviour of the protected-field selection planner. A query that asks for an
 * encrypted field must also fetch the record id (the id is part of what the
 * field was sealed with), and the caller must never see an id it did not ask
 * for. The existing source-text pins check where the code lives; these check
 * what it does.
 */
import { describe, expect, it } from "vitest";

import {
  CUSTOMER_PROTECTED_FIELDS,
  ORDER_PROTECTED_FIELDS,
  applyProtectedSelectionPlan,
  prepareProtectedSelection,
} from "@/lib/crypto/protected-pii";

function record(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("expected an object");
}

describe("protected selection planner", () => {
  it("asks for the id whenever a protected customer field is selected, and hides it again", () => {
    for (const field of CUSTOMER_PROTECTED_FIELDS) {
      const args = { select: { [field]: true } as Record<string, unknown> };
      const plan = prepareProtectedSelection(args, "Customer");
      expect(args.select.id).toBe(true);
      expect(plan.removeId).toBe(true);
      const row = record(applyProtectedSelectionPlan({ id: "c1", [field]: "sealed" }, plan));
      expect("id" in row).toBe(false);
      expect(row[field]).toBe("sealed");
    }
  });

  it("also fetches the stored phone ciphertext when a customer phone is selected", () => {
    const args = { select: { phone: true } as Record<string, unknown> };
    prepareProtectedSelection(args, "Customer");
    expect(args.select.phoneEnc).toBe(true);
  });

  it("keeps the id when the caller asked for it", () => {
    for (const field of ORDER_PROTECTED_FIELDS) {
      const args = { select: { id: true, [field]: true } as Record<string, unknown> };
      const plan = prepareProtectedSelection(args, "Order");
      expect(plan.removeId).toBe(false);
      expect(record(applyProtectedSelectionPlan({ id: "o1", [field]: "sealed" }, plan)).id).toBe("o1");
    }
  });

  it("leaves a selection with no protected field exactly as it was", () => {
    const args = { select: { createdAt: true, status: true } as Record<string, unknown> };
    const plan = prepareProtectedSelection(args, "Order");
    expect(args.select).toEqual({ createdAt: true, status: true });
    expect(plan).toEqual({ removeId: false, relations: {} });
  });

  it("plans nested relations on their own and strips only the ids it added", () => {
    const args = {
      select: { id: true, customer: { select: { phone: true } as Record<string, unknown> } },
    };
    const plan = prepareProtectedSelection(args);
    expect(args.select.customer.select).toEqual({ phone: true, id: true, phoneEnc: true });
    expect(plan.removeId).toBe(false);
    expect(plan.relations.customer?.removeId).toBe(true);
    const row = record(
      applyProtectedSelectionPlan({ id: "o1", customer: { id: "c1", phone: "sealed" } }, plan),
    );
    expect(row.id).toBe("o1");
    expect(record(row.customer)).toEqual({ phone: "sealed" });
  });

  it("plans an include of a to-many relation and strips every row", () => {
    const args = { include: { orders: { select: { notes: true } as Record<string, unknown> } } };
    const plan = prepareProtectedSelection(args, "Customer");
    const rows = applyProtectedSelectionPlan(
      { orders: [{ id: "o1", notes: "a" }, { id: "o2", notes: "b" }] },
      plan,
    );
    expect(record(rows).orders).toEqual([{ notes: "a" }, { notes: "b" }]);
  });

  it("passes empty values and missing relations through without error", () => {
    const plan = prepareProtectedSelection({ select: { customer: { select: { phone: true } } } });
    expect(applyProtectedSelectionPlan(null, plan)).toBeNull();
    expect(applyProtectedSelectionPlan(undefined, plan)).toBeUndefined();
    expect(applyProtectedSelectionPlan("text", plan)).toBe("text");
    expect(applyProtectedSelectionPlan({ id: "o1" }, plan)).toEqual({ id: "o1" });
    expect(applyProtectedSelectionPlan({ customer: null }, plan)).toEqual({ customer: null });
  });
});
