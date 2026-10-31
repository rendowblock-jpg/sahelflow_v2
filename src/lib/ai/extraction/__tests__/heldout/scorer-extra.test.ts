import { describe, expect, it } from "vitest";
import { judgeField } from "./scorer";

const sac = { productName: "sac", quantity: 1 };
describe("items the message does not state", () => {
  it("an extra item makes the reading wrong", () => {
    expect(judgeField("productQty", { isOrder: true, items: [sac] }, { items: [sac, { productName: "montre", quantity: 1 }] })).toBe("wrong");
  });
  it("one reading cannot serve two expected lines", () => {
    expect(judgeField("productQty", { isOrder: true, items: [sac, sac] }, { items: [sac, { productName: "montre", quantity: 1 }] })).toBe("wrong");
  });
  it("a lenient match needs at least three letters", () => {
    expect(judgeField("productQtyLenient", { isOrder: true, items: [sac] }, { items: [{ productName: "sa", quantity: 1 }] })).toBe("wrong");
  });
});
