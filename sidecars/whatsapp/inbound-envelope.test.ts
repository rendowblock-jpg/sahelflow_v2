import { describe, expect, it } from "vitest";

import {
  conformIncomingForApp,
  conformMessageTimestamp,
  conformParticipant,
  conformPushName,
  summarizeRejectedFields,
} from "./inbound-envelope";
import type { IncomingMessage } from "./whatsapp";

describe("conformParticipant", () => {
  it("keeps a usable sender JID, trimmed", () => {
    expect(conformParticipant("213555000111@s.whatsapp.net")).toBe(
      "213555000111@s.whatsapp.net",
    );
    expect(conformParticipant("  213555000111@s.whatsapp.net ")).toBe(
      "213555000111@s.whatsapp.net",
    );
    expect(conformParticipant("a".repeat(256))).toBe("a".repeat(256));
    // The app counts characters, not UTF-16 units (zod 4.5 and later): 255 letters
    // and one emoji are 256 characters, so the app accepts them and so must we.
    expect(conformParticipant(`${"a".repeat(255)}😀`)).toBe(`${"a".repeat(255)}😀`);
  });

  it("drops what the app would refuse: empty, blank, over-long or not a string", () => {
    for (const value of ["", "   ", "a".repeat(257), `${"a".repeat(256)}😀`, null, undefined, 42, {}, []]) {
      expect(conformParticipant(value)).toBeUndefined();
    }
  });
});

describe("conformPushName", () => {
  it("keeps a display name, trimmed, and keeps an empty one empty (the app accepts and stores it that way)", () => {
    expect(conformPushName(" Amina ")).toBe("Amina");
    expect(conformPushName("x".repeat(256))).toBe("x".repeat(256));
    // 255 letters and an emoji are 256 characters (257 UTF-16 units): the app accepts that, so it stays.
    expect(conformPushName(`${"a".repeat(255)}😀`)).toBe(`${"a".repeat(255)}😀`);
    expect(conformPushName("😀".repeat(256))).toBe("😀".repeat(256));
    expect(conformPushName("")).toBe("");
    expect(conformPushName("   ")).toBe("");
  });

  it("shortens an over-long name instead of letting it block the message", () => {
    expect(conformPushName("y".repeat(400))).toBe("y".repeat(256));
    expect(conformPushName("😀".repeat(300))).toBe("😀".repeat(256));
    expect(conformPushName(`${"a".repeat(256)}😀`)).toBe("a".repeat(256));
  });

  it("counts characters the way the app does and never ends on half of a surrogate pair", () => {
    const shortened = conformPushName(`${"a".repeat(255)}😀tail`) ?? "";
    expect(Array.from(shortened).length).toBeLessThanOrEqual(256);
    const last = shortened.charCodeAt(shortened.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    expect(shortened).toBe(`${"a".repeat(255)}😀`);
  });

  it("drops a value that is not a string", () => {
    for (const value of [null, undefined, 7, {}, []]) {
      expect(conformPushName(value)).toBeUndefined();
    }
  });
});

describe("conformMessageTimestamp", () => {
  it("passes a whole non-negative number through unchanged", () => {
    expect(conformMessageTimestamp(1_792_341_426)).toBe(1_792_341_426);
    expect(conformMessageTimestamp(0)).toBe(0);
  });

  it("rounds a fraction down and refuses a negative, NaN, infinite or unsafe value", () => {
    expect(conformMessageTimestamp(1_792_341_426.9)).toBe(1_792_341_426);
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) {
      expect(conformMessageTimestamp(value)).toBe(0);
    }
  });

  it("reads a protobuf Long, including a low half that is negative as a signed int (after January 2038)", () => {
    expect(conformMessageTimestamp({ low: 1_792_341_426, high: 0, unsigned: false })).toBe(
      1_792_341_426,
    );
    expect(conformMessageTimestamp({ low: -2_147_483_648, high: 0 })).toBe(2_147_483_648);
    expect(conformMessageTimestamp({ low: 5, high: 1 })).toBe(4_294_967_301);
    // A negative signed Long is not a point in time.
    expect(conformMessageTimestamp({ low: 5, high: -1 })).toBe(0);
  });

  it("keeps the old answer of 0 for everything else, including a decimal string", () => {
    // The sidecar has always sent 0 for a string and the app may already hold
    // the event that way; reading it now would make a replay conflict.
    for (const value of ["1792341426", "abc", "", null, undefined, {}, [], true]) {
      expect(conformMessageTimestamp(value)).toBe(0);
    }
  });
});

