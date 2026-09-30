import { describe, expect, it } from "vitest";

import {
  ORDER_SOURCE_MAX_SELECTED,
  composeOrderSource,
  defaultOrderSelection,
  orderSourceWindow,
  type OrderSourceMessage,
} from "@/components/inbox/extraction/order-source-messages";

const msg = (
  id: string,
  direction: OrderSourceMessage["direction"],
  timestamp: number,
  body = `body ${id}`,
  messageType?: string,
): OrderSourceMessage => ({ id, direction, timestamp, body, messageType });

describe("order source messages", () => {
  const thread = [
    msg("a", "inbound", 1, "salam"),
    msg("b", "outbound", 2, "wa alaykum salam, how can I help?"),
    msg("c", "inbound", 3, "bghit 2 black"),
    msg("img", "inbound", 4, "", "image"),
    msg("d", "inbound", 5, "Amina, 0555123456"),
    msg("e", "inbound", 6, "Alger centre"),
    msg("f", "outbound", 7, "noted, thanks"),
    msg("g", "inbound", 8, "and one more please"),
  ];

  it("lists text messages only, oldest first", () => {
    const window = orderSourceWindow([...thread].reverse());
    expect(window.map((m) => m.id)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("defaults to the customer burst around the picked message", () => {
    const window = orderSourceWindow(thread);
    expect(defaultOrderSelection(window, "d")).toEqual(["c", "d", "e"]);
    expect(defaultOrderSelection(window, "g")).toEqual(["g"]);
    expect(defaultOrderSelection(window, "missing")).toEqual([]);
  });

  it("caps the burst, keeping the newest messages", () => {
    const long = Array.from({ length: 30 }, (_, i) => msg(`m${i}`, "inbound", i));
    const selection = defaultOrderSelection(orderSourceWindow(long), "m29");
    expect(selection).toHaveLength(ORDER_SOURCE_MAX_SELECTED);
    expect(selection.at(-1)).toBe("m29");
  });

  it("composes the selection chronologically and anchors to the latest", () => {
    const window = orderSourceWindow(thread);
    const composed = composeOrderSource(window, new Set(["e", "c"]));
    expect(composed.body).toBe("bghit 2 black\n\nAlger centre");
    expect(composed.anchorId).toBe("e");
    expect(composed.count).toBe(2);
    expect(composeOrderSource(window, new Set()).anchorId).toBeNull();
  });
});
