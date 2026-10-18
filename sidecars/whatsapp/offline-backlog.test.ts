import { describe, expect, it } from "vitest";

import { summarizeOfflineNode } from "./offline-backlog";

describe("summarizeOfflineNode", () => {
  it("reads the counts the provider announces in its offline preview", () => {
    const node = {
      tag: "ib",
      attrs: {},
      content: [
        {
          tag: "offline_preview",
          attrs: { total: "14", message: "9", notification: "3", receipt: "2", appdata: "0" },
        },
      ],
    };
    expect(summarizeOfflineNode(node, "offline_preview")).toEqual({
      total: 14,
      message: 9,
      notification: 3,
      receipt: 2,
      appdata: 0,
    });
  });

  it("reads how many the provider says it handled", () => {
    const node = { tag: "ib", attrs: {}, content: [{ tag: "offline", attrs: { count: "9" } }] };
    expect(summarizeOfflineNode(node, "offline")).toEqual({ count: 9 });
  });

  it("keeps only the known counters and only plain numbers", () => {
    const node = {
      tag: "ib",
      attrs: {},
      content: [
        {
          tag: "offline_preview",
          attrs: {
            message: "7",
            jid: "213555123456@s.whatsapp.net",
            notification: "-3",
            receipt: "1e9",
            total: "99999999",
            call: 2,
            count: "abc",
          },
        },
      ],
    };
    const summary = summarizeOfflineNode(node, "offline_preview");
    expect(summary).toEqual({ message: 7, call: 2 });
    expect(JSON.stringify(summary)).not.toContain("213555");
  });

  it("returns an empty summary for a child without attributes and null when the child is missing", () => {
    expect(
      summarizeOfflineNode({ tag: "ib", attrs: {}, content: [{ tag: "offline" }] }, "offline"),
    ).toEqual({});
    expect(
      summarizeOfflineNode({ tag: "ib", attrs: {}, content: [{ tag: "other", attrs: {} }] }, "offline"),
    ).toBeNull();
  });

  it("never throws on something that is not a node", () => {
    for (const value of [undefined, null, "x", 3, [], {}, { content: "no" }, { content: [null, 1] }]) {
      expect(() => summarizeOfflineNode(value, "offline")).not.toThrow();
      expect(summarizeOfflineNode(value, "offline")).toBeNull();
    }
  });
});
