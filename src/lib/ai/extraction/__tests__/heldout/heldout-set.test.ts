import { describe, expect, it } from "vitest";
import { HELDOUT_SET, HELDOUT_SET_VERSION } from "./heldout-set";

const FAKE_PHONE = /^0(550|661|770|555)00\d{4}$/;

/** Digits of a message with Arabic-Indic digits folded and +213 / 00213 turned into 0. */
function digitsOf(text: string): string {
  const ascii = text.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  return ascii.replace(/(\+|00)213\s*/g, "0").replace(/\D/g, "").replace(/^0{2}/, "0");
}

describe("held-out set integrity", () => {
  it("is big enough and versioned", () => {
    expect(HELDOUT_SET_VERSION).toBe("heldout-1.0.0");
    expect(HELDOUT_SET.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique ids and texts", () => {
    expect(new Set(HELDOUT_SET.map((e) => e.id)).size).toBe(HELDOUT_SET.length);
    expect(new Set(HELDOUT_SET.map((e) => e.text)).size).toBe(HELDOUT_SET.length);
  });

  it("covers every shape the brief names", () => {
    const groups = new Set(HELDOUT_SET.map((e) => e.group));
    for (const g of ["ar", "latin", "fr", "phone-format", "wilaya-alias", "hostile"]) expect(groups.has(g)).toBe(true);
    const noOrder = HELDOUT_SET.filter((e) => !e.expected.isOrder).length;
    expect(noOrder).toBeGreaterThanOrEqual(20);
    const multi = HELDOUT_SET.filter((e) => (e.expected.items?.length ?? 0) >= 2).length;
    expect(multi).toBeGreaterThanOrEqual(10);
    const withTotal = HELDOUT_SET.filter((e) => e.expected.totalPrice !== undefined).length;
    expect(withTotal).toBeGreaterThanOrEqual(10);
    const withCommune = HELDOUT_SET.filter((e) => e.expected.commune !== undefined).length;
    expect(withCommune).toBeGreaterThanOrEqual(6);
    const canonical = new Set(HELDOUT_SET.map((e) => e.expected.wilaya).filter(Boolean));
    expect(canonical.size).toBeGreaterThanOrEqual(40);
    expect(HELDOUT_SET.some((e) => e.text.includes("<script>"))).toBe(true);
    expect(HELDOUT_SET.some((e) => /zouj|جوج|زوج/.test(e.text))).toBe(true);
  });

  it("uses only fake phone numbers, and every labelled phone is really in its text", () => {
    for (const e of HELDOUT_SET) {
      if (e.expected.phone === undefined) continue;
      expect(e.expected.phone, e.id).toMatch(FAKE_PHONE);
      expect(digitsOf(e.text), e.id).toContain(e.expected.phone);
    }
  });

  it("no order carries fields it cannot have, and every order has something to read", () => {
    for (const e of HELDOUT_SET) {
      if (!e.expected.isOrder) {
        expect(e.expected.items, e.id).toBeUndefined();
        expect(e.expected.totalPrice, e.id).toBeUndefined();
      } else {
        expect(e.expected.items?.length ?? 0, e.id).toBeGreaterThan(0);
        for (const item of e.expected.items ?? []) expect(item.quantity, e.id).toBeGreaterThan(0);
      }
    }
  });
});
