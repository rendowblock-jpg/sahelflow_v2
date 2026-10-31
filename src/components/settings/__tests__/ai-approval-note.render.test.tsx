/**
 * @vitest-environment happy-dom
 */
/** The AI settings page tells the seller, in all three languages, that nothing is sent without their approval. */
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

import { AiApprovalNote } from "../ai-approval-note";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));

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

afterEach(cleanup);

describe("AiApprovalNote", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`says the seller approves before anything is sent (${locale})`, () => {
      harness.locale = locale;
      render(<AiApprovalNote />);
      const note = screen.getByRole("note");
      const expected = getRuntimeTranslation(locale, "settings.aiApproval.note");
      expect(expected).toBeTruthy();
      expect(note.textContent).toBe(expected);
      if (locale === "ar") expect(note.textContent).toMatch(/[\u0600-\u06FF]/);
    });
  }
});
