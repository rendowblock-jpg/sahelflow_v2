import { describe, expect, it } from "vitest";

import {
  evaluateConditions,
  type Condition,
  type ConditionGroup,
} from "../conditions";

const payload = {
  status: "delivered",
  totalPrice: 7_500,
  wilaya: "Alger",
  tags: ["vip"],
  emptyText: "",
  customer: {
    name: "Ahmed Benali",
    phone: null,
  },
};

function condition(
  field: string,
  operator: Condition["operator"],
  value: unknown = null,
): Condition {
  return { field, operator, value };
}

describe("evaluateConditions", () => {
  it("matches missing and empty condition groups", () => {
    expect(evaluateConditions(null, payload)).toBe(true);
    expect(evaluateConditions(undefined, payload)).toBe(true);
    expect(evaluateConditions({} as ConditionGroup, payload)).toBe(true);
  });

  it("evaluates equality and string operators with dot notation", () => {
    expect(
      evaluateConditions(condition("status", "equal", "delivered"), payload),
    ).toBe(true);
    expect(
      evaluateConditions(condition("status", "not_equal", "returned"), payload),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("customer.name", "contains", "ben"),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("customer.name", "not_contains", "omar"),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("customer.name", "starts_with", "ahm"),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("customer.name", "ends_with", "nali"),
        payload,
      ),
    ).toBe(true);
  });

  it("evaluates numeric comparison operators", () => {
    expect(
      evaluateConditions(
        condition("totalPrice", "greater_than", 7_000),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(condition("totalPrice", "less_than", 8_000), payload),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("totalPrice", "greater_than_or_equal", 7_500),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        condition("totalPrice", "less_than_or_equal", 7_500),
        payload,
      ),
    ).toBe(true);
  });

  it("evaluates membership and empty-value operators", () => {
    expect(
      evaluateConditions(
        condition("wilaya", "in", ["Oran", "Alger"]),
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(condition("wilaya", "not_in", ["Oran"]), payload),
    ).toBe(true);
    expect(
      evaluateConditions(condition("emptyText", "is_empty"), payload),
    ).toBe(true);
    expect(
      evaluateConditions(condition("customer.phone", "is_empty"), payload),
    ).toBe(true);
    expect(
      evaluateConditions(condition("wilaya", "is_not_empty"), payload),
    ).toBe(true);
    expect(
      evaluateConditions(condition("tags", "is_not_empty"), payload),
    ).toBe(true);
  });

  it("combines all and any groups", () => {
    expect(
      evaluateConditions(
        {
          all: [
            condition("wilaya", "equal", "Alger"),
            condition("totalPrice", "greater_than", 5_000),
          ],
        },
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        {
          any: [
            condition("status", "equal", "returned"),
            condition("status", "equal", "delivered"),
          ],
        },
        payload,
      ),
    ).toBe(true);
  });

  it("fails closed for missing fields and unsupported operators", () => {
    expect(
      evaluateConditions(condition("customer.missing", "contains", "x"), payload),
    ).toBe(false);
    expect(
      evaluateConditions(
        condition("status", "unsupported" as Condition["operator"], "x"),
        payload,
      ),
    ).toBe(false);
  });
});