describe("conformIncomingForApp", () => {
  const acceptable: IncomingMessage = {
    key: { remoteJid: "213555123456@s.whatsapp.net", fromMe: false, id: "ABC123" },
    message: { conversation: "hello" },
    messageTimestamp: 1_792_341_426,
    pushName: "Amina",
  };
  const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it("leaves a message the app already accepts exactly as it is on the wire", () => {
    expect(wire(conformIncomingForApp(acceptable))).toEqual(wire(acceptable));
  });

  it("fits the three strict fields and leaves identity and content alone", () => {
    const odd = {
      key: { ...acceptable.key, participant: "" },
      message: { conversation: "keep me" },
      messageTimestamp: -5,
      pushName: "n".repeat(400),
    } as IncomingMessage;
    const before = JSON.stringify(odd);

    const fitted = conformIncomingForApp(odd);

    expect(fitted.key.participant).toBeUndefined();
    expect(fitted.messageTimestamp).toBe(0);
    expect(fitted.pushName).toBe("n".repeat(256));
    expect(fitted.key.remoteJid).toBe(acceptable.key.remoteJid);
    expect(fitted.key.id).toBe(acceptable.key.id);
    expect(fitted.key.fromMe).toBe(false);
    expect(fitted.message).toEqual({ conversation: "keep me" });
    // The stored record is not edited in place.
    expect(JSON.stringify(odd)).toBe(before);
  });
});

describe("summarizeRejectedFields", () => {
  it("names the field path and the validation code, nothing else", () => {
    expect(
      summarizeRejectedFields([
        {
          code: "too_small",
          origin: "string",
          minimum: 1,
          path: ["message", "key", "participant"],
          message: "Too small: expected string to have >=1 characters",
        },
        { code: "invalid_type", expected: "number", path: ["message", "messageTimestamp"] },
      ]),
    ).toBe("message.key.participant:too_small;message.messageTimestamp:invalid_type");
  });

  it("never repeats the app's message text or any value it echoed", () => {
    const summary = summarizeRejectedFields([
      {
        code: "invalid_value",
        path: ["message", "key", "fromMe"],
        message: "Invalid input: CUSTOMER-SECRET-TEXT",
        input: "CUSTOMER-SECRET-TEXT",
        values: ["CUSTOMER-SECRET-TEXT"],
      },
    ]);
    expect(summary).toBe("message.key.fromMe:invalid_value");
    expect(summary).not.toContain("SECRET");
  });

  it("replaces a path segment or code that is not a plain identifier", () => {
    expect(
      summarizeRejectedFields([
        { code: "custom text!", path: ["message", "213555000111@s.whatsapp.net", 2, -1, "a b"] },
      ]),
    ).toBe("message.?.2.?.?:?");
  });

  it("says root for an issue with no path, and caps the number and length of entries", () => {
    expect(summarizeRejectedFields([{ code: "invalid_type" }])).toBe("root:invalid_type");
    const many = Array.from({ length: 20 }, (_, index) => ({
      code: "too_small",
      path: ["message", "key", `field${index}`],
    }));
    const summary = summarizeRejectedFields(many) ?? "";
    expect(summary.split(";")).toHaveLength(6);
    expect(summary.length).toBeLessThanOrEqual(150);
  });

  it("returns null when there is nothing usable", () => {
    for (const value of [undefined, null, "oops", 5, {}, [], [null, 1, "x"]]) {
      expect(summarizeRejectedFields(value)).toBeNull();
    }
  });
});
