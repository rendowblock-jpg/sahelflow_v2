import { describe, expect, it } from "vitest";

import { whatsappHref } from "../storefront-parts";

// A store owner on an Arabic keyboard types the contact number in Arabic-Indic
// (U+0660-0669) or Eastern (U+06F0-06F9) digits. They used to be stripped by
// \D, which left a blank https://wa.me/ link.
describe("storefront whatsappHref (PB-PHONE-FOLLOWUPS)", () => {
  it("keeps the ASCII results", () => {
    expect(whatsappHref("0555123456")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("05 55 12 34 56")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("+213 555 12 34 56")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("213555123456")).toBe("https://wa.me/213555123456");
  });

  it("reads Arabic-Indic and Eastern Arabic-Indic digits", () => {
    expect(whatsappHref("٠٥٥٥١٢٣٤٥٦")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("۰۵۵۵۱۲۳۴۵۶")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("+٢١٣ ٥٥٥ ١٢ ٣٤ ٥٦")).toBe("https://wa.me/213555123456");
  });

  it("never returns the leading 0 or a '+' after wa.me/", () => {
    expect(whatsappHref("00213555123456")).toBe("https://wa.me/213555123456");
    expect(whatsappHref("+213 (0) 555 12 34 56")).toBe("https://wa.me/213555123456");
  });

  it("keeps a foreign contact number as international digits", () => {
    expect(whatsappHref("+33 6 12 34 56 78")).toBe("https://wa.me/33612345678");
  });
});
