import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import {
  createCustomerSchema,
  dzPhone,
  updateCustomerSchema,
  updateOrderSchema,
} from "../index";

/**
 * S03c-12: the API schemas used a strict `/^0[5-7]\d{8}$/` with no
 * normalisation, so "+213555123456", "00213555123456" and the nine digits a
 * spreadsheet leaves after stripping the leading zero were rejected, while the
 * UI helpers (`normalizeDZPhone`) accept them. The schema now normalises
 * first and still outputs, and still checks, the strict local form.
 */

const INVALID_MESSAGE = "Invalid Algerian phone (must be 0[5-7]XXXXXXXX)";

describe("dzPhone accepts every common spelling of one number (S03c-12)", () => {
  const spellings: Array<[string, string]> = [
    ["0555123456", "0555123456"],
    ["+213555123456", "0555123456"],
    ["+213 555 12 34 56", "0555123456"],
    ["+(213) 555 12 34 56", "0555123456"],
    ["00213555123456", "0555123456"],
    ["213555123456", "0555123456"],
    ["0555 12 34 56", "0555123456"],
    ["05 55 12 34 56", "0555123456"],
    ["05-55-12-34-56", "0555123456"],
    ["0555.12.34.56", "0555123456"],
    // Nine digits: a spreadsheet dropped the leading zero.
    ["555123456", "0555123456"],
    ["  0555123456  ", "0555123456"],
    ["+213660123456", "0660123456"],
    ["00213770123456", "0770123456"],
  ];

  for (const [input, expected] of spellings) {
    it(`parses ${JSON.stringify(input)} to ${expected}`, () => {
      const result = dzPhone.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).toBe(expected);
    });
  }
});

describe("dzPhone still rejects garbage (S03c-12)", () => {
  const rejected = [
    "0855123456", // 08 is not a mobile prefix
    "0955123456", // neither is 09
    "0412345678",
    "abc",
    "not-a-phone",
    "",
    "   ",
    "05551234", // too short
    "055512345678", // too long
    "+21385512345",
    "+33612345678", // a foreign number must not be coerced into a local one
    // Nine digits in total after a "+" of another country: the bare-digit rule
    // would otherwise turn them into a valid-looking LOCAL number, and a
    // WhatsApp message would later go to the wrong person.
    "+60 1234567",
    "+601234567",
    "+555123456",
    "+0555123456",
    "abc0555123456", // letters are rejected, not silently stripped
    "0555123456x",
    "0555123456; DROP TABLE",
  ];

  for (const input of rejected) {
    it(`rejects ${JSON.stringify(input)} with the unchanged message`, () => {
      const result = dzPhone.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(INVALID_MESSAGE);
      }
    });
  }

  it("still rejects non-string input", () => {
    expect(dzPhone.safeParse(undefined).success).toBe(false);
    expect(dzPhone.safeParse(null).success).toBe(false);
    expect(dzPhone.safeParse(555123456).success).toBe(false);
  });
});

describe("schemas that embed dzPhone keep their optional/nullable behaviour", () => {
  it("createCustomerSchema normalises phone and phone2", () => {
    const parsed = createCustomerSchema.parse({
      name: "Nadia",
      phone: "+213555123456",
      phone2: "00213666123456",
    });
    expect(parsed.phone).toBe("0555123456");
    expect(parsed.phone2).toBe("0666123456");
  });

  it("createCustomerSchema keeps phone2 null or absent as given", () => {
    expect(
      createCustomerSchema.parse({ name: "A", phone: "0555123456", phone2: null }).phone2,
    ).toBeNull();
    expect(
      createCustomerSchema.parse({ name: "A", phone: "0555123456" }).phone2,
    ).toBeUndefined();
  });

  it("createCustomerSchema still requires a valid phone", () => {
    expect(createCustomerSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ name: "A", phone: "0855123456" }).success).toBe(false);
    expect(
      createCustomerSchema.safeParse({ name: "A", phone: "0555123456", phone2: "abc" }).success,
    ).toBe(false);
  });

  it("updateCustomerSchema stays partial and normalises when a phone is sent", () => {
    expect(updateCustomerSchema.parse({})).toEqual({});
    expect(updateCustomerSchema.parse({ phone: "555123456" }).phone).toBe("0555123456");
    expect(updateCustomerSchema.safeParse({ phone: "0855123456" }).success).toBe(false);
  });

  it("updateOrderSchema normalises an optional phone", () => {
    expect(updateOrderSchema.parse({ phone: "+213555123456" }).phone).toBe("0555123456");
    expect(updateOrderSchema.parse({}).phone).toBeUndefined();
    expect(updateOrderSchema.safeParse({ phone: "05551234" }).success).toBe(false);
  });

  it("keeps the inferred input and output types as plain strings", () => {
    // Compile-time check (tsc in CI): a z.preprocess here would widen the
    // input type to `unknown` and break react-hook-form resolvers.
    expectTypeOf<z.input<typeof dzPhone>>().toEqualTypeOf<string>();
    expectTypeOf<z.output<typeof dzPhone>>().toEqualTypeOf<string>();
    expectTypeOf<z.input<typeof createCustomerSchema>["phone"]>().toEqualTypeOf<string>();
    expectTypeOf<z.output<typeof createCustomerSchema>["phone"]>().toEqualTypeOf<string>();
  });
});
