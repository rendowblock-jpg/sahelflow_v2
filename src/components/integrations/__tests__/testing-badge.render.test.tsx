/**
 * @vitest-environment happy-dom
 */
/** The "in testing" chip: calm, three languages, says in one sentence what it means, and follows the registry. */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { TestingBadge } from "../testing-badge";

const harness = vi.hoisted(() => ({
  locale: "en" as "en" | "fr" | "ar",
  status: null as null | "live" | "testing" | "planned",
}));

vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: resolve } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => resolve(harness.locale, key) ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});

vi.mock("@/lib/integrations/certification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/certification")>();
  return { ...actual, integrationStatus: (id: never) => harness.status ?? actual.integrationStatus(id) };
});

afterEach(() => {
  cleanup();
  harness.status = null;
});

const WORDS = { en: "In testing", fr: "En test", ar: "قيد الاختبار" } as const;
const MEANING = {
  en: "Not yet run against a real account; we are testing it.",
  fr: "Pas encore essayé sur un vrai compte ; nous le testons.",
  ar: "لم يُجرَّب بعد على حساب حقيقي؛ ونحن نختبره.",
} as const;

describe("TestingBadge", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`shows the existing first-run word and a one-sentence meaning (${locale})`, () => {
      harness.locale = locale;
      render(<TestingBadge integration="yalidine" />);
      const chip = screen.getByRole("note");
      expect(chip.textContent).toBe(WORDS[locale]);
      expect(chip.getAttribute("aria-label")).toBe(MEANING[locale]);
      expect(chip.getAttribute("title")).toBe(MEANING[locale]);
      if (locale === "ar") expect(chip.textContent).toMatch(/[\u0600-\u06FF]/);
    });
  }

  it("is a quiet chip: dashed paper-style border and muted text, no warning colour", () => {
    render(<TestingBadge integration="shopify" />);
    const cls = screen.getByRole("note").className;
    expect(cls).toContain("border-dashed");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).not.toMatch(/destructive|warning|red-|amber-|yellow-/);
  });

  it("disappears when the registry says the integration is live", () => {
    harness.status = "live";
    const { container } = render(<TestingBadge integration="yalidine" />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("shows for every integration the registry still lists as in testing", () => {
    harness.status = "testing";
    render(<TestingBadge integration="meta" />);
    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("an explicit status wins over the registry (used by callers that already know it)", () => {
    harness.status = "testing";
    const { container } = render(<TestingBadge integration="meta" status="live" />);
    expect(container.textContent).toBe("");
  });
});
