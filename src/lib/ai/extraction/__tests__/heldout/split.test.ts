import { describe, expect, it } from "vitest";
import { HELDOUT_SET } from "./heldout-set";
import { splitHeldout, splitReports, type HeldoutEntry } from "./scorer";

const e = (id: string, isOrder = false): HeldoutEntry => ({ id, group: "g", text: id, expected: { isOrder } });

describe("splitHeldout", () => {
  it("puts odd running numbers in DIAG and even ones in SEALED, in order", () => {
    const { diag, sealed } = splitHeldout([e("A"), e("B"), e("C"), e("D"), e("E")]);
    expect(diag.map((x) => x.id)).toEqual(["A", "C", "E"]);
    expect(sealed.map((x) => x.id)).toEqual(["B", "D"]);
    expect(splitHeldout([])).toEqual({ diag: [], sealed: [] });
  });

  it("splits the real set into two disjoint halves of 99 and 98", () => {
    const { diag, sealed } = splitHeldout(HELDOUT_SET);
    expect(HELDOUT_SET.length).toBe(197);
    expect(diag.length).toBe(99);
    expect(sealed.length).toBe(98);
    const ids = new Set(diag.map((x) => x.id));
    expect(sealed.some((x) => ids.has(x.id))).toBe(false);
    expect(diag[0]?.id).toBe("HO-AR-01");
    expect(sealed[0]?.id).toBe("HO-AR-02");
  });
});

describe("splitReports", () => {
  const entries = [e("A", true), e("B", true), e("C"), e("D")];
  const reports = splitReports(entries, (text) =>
    text === "A" ? { predictedOrder: true, order: { items: [] } } : { predictedOrder: text === "D", order: null },
  );
  it("prints a headed report per half", () => {
    expect(reports.diag.split("\n")[0]).toBe("DIAG half (odd running numbers): 2 messages");
    expect(reports.sealed.split("\n")[0]).toBe("SEALED half (even running numbers): 2 messages");
    expect(reports.diag).toContain("isOrder(detect)   stated 1 | correct 1 | wrong 0 | missed 0");
    expect(reports.sealed).toContain("isOrder(detect)   stated 1 | correct 0 | wrong 0 | missed 1");
    expect(reports.sealed).toContain("spurious 1/1");
  });
  it("hands out the failures of DIAG only, never those of SEALED", () => {
    expect(Object.keys(reports).sort()).toEqual(["diag", "diagFailures", "sealed"]);
    expect(reports.diagFailures.map((f) => f.id)).toEqual([]);
    expect(reports.sealed).not.toContain("FAILURES");
  });
});
