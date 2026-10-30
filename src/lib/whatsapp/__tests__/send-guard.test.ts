import { describe, expect, it } from "vitest";

import {
  WHATSAPP_SEND_GUARD,
  classifySendOrigin,
  evaluateSend,
  normalizeSendText,
  type SendGuardInput,
  type SendOrigin,
} from "../send-guard";

const NOW = new Date("2026-10-30T12:00:00.000Z");

function input(
  origin: SendOrigin,
  over: Partial<Omit<SendGuardInput, "origin" | "now">> = {},
): SendGuardInput {
  return {
    origin,
    now: NOW,
    conversationCountLastHour: 0,
    shopCountLastHour: 0,
    secondsSinceLastAutoSend: null,
    sameTextConversationsLast15m: 1,
    ...over,
  };
}

describe("WHATSAPP_SEND_GUARD constants (the decided policy, tunable in one place)", () => {
  it("holds the decided numbers", () => {
    expect(WHATSAPP_SEND_GUARD).toEqual({
      windowSeconds: 3600,
      bulkWindowSeconds: 900,
      human: {
        warnConversationPerHour: 40,
        refuseConversationPerHour: 90,
        refuseShopPerHour: 500,
      },
      automation: {
        minSecondsBetweenSends: 3,
        refuseConversationPerHour: 20,
        refuseShopPerHour: 200,
        holdSameTextConversations: 6,
      },
    });
  });
});

