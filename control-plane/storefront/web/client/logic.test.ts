import { describe, expect, it } from "vitest";

import { normalizeDZPhone, isValidDZMobilePhone } from "../../../../src/lib/validation/phone";
import { ID } from "../../shared";
import {
  availableModes,
  clampQuantity,
  feeFor,
  formatPhone,
  isValidPhone,
  newIdempotencyKey,
  normalizePhone,
  orderSignature,
  shortRef,
  totals,
  validate,
  type FeeTable,
} from "./logic";

const PHONES = [
  "0555123456", "05 55 12 34 56", "0555-12-34-56", "+213555123456", "00213555123456", "213555123456",
  "555123456", "0655123456", "0755123456", "0455123456", "0855123456", "05551234", "055512345678",
  "", "   ", "abc", "٠٥٥٥١٢٣٤٥٦", "+213 (0) 555 12 34 56", "0555 123 456 789",
];

describe("browser phone rules match the app's", () => {
  it.each(PHONES)("%j", (raw) => {
    const ascii = raw.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
    expect(normalizePhone(raw)).toBe(normalizeDZPhone(ascii));
    expect(isValidPhone(raw)).toBe(isValidDZMobilePhone(ascii));
  });

  it("reads Arabic-Indic and Persian digits", () => {
    expect(isValidPhone("٠٥٥٥١٢٣٤٥٦")).toBe(true);
    expect(isValidPhone("۰۵۵۵۱۲۳۴۵۶")).toBe(true);
    expect(normalizePhone("+٢١٣٥٥٥١٢٣٤٥٦")).toBe("0555123456");
  });
});

const FEES: FeeTable = { "16": [500, 300], "01": [900, null], "31": [null, 400], "05": [0, 0] };

describe("delivery fees and totals", () => {
  it("looks up a fee per wilaya and mode, null when not offered", () => {
    expect(feeFor(FEES, "16", "home")).toBe(500);
    expect(feeFor(FEES, "16", "desk")).toBe(300);
    expect(feeFor(FEES, "01", "desk")).toBeNull();
    expect(feeFor(FEES, "99", "home")).toBeNull();
    expect(feeFor(FEES, "05", "home")).toBe(0);
  });

  it("lists the modes a wilaya offers", () => {
    expect(availableModes(FEES, "16")).toEqual(["home", "desk"]);
    expect(availableModes(FEES, "01")).toEqual(["home"]);
    expect(availableModes(FEES, "31")).toEqual(["desk"]);
    expect(availableModes(FEES, "99")).toEqual([]);
  });

  it("adds the fee to the line total, and a missing fee adds nothing", () => {
    expect(totals(2_500, 3, 500)).toEqual({ subtotal: 7_500, shipping: 500, total: 8_000 });
    expect(totals(2_500, 3, 0)).toEqual({ subtotal: 7_500, shipping: 0, total: 7_500 });
    expect(totals(2_500, 3, null)).toEqual({ subtotal: 7_500, shipping: null, total: 7_500 });
  });

  it("keeps the quantity between 1, the units left and the hard maximum", () => {
    expect(clampQuantity(0, 10)).toBe(1);
    expect(clampQuantity(-4, 10)).toBe(1);
    expect(clampQuantity(5, 3)).toBe(3);
    expect(clampQuantity(5, 0)).toBe(1);
    expect(clampQuantity(500, 1000)).toBe(50);
    expect(clampQuantity(2.9, 10)).toBe(2);
    expect(clampQuantity(Number.NaN, 10)).toBe(1);
  });
});

describe("order identity", () => {
  it("makes keys the Worker accepts and never repeats them", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 200; n += 1) {
      const key = newIdempotencyKey(crypto.getRandomValues(new Uint8Array(12)));
      expect(ID.test(key)).toBe(true);
      seen.add(key);
    }
    expect(seen.size).toBe(200);
    expect(newIdempotencyKey(new Uint8Array(12))).toBe("ck_000000000000000000000000");
  });

  it("treats a changed order as a different order and an unchanged one as the same", () => {
    const a = orderSignature(["r1", "p:base", 2, "16", "Bab Ezzouar", "home", "0555123456", "Amine", "Rue 1", ""]);
    expect(orderSignature(["r1", "p:base", 2, "16", "Bab Ezzouar", "home", "0555123456", "Amine", "Rue 1", ""])).toBe(a);
    expect(orderSignature(["r1", "p:base", 3, "16", "Bab Ezzouar", "home", "0555123456", "Amine", "Rue 1", ""])).not.toBe(a);
    expect(orderSignature(["r2", "p:base", 2, "16", "Bab Ezzouar", "home", "0555123456", "Amine", "Rue 1", ""])).not.toBe(a);
  });

  it("shows a short, upper-case reference", () => {
    expect(shortRef("rcpt_0123456789abcdef0123456789abcdef")).toBe("89ABCDEF");
  });
});

describe("form validation", () => {
  const good = { name: "Amine B", phone: "0555123456", wilaya: "16", commune: "Bab Ezzouar", address: "Cité 5, rue 3", mode: "home" as const };

  it("accepts a complete order", () => {
    expect(validate(good)).toEqual({});
  });

  it("names every problem at once", () => {
    expect(validate({ name: " ", phone: "123", wilaya: "", commune: "", address: "abc", mode: null })).toEqual({
      name: true, phone: true, wilaya: true, commune: true, address: true, mode: true,
    });
  });

  it("holds the line on each field", () => {
    expect(validate({ ...good, name: "A" }).name).toBe(true);
    expect(validate({ ...good, phone: "0455123456" }).phone).toBe(true);
    expect(validate({ ...good, address: "    " }).address).toBe(true);
    expect(validate({ ...good, phone: "+213 555 12 34 56" })).toEqual({});
  });
});

describe("formatPhone", () => {
  it("writes a national number the way Algerians do, in pairs", () => {
    expect(formatPhone("0555123456")).toBe("05 55 12 34 56");
    expect(formatPhone(normalizePhone("+213 555 12 34 56"))).toBe("05 55 12 34 56");
    expect(formatPhone(normalizePhone("٠٥٥٥١٢٣٤٥٦"))).toBe("05 55 12 34 56");
  });
  it("is stable when applied twice and keeps a half-typed number readable", () => {
    expect(formatPhone(formatPhone("0555123456"))).toBe("05 55 12 34 56");
    expect(formatPhone("055512")).toBe("05 55 12");
    expect(formatPhone("")).toBe("");
  });
  it("never changes whether a number is valid", () => {
    for (const raw of ["0555123456", "0655123456", "0455123456", "055512345"]) {
      expect(isValidPhone(formatPhone(normalizePhone(raw)))).toBe(isValidPhone(raw));
    }
  });
});
