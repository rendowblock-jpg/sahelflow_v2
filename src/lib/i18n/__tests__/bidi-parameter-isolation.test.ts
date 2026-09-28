import { describe, expect, it } from "vitest";

import { renderTranslation, stabilizeBidiText } from "@/lib/i18n";
import arTranslations from "@/lib/i18n/locales/ar.json";

const LRI = "⁦";
const FSI = "⁨";
const PDI = "⁩";

function strip(value: string): string {
  return value.replace(/[⁦⁨⁩]/g, "");
}

/**
 * Seller data interpolated into Arabic copy must render as one intact unit.
 *
 * Regression: `stabilizeBidiText` ran AFTER interpolation and isolated every
 * ASCII word on its own, so the Arabic low-stock alert for the seeded product
 * "Miroir Mural Décoratif" rendered as "coratifDé Mural Miroir" — word order
 * reversed by the RTL paragraph and the word broken at the accented letter.
 */
describe("Arabic interpolated value isolation", () => {
  const template = arTranslations["notif.lowStock.title"];

  it("inserts a multi-word accented Latin name as one first-strong isolate", () => {
    const rendered = renderTranslation(
      template,
      { name: "Miroir Mural Décoratif" },
      "ar",
    );
    expect(rendered).toContain(`${FSI}Miroir Mural Décoratif${PDI}`);
    expect(rendered).not.toContain(`${LRI}Miroir${PDI}`);
    expect(strip(rendered)).toBe(
      template.replace("{{name}}", "Miroir Mural Décoratif"),
    );
  });

  it("keeps Arabic and mixed seller values intact", () => {
    expect(
      renderTranslation("تم التعيين لـ {name}", { name: "سمير" }, "ar"),
    ).toBe(`تم التعيين لـ ${FSI}سمير${PDI}`);
    const mixed = renderTranslation(
      template,
      { name: "Power Bank 20000mAh" },
      "ar",
    );
    expect(mixed).toContain(`${FSI}Power Bank 20000mAh${PDI}`);
  });

  it("still stabilizes the product's own Latin copy and ranges", () => {
    const rendered = renderTranslation(
      "متوسط القطاع 25-40% عبر WhatsApp Business اليوم {{count}}",
      { count: 3 },
      "ar",
    );
    expect(rendered).toContain(`${LRI}25-40%${PDI}`);
    expect(rendered).toContain(`${LRI}WhatsApp Business${PDI}`);
    expect(rendered).toContain(`${FSI}3${PDI}`);
  });

  it("never rewrites placeholders while stabilizing a template", () => {
    expect(stabilizeBidiText("الطلب {{orderNumber}} جاهز", "ar")).toBe(
      "الطلب {{orderNumber}} جاهز",
    );
    expect(stabilizeBidiText("{count} تصنيفات", "ar")).toBe("{count} تصنيفات");
  });

  it("leaves French and English output free of directional controls", () => {
    expect(
      renderTranslation("Low stock: {{name}}", { name: "Miroir Mural Décoratif" }, "en"),
    ).toBe("Low stock: Miroir Mural Décoratif");
    expect(
      renderTranslation("{count} catégories", { count: 4 }, "fr"),
    ).toBe("4 catégories");
  });
});