describe("evaluateSend: human origin", () => {
  it.each([
    [0, 0, "allow", "ok"],
    [39, 0, "allow", "ok"],
    [40, 0, "warn", "human_conversation_volume_warning"],
    [41, 0, "warn", "human_conversation_volume_warning"],
    [89, 0, "warn", "human_conversation_volume_warning"],
    [90, 0, "refuse", "human_conversation_hourly_limit"],
    [91, 0, "refuse", "human_conversation_hourly_limit"],
    [0, 499, "allow", "ok"],
    [0, 500, "refuse", "human_shop_hourly_limit"],
    [39, 499, "allow", "ok"],
    [40, 499, "warn", "human_conversation_volume_warning"],
    [89, 500, "refuse", "human_shop_hourly_limit"],
    [90, 500, "refuse", "human_conversation_hourly_limit"],
  ] as const)(
    "conversation %i / shop %i -> %s (%s)",
    (conversationCountLastHour, shopCountLastHour, action, reason) => {
      const decision = evaluateSend(
        input("human", { conversationCountLastHour, shopCountLastHour }),
      );
      expect(decision.action).toBe(action);
      expect(decision.reason).toBe(reason);
    },
  );

  it("a refuse says how long to wait (upper bound = the window), allow/warn do not", () => {
    const refused = evaluateSend(input("human", { conversationCountLastHour: 90 }));
    expect(refused.retryAfterSeconds).toBe(3600);
    expect(refused.retryAt?.toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(evaluateSend(input("human", { conversationCountLastHour: 40 })).retryAfterSeconds).toBeUndefined();
    expect(evaluateSend(input("human")).retryAfterSeconds).toBeUndefined();
  });

  it("never delays or holds a person: pacing and bulk text are automation rules", () => {
    const decision = evaluateSend(
      input("human", { secondsSinceLastAutoSend: 0, sameTextConversationsLast15m: 50 }),
    );
    expect(decision.action).toBe("allow");
  });
});

describe("evaluateSend: automation origin", () => {
  it.each([
    [0, 0, "allow", "ok"],
    [19, 0, "allow", "ok"],
    [20, 0, "refuse", "automation_conversation_hourly_limit"],
    [21, 0, "refuse", "automation_conversation_hourly_limit"],
    [0, 199, "allow", "ok"],
    [0, 200, "refuse", "automation_shop_hourly_limit"],
    [20, 200, "refuse", "automation_conversation_hourly_limit"],
    [39, 0, "refuse", "automation_conversation_hourly_limit"],
  ] as const)(
    "conversation %i / shop %i -> %s (%s); automation never warns",
    (conversationCountLastHour, shopCountLastHour, action, reason) => {
      const decision = evaluateSend(
        input("automation", { conversationCountLastHour, shopCountLastHour }),
      );
      expect(decision.action).toBe(action);
      expect(decision.reason).toBe(reason);
    },
  );

  it.each([
    [1, "allow"],
    [5, "allow"],
    [6, "hold"],
    [7, "hold"],
    [100, "hold"],
  ] as const)("same text to %i conversations -> %s", (sameTextConversationsLast15m, action) => {
    const decision = evaluateSend(input("automation", { sameTextConversationsLast15m }));
    expect(decision.action).toBe(action);
    if (action === "hold") {
      expect(decision.reason).toBe("automation_bulk_same_text");
      expect(decision.retryAfterSeconds).toBeUndefined();
    }
  });

  it.each([
    [null, "allow", undefined],
    [3, "allow", undefined],
    [3.0001, "allow", undefined],
    [60, "allow", undefined],
    [2.999, "delay", 1],
    [2.5, "delay", 1],
    [2, "delay", 1],
    [1.5, "delay", 2],
    [0.4, "delay", 3],
    [0, "delay", 3],
    [-1.5, "delay", 5],
    [-27, "delay", 30],
  ] as const)("seconds since last automatic send %s -> %s %s", (seconds, action, retry) => {
    const decision = evaluateSend(input("automation", { secondsSinceLastAutoSend: seconds }));
    expect(decision.action).toBe(action);
    expect(decision.retryAfterSeconds).toBe(retry);
    if (action === "delay") {
      expect(decision.reason).toBe("automation_pacing");
      expect(decision.retryAt?.getTime()).toBe(NOW.getTime() + (retry ?? 0) * 1000);
    }
  });

  it("precedence is refuse, then hold, then delay", () => {
    const all = { sameTextConversationsLast15m: 6, secondsSinceLastAutoSend: 0 };
    expect(evaluateSend(input("automation", { ...all, conversationCountLastHour: 20 })).action).toBe("refuse");
    expect(evaluateSend(input("automation", { ...all, shopCountLastHour: 200 })).action).toBe("refuse");
    expect(evaluateSend(input("automation", all)).action).toBe("hold");
    expect(evaluateSend(input("automation", { secondsSinceLastAutoSend: 0 })).action).toBe("delay");
  });

  it("accepts the clock as a number or a Date", () => {
    const decision = evaluateSend({ ...input("automation", { secondsSinceLastAutoSend: 1 }), now: NOW.getTime() });
    expect(decision.retryAt?.getTime()).toBe(NOW.getTime() + 2000);
  });
});

describe("evaluateSend: bad input is a programming error, never a silent allow", () => {
  it.each([
    ["negative conversation count", { conversationCountLastHour: -1 }],
    ["NaN shop count", { shopCountLastHour: Number.NaN }],
    ["fractional count", { conversationCountLastHour: 1.5 }],
    ["Infinity same text", { sameTextConversationsLast15m: Number.POSITIVE_INFINITY }],
    ["zero same text (the send itself counts as one)", { sameTextConversationsLast15m: 0 }],
    ["NaN pacing", { secondsSinceLastAutoSend: Number.NaN }],
  ] as const)("%s throws", (_name, over) => {
    expect(() => evaluateSend(input("automation", over))).toThrow(RangeError);
  });

  it("an unknown origin and an invalid clock throw", () => {
    expect(() => evaluateSend({ ...input("human"), origin: "robot" as SendOrigin })).toThrow(RangeError);
    expect(() => evaluateSend({ ...input("human"), now: new Date("nope") })).toThrow(RangeError);
  });
});

describe("classifySendOrigin", () => {
  it.each([
    ["authenticated-owner", "human"],
    ["test", "human"],
    ["system", "automation"],
    ["ai", "automation"],
    ["provider", "automation"],
    ["source", "automation"],
  ] as const)("principal %s -> %s", (kind, origin) => {
    expect(classifySendOrigin(kind)).toBe(origin);
  });
});

describe("normalizeSendText (the bulk-pattern key)", () => {
  it.each([
    ["  Hello   WORLD ", "hello world"],
    ["a\n\n b\t c", "a b c"],
    ["a\u00a0\u00a0b", "a b"],
    ["Order 12345 is ready", "order is ready"],
    ["a 1 b", "a b"],
    ["a1b", "ab"],
    ["12 hi 34", "hi"],
    ["طلبك رقم ١٢٣ جاهز", "طلبك رقم جاهز"],
    ["رقم ۴۵۶ جاهز", "رقم جاهز"],
    ["Colis １２ prêt", "colis prêt"],
    ["ÉCOLE Ça", "école ça"],
    ["12345", ""],
    ["   ", ""],
    ["", ""],
  ] as const)("%j -> %j", (raw, expected) => {
    expect(normalizeSendText(raw)).toBe(expected);
  });

  it("two messages that differ only in digits, case and spacing share one key", () => {
    expect(normalizeSendText("Salam Ahmed, order 1001 shipped")).toBe(
      normalizeSendText("  salam ahmed,   ORDER 77 shipped "),
    );
    expect(normalizeSendText("Salam Ahmed")).not.toBe(normalizeSendText("Salam Sara"));
  });
});
