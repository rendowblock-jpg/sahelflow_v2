import { describe, expect, it } from "vitest";

import { getTranslations } from "@/lib/i18n";
import { translateValidationMessage } from "@/lib/i18n/validation-messages";

const tFor = (locale: "ar" | "fr" | "en") => (key: string) =>
  getTranslations(locale)[key] ?? key;

describe("form validation messages", () => {
  it("renders schema messages in the seller's language", () => {
    expect(translateValidationMessage("Commune is required", tFor("fr"))).toBe(
      "Choisissez une commune.",
    );
    expect(translateValidationMessage("Commune is required", tFor("ar"))).toBe("اختر البلدية.");
    expect(
      translateValidationMessage("Expected number, received nan", tFor("ar")),
    ).toBe("أدخل رقمًا.");
    // zod v4 default wording
    expect(
      translateValidationMessage("Too small: expected string to have >=1 characters", tFor("ar")),
    ).toBe("هذا الحقل مطلوب.");
    expect(
      translateValidationMessage("Invalid input: expected number, received NaN", tFor("fr")),
    ).toBe("Saisissez un nombre.");
  });

  it("has every catalog key in all three locales and leaves unknown text alone", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      const t = tFor(locale);
      for (const message of ["Wilaya is required", "Phone is required", "Required"]) {
        expect(translateValidationMessage(message, t)).not.toMatch(/^validation\./);
      }
    }
    expect(translateValidationMessage("Prix déjà appliqué", tFor("fr"))).toBe(
      "Prix déjà appliqué",
    );
  });
});
