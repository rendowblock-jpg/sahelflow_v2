import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { stabilizeBidiText } from "../index";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("locale transition authority", () => {
  it("refreshes the current server tree while keeping hard reload recovery-only", () => {
    const hook = source("../../../hooks/use-i18n.ts");

    expect(hook).toContain('import { useRouter } from "next/navigation";');
    expect(hook).toContain("requestLocale(newLocale);");
    expect(hook).toContain("commitLocale(newLocale);");
    expect(hook).toContain("router.refresh();");
    expect(hook).toContain("LOCALE_REFRESH_FALLBACK_MS");
    expect(hook).toContain("window.location.reload();");
    expect(hook).toContain('root.dataset.localeTransition = "pending";');
    expect(hook.indexOf("requestLocale(newLocale);")).toBeLessThan(
      hook.indexOf("commitLocale(newLocale);"),
    );
    expect(hook.indexOf("commitLocale(newLocale);")).toBeLessThan(
      hook.indexOf("router.refresh();"),
    );
  });

  it("keeps cookie request authority, commits live geometry immediately, and reconciles server state before paint", () => {
    const uiStore = source("../../../stores/ui-store.ts");
    const provider = source("../server-locale-context.tsx");

    expect(uiStore).toContain("sahelflow-locale=${locale}");
    expect(uiStore).toContain("applyDocumentLocale(locale)");
    expect(uiStore).toContain("recovery-only");
    expect(provider).toContain("useLayoutEffect");
    expect(provider).toContain("commitLocale(locale);");
    expect(provider).toContain("root.dataset.localeTarget === locale");
  });
});

describe("Arabic bidi stability", () => {
  const LRI = "\u2066";
  const PDI = "\u2069";

  it("isolates percentage ranges without mutating Arabic sentence copy", () => {
    const sourceText =
      "المقياس الأول للدفع عند الاستلام. متوسط القطاع 25-40%؛ الأفضل 8-15%.";
    const result = stabilizeBidiText(sourceText, "ar");

    expect(result).toContain(`${LRI}25-40%${PDI}`);
    expect(result).toContain(`${LRI}8-15%${PDI}`);
    expect(result.replaceAll(LRI, "").replaceAll(PDI, "")).toBe(sourceText);
  });

  it("isolates technical ids and provider names inside Arabic copy", () => {
    const result = stabilizeBidiText(
      "المسار DZ-DEMO-0001 يستخدم Gemini API الآن.",
      "ar",
    );

    expect(result).toContain(`${LRI}DZ-DEMO-0001${PDI}`);
    expect(result).toContain(`${LRI}Gemini${PDI}`);
    expect(result).toContain(`${LRI}API${PDI}`);
  });

  it("leaves non-Arabic locale text unchanged", () => {
    const sourceText = "Sector average 25-40%; best 8-15%.";
    expect(stabilizeBidiText(sourceText, "en")).toBe(sourceText);
    expect(stabilizeBidiText(sourceText, "fr")).toBe(sourceText);
  });
});
