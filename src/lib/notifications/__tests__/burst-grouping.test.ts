import { describe, expect, it } from "vitest";
import { BURST_WINDOW_MS, collapseBursts, createBurstGate, type GroupableItem } from "../burst";

describe("one toast per burst", () => {
  it("allows the first, blocks the rest of the 90 s window, allows again at 90 s", () => {
    const gate = createBurstGate();
    expect(BURST_WINDOW_MS).toBe(90_000);
    expect(gate.allow("order.new", 1_000)).toBe(true);
    gate.record("order.new", 1_000);
    expect(gate.allow("order.new", 1_001)).toBe(false);
    expect(gate.allow("order.new", 90_999)).toBe(false);
    expect(gate.allow("order.new", 91_000)).toBe(true);
  });
  it("40 rows of one kind in one minute make exactly one toast; another kind is independent", () => {
    const gate = createBurstGate();
    let shown = 0;
    for (let i = 0; i < 40; i += 1) {
      const now = 5_000 + i * 1_000;
      if (gate.allow("whatsapp.received", now)) { gate.record("whatsapp.received", now); shown += 1; }
    }
    expect(shown).toBe(1);
    expect(gate.allow("order.new", 6_000)).toBe(true);
  });
  it("a row that was not shown (record not called) does not eat the window", () => {
    const gate = createBurstGate();
    expect(gate.allow("order.new", 10)).toBe(true);
    expect(gate.allow("order.new", 20)).toBe(true);
  });
});

const row = (id: string, kind: string | null, iso: string, count: number | null, read = false, durable = true): GroupableItem =>
  ({ id, kind, createdAt: iso, count, read, durable });

describe("grouping by kind with a count", () => {
  it("folds neighbouring order rows into one line with the total", () => {
    const out = collapseBursts([
      row("a", "order.new", "2026-10-31T10:20:00Z", 5),
      row("b", "order.new", "2026-10-31T10:10:00Z", 4),
      row("c", "order.new", "2026-10-31T10:00:00Z", 3, true),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.groupCount).toBe(12);
    expect(out[0]?.groupedIds).toEqual(["a", "b", "c"]);
    expect(out[0]?.read).toBe(false);
  });
  it("leaves single rows, other kinds, far-apart rows and computed rows alone", () => {
    const out = collapseBursts([
      row("a", "order.new", "2026-10-31T12:00:00Z", 2),
      row("b", "backup.failed", "2026-10-31T11:50:00Z", null),
      row("c", "backup.failed", "2026-10-31T11:40:00Z", null),
      row("d", "order.new", "2026-10-31T09:00:00Z", 2),
      row("e", "order.new", "2026-10-31T08:55:00Z", 1, false, false),
      row("f", "order.new", "2026-10-31T08:50:00Z", 1, false, false),
    ]);
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(out.every((i) => i.groupCount === undefined)).toBe(true);
  });
  it("a group is read only when every row in it is read", () => {
    const out = collapseBursts([
      row("a", "whatsapp.received", "2026-10-31T10:10:00Z", 1, true),
      row("b", "whatsapp.received", "2026-10-31T10:00:00Z", 1, true),
    ]);
    expect(out[0]?.read).toBe(true);
    expect(out[0]?.groupCount).toBe(2);
  });
});
