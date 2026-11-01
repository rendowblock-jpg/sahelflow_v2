import type { ReactNode } from "react";

import type { Locale } from "@/lib/i18n";
import { hasArabic, splitArabicRuns } from "@/lib/inbox/text-language";

/**
 * Text of a customer or seller, with each run of Arabic words tagged lang="ar"
 * on a French or English page (an Arabic page already says so on <html>). The
 * words are not changed, only wrapped, so copy, search and the screen reader
 * read the same text. No spacing between letters inside the tagged run.
 */
export function ArabicRuns({ text, locale }: { text: string; locale: Locale }): ReactNode {
  if (locale === "ar" || !hasArabic(text)) return text;
  const runs = splitArabicRuns(text);
  if (!runs.some((run) => run.arabic)) return text;
  return runs.map((run, index) =>
    run.arabic ? (
      <span key={index} lang="ar" className="tracking-normal">
        {run.text}
      </span>
    ) : (
      run.text
    ),
  );
}
