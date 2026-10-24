import { describe, expect, it } from "vitest";

import {
  hashWhatsAppAccountId,
  isSameWhatsAppAccount,
} from "./auth-tokens";

describe("isSameWhatsAppAccount", () => {
  const PAIRED = "213555999000:12@s.whatsapp.net";

  it("treats a new device index of the same number as the same account", () => {
    expect(isSameWhatsAppAccount("213555999000:5@s.whatsapp.net", PAIRED)).toBe(true);
    expect(isSameWhatsAppAccount("213555999000@s.whatsapp.net", PAIRED)).toBe(true);
    expect(isSameWhatsAppAccount(` ${PAIRED} `, PAIRED)).toBe(true);
  });

  it("agrees with the account hash that scopes the ingress and effect keys", () => {
    for (const other of [
      "213555999000:5@s.whatsapp.net",
      "213555888000:12@s.whatsapp.net",
      "213555999001:12@s.whatsapp.net",
    ]) {
      expect(isSameWhatsAppAccount(other, PAIRED)).toBe(
        hashWhatsAppAccountId(other) === hashWhatsAppAccountId(PAIRED),
      );
    }
  });

  it("refuses another number, even on the same device index", () => {
    expect(isSameWhatsAppAccount("213555888000:12@s.whatsapp.net", PAIRED)).toBe(false);
    expect(isSameWhatsAppAccount("213555999001:12@s.whatsapp.net", PAIRED)).toBe(false);
  });

  it("refuses an id that holds no usable number, and keeps equal strings equal", () => {
    expect(isSameWhatsAppAccount("", PAIRED)).toBe(false);
    expect(isSameWhatsAppAccount("abc@lid", PAIRED)).toBe(false);
    expect(isSameWhatsAppAccount("12345", PAIRED)).toBe(false);
    // Equal before, equal now: the later hash step is what refuses a malformed id, as it always did.
    expect(isSameWhatsAppAccount("abc@lid", "abc@lid")).toBe(true);
  });
});
