import { describe, expect, it } from "vitest";
import type { ExtractedOrder } from "@/lib/ai/extraction/types";
import {
  formatFieldLine,
  formatReport,
  judgeField,
  messagesNeededForClaim,
  scoreHeldout,
  wilsonInterval,
  type HeldoutEntry,
  type Tally,
} from "./scorer";

const order = (o: Partial<ExtractedOrder>): ExtractedOrder => ({ items: [], ...o });

describe("wilsonInterval", () => {
  it("matches the textbook 95% values", () => {
    const a = wilsonInterval(8, 10);
    expect(a.low).toBeCloseTo(0.4902, 3);
    expect(a.high).toBeCloseTo(0.9433, 3);
    const b = wilsonInterval(10, 10);
    expect(b.low).toBeCloseTo(0.7224, 3);
    expect(b.high).toBe(1);
    const c = wilsonInterval(0, 10);
    expect(c.low).toBe(0);
    expect(c.high).toBeCloseTo(0.2775, 3);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe("messagesNeededForClaim", () => {
  it("counts the messages a clean run needs", () => {
    expect(messagesNeededForClaim(0.995, 1)).toBe(765);
    expect(messagesNeededForClaim(0.99, 1)).toBe(381);
    expect(messagesNeededForClaim(0.5, 1)).toBe(4);
  });
  it("is unreachable at or below the target, and grows with errors", () => {
    expect(messagesNeededForClaim(0.995, 0.995)).toBeNull();
    expect(messagesNeededForClaim(0.995, 0.5)).toBeNull();
    expect(messagesNeededForClaim(0.995, 0.9999)!).toBeGreaterThan(765);
  });
});

describe("judgeField", () => {
  const exp = { isOrder: true, phone: "0550000001", wilaya: "Oran", commune: "Es Senia", totalPrice: 4000, items: [{ productName: "Robe rouge", quantity: 2 }] };
  it("phone: digits only, exact", () => {
    expect(judgeField("phone", exp, order({ phone: "0550000001" }))).toBe("correct");
    expect(judgeField("phone", exp, order({ phone: "0550 00 00 01" }))).toBe("correct");
    expect(judgeField("phone", exp, order({ phone: "0550000002" }))).toBe("wrong");
    expect(judgeField("phone", exp, order({}))).toBe("missed");
    expect(judgeField("phone", exp, null)).toBe("missed");
    expect(judgeField("phone", { isOrder: false }, order({ phone: "0550000001" }))).toBe("spurious");
    expect(judgeField("phone", { isOrder: false }, null)).toBe("absent");
  });
  it("wilaya and commune ignore case, accents and Arabic marks", () => {
    expect(judgeField("wilaya", { isOrder: true, wilaya: "Béjaïa" }, order({ wilaya: "bejaia" }))).toBe("correct");
    expect(judgeField("wilaya", exp, order({ wilaya: "Alger" }))).toBe("wrong");
    expect(judgeField("commune", exp, order({ commune: "ES-SENIA" }))).toBe("correct");
    expect(judgeField("commune", exp, order({}))).toBe("missed");
  });
  it("total is an exact number", () => {
    expect(judgeField("total", exp, order({ totalPrice: 4000 }))).toBe("correct");
    expect(judgeField("total", exp, order({ totalPrice: 4001 }))).toBe("wrong");
    expect(judgeField("total", exp, order({}))).toBe("missed");
    expect(judgeField("total", { isOrder: true }, order({ totalPrice: 5 }))).toBe("spurious");
  });
  it("items: quantity must match; strict needs the same name, lenient allows containment", () => {
    const one = (name: string, quantity: number) => order({ items: [{ productName: name, quantity }] });
    expect(judgeField("productQty", exp, one("robe rouge", 2))).toBe("correct");
    expect(judgeField("productQty", exp, one("robe rouge", 3))).toBe("wrong");
    expect(judgeField("productQty", exp, one("robe rouge longue", 2))).toBe("wrong");
    expect(judgeField("productQtyLenient", exp, one("robe rouge longue", 2))).toBe("correct");
    expect(judgeField("productQtyLenient", exp, one("ab", 2))).toBe("wrong");
    expect(judgeField("productQty", exp, order({}))).toBe("missed");
    expect(judgeField("productQty", { isOrder: false }, one("x", 1))).toBe("spurious");
    const two = { isOrder: true, items: [{ productName: "sac", quantity: 1 }, { productName: "montre", quantity: 2 }] };
    expect(judgeField("productQty", two, order({ items: [{ productName: "montre", quantity: 2 }, { productName: "sac", quantity: 1 }] }))).toBe("correct");
    expect(judgeField("productQty", two, one("sac", 1))).toBe("wrong");
  });
});

describe("scoreHeldout", () => {
  const entries: HeldoutEntry[] = [
    { id: "E1", group: "g", text: "one", expected: { isOrder: true, phone: "0550000001", wilaya: "Oran", items: [{ productName: "robe", quantity: 2 }], totalPrice: 4000 } },
    { id: "E2", group: "g", text: "two", expected: { isOrder: true, phone: "0550000002", wilaya: "Alger", commune: "Bab Ezzouar", items: [{ productName: "sac", quantity: 1 }] } },
    { id: "E3", group: "g", text: "three", expected: { isOrder: false } },
    { id: "E4", group: "g", text: "four", expected: { isOrder: false } },
  ];
  const read = (text: string) => {
    if (text === "one") return { predictedOrder: true, order: order({ phone: "0550000001", wilaya: "Oran", items: [{ productName: "robe", quantity: 2 }], totalPrice: 4000 }) };
    if (text === "two") return { predictedOrder: true, order: order({ phone: "0550000003", commune: "Bab Ezzouar", items: [{ productName: "sac noir", quantity: 1 }] }) };
    if (text === "three") return { predictedOrder: true, order: order({ phone: "0550000004" }) };
    return { predictedOrder: false, order: null };
  };
  const s = scoreHeldout(entries, read);
  const t = (x: Tally) => [x.stated, x.correct, x.wrong, x.missed, x.unstated, x.spurious];
  it("tallies every field", () => {
    expect(s.entries).toBe(4);
    expect(t(s.tallies.phone)).toEqual([2, 1, 1, 0, 2, 1]);
    expect(t(s.tallies.wilaya)).toEqual([2, 1, 0, 1, 2, 0]);
    expect(t(s.tallies.commune)).toEqual([1, 1, 0, 0, 3, 0]);
    expect(t(s.tallies.productQty)).toEqual([2, 1, 1, 0, 2, 0]);
    expect(t(s.tallies.productQtyLenient)).toEqual([2, 2, 0, 0, 2, 0]);
    expect(t(s.tallies.total)).toEqual([1, 1, 0, 0, 3, 0]);
    expect(t(s.detection)).toEqual([2, 2, 0, 0, 2, 1]);
  });
  it("lists each failure once, in field order", () => {
    expect(s.failures.map((f) => `${f.id}:${f.field}:${f.verdict}`)).toEqual([
      "E2:phone:wrong",
      "E2:wilaya:missed",
      "E2:productQty:wrong",
      "E3:phone:spurious",
      "E3:isOrder:spurious",
    ]);
  });
  it("prints the exact line", () => {
    const tally: Tally = { stated: 10, correct: 8, wrong: 1, missed: 1, unstated: 5, spurious: 2 };
    expect(formatFieldLine("phone", tally)).toBe(
      `${"phone".padEnd(18)}stated 10 | correct 8 | wrong 1 | missed 1 | accuracy 80.0% | Wilson95 [49.0%, 94.3%] | spurious 2/5`,
    );
    expect(formatFieldLine("total", { stated: 0, correct: 0, wrong: 0, missed: 0, unstated: 3, spurious: 0 })).toBe(
      `${"total".padEnd(18)}stated 0 | correct 0 | wrong 0 | missed 0 | accuracy n/a | Wilson95 n/a | spurious 0/3`,
    );
  });
  it("states the 99.5% claim size in the report", () => {
    const report = formatReport(s);
    expect(report).toContain("HELD-OUT SET: 4 messages");
    expect(report).toContain("zero errors need 765 messages");
    expect(report).toContain("wilaya");
  });
});
